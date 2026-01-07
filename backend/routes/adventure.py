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
    return AdventureStateSummary(
        adventure_id=adventure.id,
        character_id=adventure.character_id,
        campaign_id=adventure.campaign_id,
        seed=str(state.get("seed") or adventure.seed),
        position=str(state.get("pos") or "0,0"),
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

    # Determine next turn index
    last_turn = (
        db.query(AdventureTurn)
        .filter(AdventureTurn.adventure_id == adventure.id)
        .order_by(AdventureTurn.turn_index.desc())
        .first()
    )
    next_turn_index = int(last_turn.turn_index + 1) if last_turn else 1

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

    # Apply XP/HP back to character + adventure state (simple “commit now” behavior)
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


