from __future__ import annotations

import json
import random
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.database import get_db
from models.adventure import AdventureRun, AdventureTurn
from models.campaign import Campaign
from models.character import Character
from models.character_collaborator import CharacterCollaborator, CollaboratorPermission
from models.user import User
from routes.campaigns import check_campaign_access
from schemas.adventure import (
    AdventureEvent,
    AdventureGetResponse,
    AdventureStartRequest,
    AdventureStartResponse,
    AdventureStateSummary,
    AdventureStepRequest,
    AdventureStepResponse,
    AdventureTurnResponse,
)
from utils.auth import get_current_active_user
from utils.narration_provider import get_narration_provider

# Module support
try:
    from data.modules import get_module
except ImportError:
    def get_module(name: str):
        return None

router = APIRouter(prefix="/adventure", tags=["adventure"])


# -----------------------------------------------------------------------------
# Mechanics helpers (simple, deterministic)
# -----------------------------------------------------------------------------

XP_THRESHOLDS = [
    # Level 1..20 thresholds (D&D 5e-ish). Index = level, value = min XP for that level.
    0,      # placeholder for level 0
    0,      # 1
    300,    # 2
    900,    # 3
    2700,   # 4
    6500,   # 5
    14000,  # 6
    23000,  # 7
    34000,  # 8
    48000,  # 9
    64000,  # 10
    85000,  # 11
    100000, # 12
    120000, # 13
    140000, # 14
    165000, # 15
    195000, # 16
    225000, # 17
    265000, # 18
    305000, # 19
    355000, # 20
]


def _ability_mod(score: int) -> int:
    try:
        return (int(score) - 10) // 2
    except Exception:
        return 0


def _seeded_rng(seed: str, salt: str) -> random.Random:
    return random.Random(f"{seed}:{salt}")


def _maze_neighbors(seed: str, w: int, h: int) -> dict[str, list[str]]:
    """
    Generate a perfect maze adjacency map using a seeded randomized DFS.
    Keys are "x,y" strings, values are neighbor "x,y" strings.
    """
    rng = _seeded_rng(seed, f"maze:{w}x{h}")
    total = w * h
    visited = [False] * total
    edges: dict[int, set[int]] = {i: set() for i in range(total)}

    def idx(x: int, y: int) -> int:
        return y * w + x

    def coords(i: int) -> tuple[int, int]:
        return (i % w, i // w)

    stack = [0]
    visited[0] = True

    while stack:
        cur = stack[-1]
        x, y = coords(cur)
        candidates: list[int] = []
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                ni = idx(nx, ny)
                if not visited[ni]:
                    candidates.append(ni)
        if not candidates:
            stack.pop()
            continue
        nxt = rng.choice(candidates)
        edges[cur].add(nxt)
        edges[nxt].add(cur)
        visited[nxt] = True
        stack.append(nxt)

    out: dict[str, list[str]] = {}
    for i in range(total):
        x, y = coords(i)
        key = f"{x},{y}"
        out[key] = [f"{coords(n)[0]},{coords(n)[1]}" for n in sorted(edges[i])]
    return out


def _room_flavor(seed: str, pos: str, *, theme: str | None = None) -> str:
    rng = _seeded_rng(seed, f"room:{pos}:{theme or ''}")
    moods = ["damp", "dusty", "echoing", "cramped", "windy", "warm", "cold", "torchlit", "gloomy"]
    features = [
        "rough-hewn stone walls",
        "a low ceiling",
        "a puddle reflecting faint light",
        "scratches on the floor",
        "a distant drip-drip sound",
        "a draft that smells of pine",
        "old chalk marks",
        "a collapsed section of brick",
        "a threadbare tapestry fragment",
    ]
    mood = rng.choice(moods)
    feat = rng.choice(features)
    if theme:
        return f"A {mood} chamber with {feat}. The vibe is unmistakably {theme}."
    return f"A {mood} chamber with {feat}."


def _room_item(seed: str, pos: str) -> str | None:
    rng = _seeded_rng(seed, f"item:{pos}")
    roll = rng.random()
    if roll < 0.18:
        return rng.choice(["torch", "rope", "healing potion", "rusty key", "coin pouch"])
    return None


def _parse_action(action_text: str) -> tuple[str, str]:
    raw = (action_text or "").strip()
    low = raw.lower()
    if low in ("n", "north"):
        return ("move", "north")
    if low in ("s", "south"):
        return ("move", "south")
    if low in ("e", "east"):
        return ("move", "east")
    if low in ("w", "west"):
        return ("move", "west")
    if low in ("look", "l", "examine"):
        return ("look", "")
    if low.startswith("take "):
        return ("take", raw[5:].strip())
    if low.startswith("use "):
        return ("use", raw[4:].strip())
    if low in ("inventory", "inv", "i"):
        return ("inventory", "")
    if low in ("rest", "sleep"):
        return ("rest", "")
    if low in ("attack", "hit", "fight"):
        return ("attack", "")
    return ("say", raw)


def _apply_leveling(character: Character) -> None:
    xp = int(character.experience_points or 0)
    lvl = int(character.level or 1)
    while lvl < 20 and xp >= XP_THRESHOLDS[lvl + 1]:
        lvl += 1
    character.level = lvl


def _state_summary(adventure: AdventureRun, state: dict) -> AdventureStateSummary:
    module_id = state.get("module")
    area_name = None
    if module_id:
        module_data = get_module(module_id)
        if module_data:
            pos = str(state.get("pos") or "exterior")
            area = module_data.get("areas", {}).get(pos, {})
            area_name = area.get("name")
    
    return AdventureStateSummary(
        adventure_id=adventure.id,
        character_id=adventure.character_id,
        campaign_id=adventure.campaign_id,
        seed=str(state.get("seed") or adventure.seed),
        position=str(state.get("pos") or "0,0"),
        area_name=area_name,
        module=module_id,
        hp=int(state.get("hp") or 0),
        hp_max=int(state.get("hp_max") or 0),
        xp=int(state.get("xp") or 0),
        level=int(state.get("level") or 1),
        inventory=list(state.get("inventory") or []),
    )


def _load_state(adventure: AdventureRun) -> dict:
    try:
        parsed = json.loads(adventure.state_json or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _dump_state(state: dict) -> str:
    return json.dumps(state, ensure_ascii=False)


def _require_editable_character(db: Session, *, character_id: int, user: User) -> Character:
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    if character.owner_id == user.id:
        return character

    collab = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.character_id == character_id,
        CharacterCollaborator.user_id == user.id,
        CharacterCollaborator.permission == CollaboratorPermission.EDIT,
    ).first()
    if collab:
        return character

    raise HTTPException(status_code=403, detail="Not authorized to use this character")


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------


@router.post("/start", response_model=AdventureStartResponse, status_code=status.HTTP_201_CREATED)
def start_adventure(
    req: AdventureStartRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    character = _require_editable_character(db, character_id=req.character_id, user=current_user)

    campaign_id = req.campaign_id
    if campaign_id is not None:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if not check_campaign_access(campaign_id, current_user, db):
            raise HTTPException(status_code=403, detail="Not authorized to access this campaign")
        if character.campaign_id != campaign_id:
            raise HTTPException(
                status_code=400,
                detail="Character is not in that campaign (character.campaign_id mismatch)",
            )

    seed = (req.seed or "").strip() or uuid4().hex
    module_id = (req.module or "").strip() or None
    module_data = get_module(module_id) if module_id else None

    # Module-based adventure
    if module_data:
        start_pos = module_data.get("starting_area", "exterior")
        area = module_data.get("areas", {}).get(start_pos, {})
        fast_mode = req.fast_mode
        
        state = {
            "seed": seed,
            "module": module_id,
            "pos": start_pos,
            "discovered": [start_pos],
            "taken": [],
            "inventory": [],
            "defeated_monsters": [],
            "opened_containers": [],
            "hp": int(character.hit_points_current or 0),
            "hp_max": int(character.hit_points_max or 0),
            "xp": int(character.experience_points or 0),
            "level": int(character.level or 1),
            "theme": module_data.get("theme"),
            "fast_mode": fast_mode,
        }

        adventure = AdventureRun(
            owner_id=current_user.id,
            campaign_id=campaign_id,
            character_id=character.id,
            seed=seed,
            state_json=_dump_state(state),
        )
        db.add(adventure)
        db.commit()
        db.refresh(adventure)

        area_name = area.get("name", start_pos)
        area_desc = area.get("description", "You find yourself in an unfamiliar place.")
        exits = list(area.get("exits", {}).keys())
        items = area.get("items", [])
        monsters = area.get("monsters", [])

        system_prompt = (
            f"You are a D&D dungeon master running '{module_data.get('name', 'an adventure')}'. "
            f"Setting: {module_data.get('description', '')} "
            "Be atmospheric and evocative - this is science fantasy horror. "
            "Never invent stat changes; the backend handles mechanics. "
            "Return ONLY JSON with keys: narration (string), suggested_actions (string array)."
        )
        
        monster_info = ""
        if monsters:
            monster_names = [module_data.get("monsters", {}).get(m, {}).get("name", m) for m in monsters]
            monster_info = f"\nDANGER: {', '.join(monster_names)} may be present here."
        
        user_prompt = (
            f"NEW ADVENTURE START - {module_data.get('name', 'Adventure')}\n"
            f"Background: {module_data.get('background', '')[:500]}\n\n"
            f"Character: {character.name} (level {state['level']} {character.race} {character.character_class})\n"
            f"HP: {state['hp']}/{state['hp_max']}, XP: {state['xp']}\n\n"
            f"LOCATION: {area_name}\n"
            f"{area_desc}\n"
            f"{monster_info}\n"
            f"Available exits: {exits}\n"
            f"Items visible: {items if items else 'none obvious'}\n\n"
            f"Present the scene dramatically. Suggest 4-6 actions the player could take.\n"
        )

        narration = f"**{area_name}**\n\n{area_desc}"
        suggested_actions = exits[:4] + ["look", "inventory"]
        
        if not fast_mode:
            try:
                provider = get_narration_provider()
                res = provider.narrate_json(system_prompt=system_prompt, user_prompt=user_prompt)
                narration = res.narration or narration
                suggested_actions = res.suggested_actions or suggested_actions
            except Exception:
                pass

        turn = AdventureTurn(
            adventure_id=adventure.id,
            turn_index=0,
            player_action="start",
            dm_text=narration,
            created_at=datetime.utcnow(),
        )
        db.add(turn)
        db.commit()

        return AdventureStartResponse(
            adventure_id=adventure.id,
            state_summary=_state_summary(adventure, state),
            narration=narration,
            suggested_actions=suggested_actions,
        )

    # Procedural maze adventure (original behavior)
    fast_mode = req.fast_mode
    w, h = 5, 5
    neighbors = _maze_neighbors(seed, w, h)

    start_pos = "0,0"
    discovered = [start_pos]
    item = _room_item(seed, start_pos)
    taken: list[str] = []
    if item:
        # item exists in room until taken; tracked via "taken" list
        pass

    state = {
        "seed": seed,
        "w": w,
        "h": h,
        "pos": start_pos,
        "discovered": discovered,
        "taken": taken,
        "inventory": [],
        # Mirror character core stats (we also update the character row).
        "hp": int(character.hit_points_current or 0),
        "hp_max": int(character.hit_points_max or 0),
        "xp": int(character.experience_points or 0),
        "level": int(character.level or 1),
        "theme": (req.theme or "").strip() or None,
        "fast_mode": fast_mode,
    }

    adventure = AdventureRun(
        owner_id=current_user.id,
        campaign_id=campaign_id,
        character_id=character.id,
        seed=seed,
        state_json=_dump_state(state),
    )
    db.add(adventure)
    db.commit()
    db.refresh(adventure)

    exits = []
    for nb in neighbors.get(start_pos, []):
        exits.append(nb)

    room_desc = _room_flavor(seed, start_pos, theme=state.get("theme"))
    room_item = _room_item(seed, start_pos)
    item_line = f"You spot: {room_item}." if room_item else "You spot nothing obviously useful."

    system_prompt = (
        "You are a concise D&D dungeon master for a Zork-like text adventure. "
        "Be vivid but brief. Never invent stats changes; the backend is the source of truth. "
        "Return ONLY JSON with keys: narration (string), suggested_actions (string array)."
    )
    user_prompt = (
        f"NEW ADVENTURE START\n"
        f"Character: {character.name} (level {state['level']} {character.race} {character.character_class})\n"
        f"HP: {state['hp']}/{state['hp_max']}, XP: {state['xp']}\n"
        f"Room: {start_pos}\n"
        f"RoomFacts: {room_desc} {item_line}\n"
        f"ExitsTo: {exits}\n"
        f"PlayerAction: start\n"
        f"Result: The adventure begins. Present the room and give 3-6 action suggestions.\n"
    )

    narration = f"{room_desc} {item_line}"
    suggested_actions: list[str] = ["look", "north", "south", "east", "west"]
    
    if not fast_mode:
        try:
            provider = get_narration_provider()
            res = provider.narrate_json(system_prompt=system_prompt, user_prompt=user_prompt)
            narration = res.narration or narration
            suggested_actions = res.suggested_actions or suggested_actions
        except Exception:
            # Fail open: still playable without AI
            pass

    turn = AdventureTurn(
        adventure_id=adventure.id,
        turn_index=0,
        player_action="start",
        dm_text=narration,
        created_at=datetime.utcnow(),
    )
    db.add(turn)
    db.commit()

    return AdventureStartResponse(
        adventure_id=adventure.id,
        state_summary=_state_summary(adventure, state),
        narration=narration,
        suggested_actions=suggested_actions,
    )


def _handle_module_step(
    adventure: AdventureRun,
    character: Character,
    state: dict,
    action_text: str,
    next_turn_index: int,
    current_user: User,
) -> tuple[str, list[AdventureEvent], dict]:
    """Handle a step in a module-based adventure. Returns (result_line, events, updated_state)."""
    module_id = state.get("module")
    module_data = get_module(module_id)
    if not module_data:
        return "Module data not found.", [], state

    pos = str(state.get("pos") or "exterior")
    area = module_data.get("areas", {}).get(pos, {})
    seed = str(state.get("seed") or adventure.seed)
    
    inventory: list[str] = list(state.get("inventory") or [])
    discovered: list[str] = list(state.get("discovered") or [])
    taken: list[str] = list(state.get("taken") or [])
    defeated_monsters: list[str] = list(state.get("defeated_monsters") or [])
    opened_containers: list[str] = list(state.get("opened_containers") or [])

    hp = int(state.get("hp") or character.hit_points_current or 0)
    hp_max = int(state.get("hp_max") or character.hit_points_max or 0)
    xp = int(state.get("xp") or character.experience_points or 0)

    events: list[AdventureEvent] = []
    result_line = ""
    rng = _seeded_rng(seed, f"turn:{next_turn_index}:{pos}")

    raw_action = action_text.strip().lower()
    exits = area.get("exits", {})
    area_items = area.get("items", [])
    area_monsters = area.get("monsters", [])

    # Check for exit commands (module exits are like "enter hole", "climb balcony", etc.)
    matched_exit = None
    for exit_name, target_area in exits.items():
        if raw_action == exit_name.lower() or raw_action in exit_name.lower().split():
            matched_exit = (exit_name, target_area)
            break
    
    # Also handle cardinal directions as aliases
    cardinal_aliases = {
        "n": "north", "s": "south", "e": "east", "w": "west",
        "u": "up", "d": "down", "out": "out", "back": "back",
    }
    if raw_action in cardinal_aliases:
        raw_action = cardinal_aliases[raw_action]
    
    if not matched_exit:
        for exit_name, target_area in exits.items():
            if raw_action == exit_name.lower():
                matched_exit = (exit_name, target_area)
                break

    if matched_exit:
        exit_name, target_area = matched_exit
        new_area = module_data.get("areas", {}).get(target_area, {})
        if new_area:
            pos = target_area
            if pos not in discovered:
                discovered.append(pos)
                gained = 50  # More XP for module exploration
                xp += gained
                events.append(AdventureEvent(kind="xp_gained", data={"amount": gained, "reason": "exploration"}))
            result_line = f"You {exit_name}. You are now in {new_area.get('name', target_area)}."
        else:
            result_line = f"You try to go that way, but something blocks you."

    elif raw_action in ("look", "l", "examine"):
        area_desc = area.get("description", "You see nothing special.")
        monsters_here = [m for m in area_monsters if f"{pos}:{m}" not in defeated_monsters]
        items_here = [i for i in area_items if f"{pos}:{i}" not in taken]
        
        result_line = f"**{area.get('name', pos)}**\n{area_desc}"
        if monsters_here:
            monster_names = [module_data.get("monsters", {}).get(m, {}).get("name", m) for m in monsters_here]
            result_line += f"\n\n⚠️ DANGER: {', '.join(monster_names)}"
        if items_here:
            item_names = [module_data.get("items", {}).get(i, {}).get("name", i) for i in items_here]
            result_line += f"\n\nYou notice: {', '.join(item_names)}"

    elif raw_action in ("inventory", "inv", "i"):
        if inventory:
            result_line = "You are carrying: " + ", ".join(inventory) + "."
        else:
            result_line = "Your pack is empty."

    elif raw_action.startswith("take "):
        wanted = raw_action[5:].strip()
        items_here = [i for i in area_items if f"{pos}:{i}" not in taken]
        
        # Try to match by item key or item name
        matched_item = None
        for item_key in items_here:
            item_data = module_data.get("items", {}).get(item_key, {})
            item_name = item_data.get("name", item_key).lower()
            if wanted in item_key.lower() or wanted in item_name:
                matched_item = (item_key, item_data)
                break
        
        if not wanted:
            result_line = "Take what?"
        elif not items_here:
            result_line = "There's nothing obvious here to take."
        elif not matched_item:
            result_line = f"You don't see '{wanted}' here."
        else:
            item_key, item_data = matched_item
            taken.append(f"{pos}:{item_key}")
            item_name = item_data.get("name", item_key)
            inventory.append(item_name)
            gained = 25
            xp += gained
            events.append(AdventureEvent(kind="item_taken", data={"item": item_name}))
            events.append(AdventureEvent(kind="xp_gained", data={"amount": gained, "reason": "loot"}))
            result_line = f"You take the {item_name}."
            if item_data.get("description"):
                result_line += f" {item_data['description']}"

    elif raw_action in ("rest", "sleep"):
        heal = rng.randint(1, 6) + max(0, _ability_mod(int(character.constitution or 10)))
        old = hp
        hp = min(hp_max, hp + max(1, heal))
        events.append(AdventureEvent(kind="rest", data={"healed": hp - old}))
        result_line = f"You rest cautiously. (+{hp-old} HP)"

    elif raw_action in ("attack", "fight", "hit"):
        monsters_here = [m for m in area_monsters if f"{pos}:{m}" not in defeated_monsters]
        if not monsters_here:
            result_line = "There's nothing here to attack."
        else:
            monster_key = monsters_here[0]
            monster_data = module_data.get("monsters", {}).get(monster_key, {})
            monster_name = monster_data.get("name", monster_key)
            monster_ac = monster_data.get("ac", 10)
            monster_hp = monster_data.get("hp", 20)
            monster_damage = monster_data.get("damage", "1d6")
            monster_xp = monster_data.get("xp", 100)

            # Simple combat: player attacks, monster retaliates
            to_hit = rng.randint(1, 20) + max(0, _ability_mod(int(character.strength or 10)))
            player_damage = rng.randint(1, 8) + max(0, _ability_mod(int(character.strength or 10)))
            
            if to_hit >= monster_ac:
                # Hit! For simplicity, track accumulated damage in state
                monster_damage_taken = state.get(f"monster_damage:{pos}:{monster_key}", 0) + player_damage
                state[f"monster_damage:{pos}:{monster_key}"] = monster_damage_taken
                
                if monster_damage_taken >= monster_hp:
                    defeated_monsters.append(f"{pos}:{monster_key}")
                    xp += monster_xp
                    events.append(AdventureEvent(kind="monster_defeated", data={"monster": monster_name}))
                    events.append(AdventureEvent(kind="xp_gained", data={"amount": monster_xp, "reason": "combat"}))
                    result_line = f"You strike the {monster_name} for {player_damage} damage! It falls! (+{monster_xp} XP)"
                else:
                    result_line = f"You hit the {monster_name} for {player_damage} damage! It's wounded but still fighting."
            else:
                result_line = f"Your attack misses the {monster_name}!"

            # Monster retaliates if still alive
            if f"{pos}:{monster_key}" not in defeated_monsters:
                monster_to_hit = rng.randint(1, 20)
                player_ac = int(character.armor_class or 10)
                if monster_to_hit >= player_ac:
                    # Parse monster damage (simplified)
                    dmg = rng.randint(1, 8)
                    if "poison" in str(monster_data.get("special", [])).lower():
                        # Poison damage
                        poison_save = rng.randint(1, 20) + max(0, _ability_mod(int(character.constitution or 10)))
                        if poison_save < 15:
                            dmg += rng.randint(1, 6)
                            result_line += f" The {monster_name} strikes back with its poisonous attack!"
                    hp = max(0, hp - dmg)
                    events.append(AdventureEvent(kind="damage", data={"amount": dmg, "source": monster_name}))
                    result_line += f" You take {dmg} damage!"

    elif raw_action.startswith("use "):
        item_name = raw_action[4:].strip()
        match = next((i for i in inventory if item_name in i.lower()), None)
        if not match:
            result_line = f"You don't have '{item_name}'."
        elif "potion" in match.lower() or "healing" in match.lower():
            heal = rng.randint(4, 10)
            old = hp
            hp = min(hp_max, hp + heal)
            inventory.remove(match)
            events.append(AdventureEvent(kind="healed", data={"amount": hp - old}))
            result_line = f"You use the {match}. (+{hp-old} HP)"
        elif "oil" in match.lower():
            result_line = f"You apply the {match}. You feel slippery and hard to grapple."
        else:
            result_line = f"You examine the {match}. It might be useful somewhere specific."

    elif raw_action.startswith("open "):
        container = raw_action[5:].strip()
        result_line = f"You try to open {container}. It may require a key or special action."

    else:
        # Freeform / unknown
        result_line = f'You attempt: "{action_text}". The ancient machine offers no response.'

    # Update state
    state.update({
        "pos": pos,
        "inventory": inventory,
        "discovered": discovered,
        "taken": taken,
        "defeated_monsters": defeated_monsters,
        "opened_containers": opened_containers,
        "hp": int(hp),
        "hp_max": int(hp_max),
        "xp": int(xp),
    })

    return result_line, events, state


@router.post("/{adventure_id}/step", response_model=AdventureStepResponse)
def step_adventure(
    adventure_id: int,
    req: AdventureStepRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    adventure = db.query(AdventureRun).filter(AdventureRun.id == adventure_id).first()
    if not adventure or adventure.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Adventure not found")

    character = _require_editable_character(db, character_id=adventure.character_id, user=current_user)
    state = _load_state(adventure)

    # Determine next turn index
    last_turn = (
        db.query(AdventureTurn)
        .filter(AdventureTurn.adventure_id == adventure.id)
        .order_by(AdventureTurn.turn_index.desc())
        .first()
    )
    next_turn_index = int(last_turn.turn_index + 1) if last_turn else 1

    # Check if this is a module-based adventure
    module_id = state.get("module")
    if module_id:
        module_data = get_module(module_id)
        result_line, events, state = _handle_module_step(
            adventure, character, state, req.action_text, next_turn_index, current_user
        )
        
        pos = state.get("pos", "exterior")
        area = module_data.get("areas", {}).get(pos, {}) if module_data else {}
        exits = list(area.get("exits", {}).keys())
        area_monsters = area.get("monsters", [])
        defeated_monsters = state.get("defeated_monsters", [])
        monsters_here = [m for m in area_monsters if f"{pos}:{m}" not in defeated_monsters]

        # Apply changes to character
        character.hit_points_current = int(state.get("hp", 0))
        character.experience_points = int(state.get("xp", 0))
        _apply_leveling(character)
        state["level"] = int(character.level)
        character.last_updated_by_id = current_user.id

        adventure.state_json = _dump_state(state)
        adventure.updated_at = datetime.utcnow()

        # Build module-aware prompt
        recent_turns = (
            db.query(AdventureTurn)
            .filter(AdventureTurn.adventure_id == adventure.id)
            .order_by(AdventureTurn.turn_index.desc())
            .limit(3)
            .all()
        )
        recent_turns_text = "\n".join(
            [f"- [{t.turn_index}] {t.player_action} -> {t.dm_text[:100]}" for t in reversed(recent_turns)]
        )

        monster_info = ""
        if monsters_here and module_data:
            monster_descs = []
            for m in monsters_here:
                md = module_data.get("monsters", {}).get(m, {})
                monster_descs.append(f"{md.get('name', m)}: {md.get('description', '')[:100]}")
            monster_info = "\nMONSTERS PRESENT:\n" + "\n".join(monster_descs)

        system_prompt = (
            f"You are a D&D dungeon master running '{module_data.get('name', 'an adventure')}' - a science fantasy horror module. "
            "Be atmospheric, evocative, and slightly ominous. Describe the environment vividly. "
            "Never invent stat changes; the backend handles all mechanics. "
            "Return ONLY JSON with keys: narration (string), suggested_actions (string array)."
        )
        user_prompt = (
            f"ADVENTURE STEP\n"
            f"Character: {character.name} (level {character.level} {character.race} {character.character_class})\n"
            f"HP: {state['hp']}/{state['hp_max']}, XP: {state['xp']}\n"
            f"LOCATION: {area.get('name', pos)}\n"
            f"{area.get('description', '')[:600]}\n"
            f"{monster_info}\n"
            f"Available exits: {exits}\n"
            f"Inventory: {state.get('inventory', [])}\n"
            f"RecentTurns:\n{recent_turns_text}\n"
            f"PlayerAction: {req.action_text}\n"
            f"Result: {result_line}\n"
            f"Narrate the result dramatically. Suggest 4-6 concrete actions.\n"
        )

        narration = result_line
        suggested_actions = exits[:4] + ["look", "inventory"]
        if monsters_here:
            suggested_actions.insert(0, "attack")
        
        # Check fast_mode from state or request override
        fast_mode = state.get("fast_mode", False)
        if req.fast_mode is not None:
            fast_mode = req.fast_mode
        
        if not fast_mode:
            try:
                provider = get_narration_provider()
                res = provider.narrate_json(system_prompt=system_prompt, user_prompt=user_prompt)
                narration = res.narration or narration
                suggested_actions = res.suggested_actions or suggested_actions
            except Exception:
                pass

        turn = AdventureTurn(
            adventure_id=adventure.id,
            turn_index=next_turn_index,
            player_action=req.action_text.strip(),
            dm_text=narration,
            created_at=datetime.utcnow(),
        )
        db.add(turn)
        db.add(character)
        db.add(adventure)
        db.commit()

        return AdventureStepResponse(
            adventure_id=adventure.id,
            state_summary=_state_summary(adventure, state),
            narration=narration,
            suggested_actions=suggested_actions,
            events=events,
        )

    # Original procedural maze logic
    seed = str(state.get("seed") or adventure.seed)
    w = int(state.get("w") or 5)
    h = int(state.get("h") or 5)
    pos = str(state.get("pos") or "0,0")
    theme = state.get("theme")
    neighbors = _maze_neighbors(seed, w, h)

    inventory: list[str] = list(state.get("inventory") or [])
    discovered: list[str] = list(state.get("discovered") or [])
    taken: list[str] = list(state.get("taken") or [])

    hp = int(state.get("hp") or character.hit_points_current or 0)
    hp_max = int(state.get("hp_max") or character.hit_points_max or 0)
    xp = int(state.get("xp") or character.experience_points or 0)
    lvl = int(state.get("level") or character.level or 1)

    action_kind, action_arg = _parse_action(req.action_text)
    events: list[AdventureEvent] = []
    result_line = ""

    rng = _seeded_rng(seed, f"turn:{next_turn_index}:{pos}")

    if action_kind == "look":
        room_desc = _room_flavor(seed, pos, theme=theme)
        room_item = _room_item(seed, pos)
        if room_item and f"{pos}:{room_item}" not in taken:
            result_line = f"{room_desc} You notice a {room_item}."
        else:
            result_line = f"{room_desc} You don't see anything new."

    elif action_kind == "inventory":
        if inventory:
            result_line = "You are carrying: " + ", ".join(inventory) + "."
        else:
            result_line = "Your pack is empty."

    elif action_kind == "move":
        # Convert neighbors to direction map
        x, y = [int(p) for p in pos.split(",")]
        dir_map = {
            "north": f"{x},{y-1}",
            "south": f"{x},{y+1}",
            "west": f"{x-1},{y}",
            "east": f"{x+1},{y}",
        }
        target = dir_map.get(action_arg)
        if not target:
            result_line = "You hesitate. That direction doesn't make sense."
        elif target in neighbors.get(pos, []):
            pos = target
            if pos not in discovered:
                discovered.append(pos)
                gained = 25
                xp += gained
                events.append(AdventureEvent(kind="xp_gained", data={"amount": gained, "reason": "exploration"}))
            room_desc = _room_flavor(seed, pos, theme=theme)
            result_line = f"You move {action_arg}. {room_desc}"
        else:
            result_line = f"You try to go {action_arg}, but the way is blocked."

    elif action_kind == "take":
        wanted = action_arg.strip()
        room_item = _room_item(seed, pos)
        if not wanted:
            result_line = "Take what?"
        elif not room_item:
            result_line = "There's nothing here to take."
        elif wanted.lower() != room_item.lower():
            result_line = f"You don't see '{wanted}' here."
        elif f"{pos}:{room_item}" in taken:
            result_line = f"You already took the {room_item}."
        else:
            taken.append(f"{pos}:{room_item}")
            inventory.append(room_item)
            gained = 10
            xp += gained
            events.append(AdventureEvent(kind="item_taken", data={"item": room_item}))
            events.append(AdventureEvent(kind="xp_gained", data={"amount": gained, "reason": "loot"}))
            result_line = f"You take the {room_item}."

    elif action_kind == "use":
        item = action_arg.strip()
        if not item:
            result_line = "Use what?"
        else:
            # very simple: healing potion
            match = next((i for i in inventory if i.lower() == item.lower()), None)
            if not match:
                result_line = f"You don't have '{item}'."
            elif match.lower() == "healing potion":
                heal = rng.randint(4, 10)
                old = hp
                hp = min(hp_max, hp + heal)
                inventory.remove(match)
                events.append(AdventureEvent(kind="healed", data={"amount": hp - old}))
                result_line = f"You drink the potion. You feel steadier (+{hp-old} HP)."
            else:
                result_line = f"You fiddle with the {match}. Nothing obvious happens."

    elif action_kind == "rest":
        heal = rng.randint(1, 6) + max(0, _ability_mod(int(character.constitution or 10)))
        old = hp
        hp = min(hp_max, hp + max(1, heal))
        events.append(AdventureEvent(kind="rest", data={"healed": hp - old}))
        result_line = f"You rest for a moment. (+{hp-old} HP)"

    elif action_kind == "attack":
        # lightweight, single-beat encounter
        to_hit = rng.randint(1, 20) + max(0, _ability_mod(int(character.strength or 10)))
        enemy_ac = 11
        if to_hit >= enemy_ac:
            gained = 15
            xp += gained
            events.append(AdventureEvent(kind="xp_gained", data={"amount": gained, "reason": "combat"}))
            result_line = "You lash out at a lurking creature in the dark. It flees."
        else:
            dmg = rng.randint(1, 4)
            hp = max(0, hp - dmg)
            events.append(AdventureEvent(kind="damage", data={"amount": dmg}))
            result_line = f"You swing wildly. Something bites you (-{dmg} HP)."

    else:
        # Freeform talk / unknown command
        result_line = f'You say: "{action_arg}". The dungeon does not reply.'

    # Apply XP/HP back to character + adventure state (simple "commit now" behavior)
    character.hit_points_current = int(hp)
    character.experience_points = int(xp)
    _apply_leveling(character)
    character.last_updated_by_id = current_user.id

    state.update(
        {
            "pos": pos,
            "inventory": inventory,
            "discovered": discovered,
            "taken": taken,
            "hp": int(hp),
            "hp_max": int(hp_max),
            "xp": int(character.experience_points),
            "level": int(character.level),
        }
    )
    adventure.state_json = _dump_state(state)
    adventure.updated_at = datetime.utcnow()

    # Build prompt with recent turns
    recent_turns = (
        db.query(AdventureTurn)
        .filter(AdventureTurn.adventure_id == adventure.id)
        .order_by(AdventureTurn.turn_index.desc())
        .limit(3)
        .all()
    )
    recent_turns_text = "\n".join(
        [f"- [{t.turn_index}] {t.player_action} -> {t.dm_text[:140]}" for t in reversed(recent_turns)]
    )

    exits = neighbors.get(pos, [])
    room_desc = _room_flavor(seed, pos, theme=theme)
    room_item = _room_item(seed, pos)
    item_line = ""
    if room_item and f"{pos}:{room_item}" not in taken:
        item_line = f"You spot: {room_item}."

    system_prompt = (
        "You are a concise D&D dungeon master for a Zork-like text adventure. "
        "Be vivid but brief. Never invent numeric stat changes; those are already applied. "
        "Return ONLY JSON with keys: narration (string), suggested_actions (string array)."
    )
    user_prompt = (
        f"ADVENTURE STEP\n"
        f"Character: {character.name} (level {character.level} {character.race} {character.character_class})\n"
        f"HP: {state['hp']}/{state['hp_max']}, XP: {state['xp']}\n"
        f"Room: {pos}\n"
        f"RoomFacts: {room_desc} {item_line}\n"
        f"ExitsTo: {exits}\n"
        f"RecentTurns:\n{recent_turns_text}\n"
        f"PlayerAction: {req.action_text}\n"
        f"Result: {result_line}\n"
        f"Respond with JSON. Suggested actions should be concrete commands the player can type.\n"
    )

    narration = result_line
    suggested_actions: list[str] = ["look", "inventory", "north", "south", "east", "west"]
    
    # Check fast_mode from state or request override
    fast_mode = state.get("fast_mode", False)
    if req.fast_mode is not None:
        fast_mode = req.fast_mode
    
    if not fast_mode:
        try:
            provider = get_narration_provider()
            res = provider.narrate_json(system_prompt=system_prompt, user_prompt=user_prompt)
            narration = res.narration or narration
            suggested_actions = res.suggested_actions or suggested_actions
        except Exception:
            pass

    turn = AdventureTurn(
        adventure_id=adventure.id,
        turn_index=next_turn_index,
        player_action=req.action_text.strip(),
        dm_text=narration,
        created_at=datetime.utcnow(),
    )
    db.add(turn)
    db.add(character)
    db.add(adventure)
    db.commit()

    return AdventureStepResponse(
        adventure_id=adventure.id,
        state_summary=_state_summary(adventure, state),
        narration=narration,
        suggested_actions=suggested_actions,
        events=events,
    )


@router.get("/modules", response_model=list[dict])
def list_modules():
    """List available adventure modules."""
    try:
        from data.modules import MODULES
        return [
            {
                "id": mod_id,
                "name": mod.get("name", mod_id),
                "description": mod.get("description", ""),
                "level_range": mod.get("level_range", "Any"),
                "theme": mod.get("theme", "fantasy"),
            }
            for mod_id, mod in MODULES.items()
        ]
    except ImportError:
        return []


@router.get("/{adventure_id}", response_model=AdventureGetResponse)
def get_adventure(
    adventure_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    adventure = db.query(AdventureRun).filter(AdventureRun.id == adventure_id).first()
    if not adventure or adventure.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Adventure not found")

    state = _load_state(adventure)
    turns = (
        db.query(AdventureTurn)
        .filter(AdventureTurn.adventure_id == adventure.id)
        .order_by(AdventureTurn.turn_index.asc())
        .limit(200)
        .all()
    )
    return AdventureGetResponse(
        adventure_id=adventure.id,
        state_summary=_state_summary(adventure, state),
        turns=[
            AdventureTurnResponse(
                turn_index=t.turn_index,
                player_action=t.player_action,
                dm_text=t.dm_text,
                created_at=t.created_at,
            )
            for t in turns
        ],
    )


