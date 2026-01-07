"""
The Red Demon in the Vile Fens
A Labyrinth Lord Adventure adapted for the AI DM system.

Original by Pat Wetmore, set in the Land of the Thousand Towers.
Science Fantasy adventure for 3rd-4th level characters.
"""

# Monster definitions with stats
MONSTERS = {
    "caecilian_tyrant": {
        "name": "Caecilian Tyrant",
        "description": "A feared alpha predator of the vile fens, this frog-like giant is up to 14' long and 8' wide. Blue-black with bright orange scale clusters, it lurks in pools waiting to ambush prey with its poisonous tongue.",
        "ac": 5,
        "hd": 10,
        "hp": 68,
        "attacks": 1,
        "damage": "1d8",
        "special": ["poison (save or die)", "devour on nat 20", "spawns 2d6+6 young on death"],
        "morale": 8,  # 11 in lair
        "xp": 3100,
    },
    "cybernecromantic_entity": {
        "name": "Autochthonic Cybernecromantic Entity",
        "description": "A mass of ancient thinking machines fused with corpses. Originally a medical computer, now totally insane. It speaks Common and may attempt to 'help' injured characters - with a 75% chance of turning them into zombies.",
        "ac": 3,
        "hd": 10,
        "hp": 55,
        "attacks": 3,
        "damage": "1d6/1d6/1d6",
        "special": ["cannot move", "controls zombies up to 200ft away", "may negotiate", "double damage from electricity"],
        "morale": 10,
        "xp": 2400,
    },
    "cyber_zombie": {
        "name": "Cybernecromantic Zombie",
        "description": "Mummified remains fused with tubes, piping, and mechanical limbs. Perfectly still until commanded to attack. Cables trail back to the central Entity.",
        "ac": 5,
        "hd": 3,
        "hp": 16,
        "attacks": 1,
        "damage": "1d8",
        "special": ["surprise on 1-3", "attacks last in round", "cable can be severed (AC 2, 6 HP)"],
        "morale": 12,
        "xp": 65,
    },
}

# Item definitions
ITEMS = {
    "commanders_pistol": {
        "name": "Golden Heavy Pistol",
        "description": "A ceremonial gold-plated revolver. Beautiful but the ammunition is damp and unfireable.",
        "damage": "1d8",
        "value_gp": 800,
        "usable": False,
    },
    "commanders_miter": {
        "name": "Fancy Miter",
        "description": "A peaked miter stitched with gems, platinum wire and gold thread.",
        "value_gp": 100,
    },
    "laser_rifle": {
        "name": "Laser Rifle",
        "description": "An ancient weapon of devastating power. Comes with four power packs.",
        "damage": "3d6",
        "value_gp": 2000,
        "charges": 20,
    },
    "boarding_shield": {
        "name": "Boarding Shield +1",
        "description": "A large orange shield made of advanced alloy with a notch to steady a gun. Painted with the crest of a long-forgotten religious order.",
        "ac_bonus": 2,
        "magical": True,
    },
    "fish_mace": {
        "name": "Fish Club (Mace +1)",
        "description": "A beautifully crafted bone war club in the shape of a fish, worked with silver and copper swirls and pearl knobs. Creates food and water (fish and clear water) 3 times per week.",
        "damage": "1d6+1",
        "magical": True,
        "special": "Creates food and water 3x/week",
    },
    "oil_of_slipperiness": {
        "name": "Oil of Slipperiness",
        "description": "A stoppered black stone bottle sealed in wax. The oil within makes the user impossible to grapple or restrain.",
        "magical": True,
        "consumable": True,
    },
    "gallantry_medal": {
        "name": "Medal of Gallantry",
        "description": "A platinum and amber medal embossed with the word 'GALLANTRY'.",
        "value_gp": 100,
    },
    "mesh_vest": {
        "name": "Ancient Mesh Armor",
        "description": "A finely made vest of mesh armor, identical to chainmail but of ancient make.",
        "ac_bonus": 5,
        "value_gp": 60,
    },
    "repair_spider": {
        "name": "Robotic Repair Spider",
        "description": "A small mechanical spider that seeks to fix broken ancient machines. Not intelligent, but makes contented beeping noises when rescued.",
        "special": "20% chance to repair ancient tech",
    },
    "talking_skull": {
        "name": "Circuit-Inlaid Skull",
        "description": "A human skull with glowing magical gold circuit inlays. When electricity is applied, it babbles about ancient wars and a fantastical city to the East.",
        "value_gp": 75,
    },
}

# Fuel cell random effects table (Area 3)
FUEL_CELL_TABLE = [
    {
        "roll": 1,
        "name": "Cosmic Immensity",
        "effect": "Within are the secrets of another universe. Opener must save vs. Spells or be sucked into another world forever.",
    },
    {
        "roll": 2,
        "name": "Sick Rock",
        "effect": "Radioactive substance causes debilitating sickness from exposure longer than 1 turn.",
    },
    {
        "roll": 3,
        "name": "Bottled Demon",
        "effect": "A horror from another sphere, trapped for ages and quite angry. Fights as a Troll, immune to non-magical weapons. May calm down enough to make a deal.",
    },
    {
        "roll": 4,
        "name": "Unstable Magic Essence",
        "effect": "Pure magical energy at high pressure. Silent multicolored explosion for 1d10 damage, 20' radius.",
    },
    {
        "roll": 5,
        "name": "Lanthanide Nuggets",
        "effect": "Valuable materials worth 1d4 x 100 GP.",
    },
    {
        "roll": 6,
        "name": "Magic Scroll",
        "effect": "A scroll with a random 2nd level magic-user spell.",
    },
    {
        "roll": 7,
        "name": "Plasma Power Cell",
        "effect": "Drained after so long unused. Worthless.",
    },
    {
        "roll": 8,
        "name": "Volatile Fumes",
        "effect": "Deadly fumes fill a 10' area. Exposure for more than a round requires save vs. poison or death.",
    },
    {
        "roll": 9,
        "name": "Angry Souls",
        "effect": "Tortured souls trapped with necromantic spells. Attack instantly as a Wraith.",
    },
    {
        "roll": 10,
        "name": "Mummy Powder",
        "effect": "Anyone within 10' radius afflicted with mummy rot - 1-4 CON damage per day until cured or death.",
    },
]

# Area definitions
AREAS = {
    "exterior": {
        "name": "The Swamp Approach",
        "description": """As you brush through tall ferns and wade past ropy roots of yellow-barked chartreuse trees, The Demon looms from the mists. What seemed an indistinct form resolves into a decaying artifact of immense age and violent purpose.

The machine stands more or less upright, stained with red corrosion yet lacking the pits and flakes one would expect from ages in acidic swamp water. It moved on cyclopean treads - the right one now lies half-sunk, supporting the vehicle's body. A 70-foot central tower bears a ball turret shaped into a leering demonic face, a huge cannon drooping obscenely from its mouth.

You see:
- A 10-foot hole punched through the rear right side (whatever made it vaporized the rear track)
- A small balcony 50 feet up, leading into a shadowed alcove
- Brackish water on the southern side, concealing something beneath the surface""",
        "exits": {
            "enter hole": "area_1",
            "climb balcony": "area_7",
            "swim south": "area_4",
        },
        "items": [],
        "monsters": [],
        "notes": "The Caecilian Tyrant hunts this area. 30% chance of encounter.",
        "hazards": [],
    },
    "area_1": {
        "name": "Fell Engine",
        "description": """A 60-foot long trapezoidal chamber with 20-foot ceilings draped in decayed conduits, pipes, and wiring. A huge hole gapes in the north wall where you entered.

The southern half contains the twisted remnants of a massive machine - the Demon's alchemical engine, struck by whatever punched through the wall. Melted, torqued, reduced to variegated slag.

You see:
- Sealed double doors on the west wall (northern edge), with a smashed control panel and emergency lever
- A rusted hatch on the east wall near the floor (jammed shut)
- 6-foot diameter holes in the floor leading down into darkness
- Small swamp creatures (lizards, spiders, tiny monkeys) living in engine crevices""",
        "exits": {
            "west": "area_2",
            "down": "area_4",
            "east": "exterior",
            "out": "exterior",
        },
        "items": [],
        "monsters": [],
        "notes": "West doors require pulling emergency lever, then can be pried open. East hatch requires STR check +10.",
        "hazards": [],
    },
    "area_2": {
        "name": "Chamber of Control and Command",
        "description": """The command deck. Dust lies thick on the floor. Consoles remain seemingly undamaged around this 50x30 foot room with 20-foot arched ceilings. The bowed front wall has small periscopes looking out on the swamp.

Four skeletons in faded orange synthetic robes are scattered about:
- One in the central commander's chair, wearing a peaked gem-studded miter and a gun belt with a golden pistol
- Three at forward positions, each with dried leather helmets marked by small gold disks

The pintle gunner's station still has a mounted heavy machine gun surrounded by ammunition boxes - but the weapon is rusted, the barrel fouled, the assembly dangerously unstable.

You see:
- A trapdoor in the floor (to lower level)
- A hatch in the ceiling with a steel ladder (to upper level)
- The mounted machine gun (DANGER - explosive if disturbed)""",
        "exits": {
            "east": "area_1",
            "down": "area_3",
            "up": "area_5",
        },
        "items": ["commanders_pistol", "commanders_miter"],
        "monsters": [],
        "notes": "Machine gun explodes for 2d10 damage (10' radius) if open flame or blunt force applied.",
        "hazards": ["explosive_ammo"],
        "loot": ["12 GP in gold disks from helmets"],
    },
    "area_3": {
        "name": "Pit of the Damned",
        "description": """A 30x20 foot chamber between the treads, protected by 4-foot thick armor plating. Only a few inches of water seep on the floor.

Steel shelves line the walls, holding 22 large metal jars - fuel cells for the Demon. Each jar is sealed with copper strips stamped 'DANGER'.

The jars contain unspeakable techno-magical substances from another age. Opening one is extremely dangerous.

You see:
- A small sealed hatch (can only be opened from here)
- A trapdoor with ladder leading up
- 22 sealed fuel cells on shelves""",
        "exits": {
            "up": "area_2",
            "hatch": "area_4",
        },
        "items": [],
        "monsters": [],
        "notes": "Opening a fuel cell triggers a random effect from the d10 table.",
        "hazards": ["fuel_cells"],
        "interactables": ["fuel_cell"],
    },
    "area_4": {
        "name": "Drowned Machines",
        "description": """A 30x60 foot chamber between the treads, slanting upward, never more than 8 feet tall. A massive hole on the south side provides a submerged exit to murky water outside. Nearly 5 feet of black swamp water and muck fill the room.

Tangled drive machinery, decayed and twisted, fills the space above and below the waterline. This is the lair of the Caecilian Tyrant.

You see:
- Holes in the ceiling leading up
- The submerged exit south
- A hatch (leads to Area 3)
- Glints of metal beneath the murky water""",
        "exits": {
            "up": "area_1",
            "south": "exterior",
            "hatch": "area_3",
        },
        "items": ["fish_mace", "oil_of_slipperiness"],
        "monsters": ["caecilian_tyrant"],
        "notes": "70% chance Tyrant is here. Treasure hidden underwater.",
        "hazards": [],
        "loot": [
            "30 silver bearings (300 GP total)",
            "4 platinum catalyst plates (400 GP)",
            "Pearls in Tyrant's stomach (230 GP)",
            "Fist-sized rough opal (750 GP)",
        ],
    },
    "area_5": {
        "name": "Sorcerer's Lair",
        "description": """Living quarters for the Demon's crew. The central ladder continues up and down. The western wall has been torn asunder.

EAST - LIVING QUARTERS: Two lines of bunk beds (just metal tubing now), footlockers scattered and opened, thin metal wall panels torn away revealing conduits beneath. Debris covers the floor.

WEST - MEDICAL BAY: An astonishing jumble of mechanical parts with something lurking within - the Cybernecromantic Entity, an insane former medical computer. Ten zombies on cables are hidden throughout: 4 in debris piles, 3 on the floor, 3 tangled in ceiling tubing.

The Entity may speak to you. It wants to 'help'.""",
        "exits": {
            "down": "area_2",
            "up": "area_6",
        },
        "items": ["gallantry_medal", "mesh_vest", "repair_spider", "talking_skull"],
        "monsters": ["cybernecromantic_entity"],
        "notes": "Entity has 10 cyber-zombies. May negotiate or ambush based on reaction roll. 25% chance of successful healing, 75% chance of zombification.",
        "hazards": ["entity_healing"],
        "loot": [
            "72 coins (12 PP, 36 GP, 24 EP)",
            "Small portrait painting (20 GP)",
            "2000 lbs silver wire (2000 GP)",
            "50 lbs gold wire (500 GP)",
            "6 ruby lenses (600 GP)",
            "Gold-plated robotic hand (50 GP)",
        ],
    },
    "area_6": {
        "name": "Chamber of Secrets",
        "description": """A 30x30 foot chamber - once a chapel and communications center. The arched ceiling bears peeling murals of Zoman, god of Sieges (depicted as a squat deity of rusted iron and glass tubes) wrestling heroes and beasts.

Dominating the room is a God's Eye made of rusted iron - a device to communicate with orbital deities, though it's been inactive so long any response would likely come from lesser, more insane gods.

Consoles against the north wall still miraculously function, powered by internal nuclear batteries.

You see:
- The God's Eye artifact
- Working consoles (require INT check at -5 to operate)
- Ladder continuing up and down""",
        "exits": {
            "down": "area_5",
            "up": "area_7",
        },
        "items": [],
        "monsters": [],
        "notes": "Consoles reveal ancient mysteries on successful INT check.",
        "hazards": [],
        "interactables": ["gods_eye", "ancient_console"],
    },
    "area_7": {
        "name": "Fighting Deck",
        "description": """An 8-foot square landing with a ladder shaft between lower and upper levels. A door leads east to an open platform atop the Red Demon.

Outside: A 30x30 foot fighting platform surrounded by a 3-foot parapet. Swamp debris covers the floor. Two doors lead to weapons lockers - locked with complicated combination locks.

The view from here shows miles of bruise-colored swamp vegetation stretching in every direction. Mist curls between the trees.

You see:
- North locker (locked)
- South locker (locked)
- The ladder shaft continuing up
- The balcony entrance you may have climbed earlier""",
        "exits": {
            "down": "area_6",
            "up": "area_9",
            "balcony": "exterior",
        },
        "items": ["laser_rifle", "boarding_shield"],
        "monsters": [],
        "notes": "Lockers require picking (difficult) or explosive force. Contains laser rifle, shield +1, plasma cells, cable, and soldier's plunder (520 GP total).",
        "hazards": [],
        "locked_containers": ["north_locker", "south_locker"],
        "loot": [
            "3 plasma weapon power cells (300 GP)",
            "Soldier's plunder: 120 GP, ruby (50 GP), platinum torque (350 GP)",
        ],
    },
    "area_8": {
        "name": "The Demon's Face",
        "description": """The giant ball turret - the demonic face you saw from outside. Almost a solid mass of corroded metal, it juts into the feeding room above.

The great cannon could theoretically be loaded and fired using shells from above... but doing so would cause a catastrophic explosion, annihilating everything from here to the fighting deck.

This is not a place to linger.""",
        "exits": {
            "back": "area_9",
        },
        "items": [],
        "monsters": [],
        "notes": "Firing the cannon destroys Areas 5-9 and kills anyone inside.",
        "hazards": ["main_cannon"],
    },
    "area_9": {
        "name": "The Feeding Room",
        "description": """A 30x15 foot room dominated by the top of the turret (Area 8). Hundreds of 300-pound shells stand arranged, each 4 feet tall and 1.5 feet across. The room is heavily armored with thick riveted walls.

Controls on the east wall - wheels and a large RED BUTTON - could operate the turret manually. Only the firing button still works.

A thick, sticky black mess covers everything - leaked propellant from decaying shells. It smells of sulfur and drips down the ladder shaft. The substance is HIGHLY FLAMMABLE.

⚠️ DANGER: Open flame in this room will ignite the propellant for 5d6 damage (save vs. Breath for 2d6 falling damage instead). Lanterns have 25% chance per round of ignition.""",
        "exits": {
            "down": "area_7",
            "turret": "area_8",
        },
        "items": [],
        "monsters": [],
        "notes": "Propellant explodes with open flame. Torches spark as warning in ladder shaft below.",
        "hazards": ["explosive_propellant"],
    },
}

# Console discovery table (Area 6)
CONSOLE_DISCOVERIES = [
    {"roll": 1, "discovery": "The location of the Red Demon's base, far to the East across the Certopsian Plains."},
    {"roll": 2, "discovery": "The location of the Red Demon's target - a fortified bunker complex in the hills 40 miles away."},
    {"roll": 3, "discovery": "The codes for the mechanical combination locks on the lockers in Area 7."},
    {"roll": 4, "discovery": "The name of a minor extra-planar creature that can be summoned and controlled."},
    {"roll": 5, "discovery": "Divine communion - as the Commune spell."},
    {"roll": 6, "discovery": "Instructions for casting the Dispel Magic spell."},
    {"roll": 7, "discovery": "An up-to-date map of a 100-mile square area around the Demon."},
    {"roll": 8, "discovery": "HIGH-PITCHED KEENING NOISE for 1d6 turns. Save vs. Paralysis or flee uncontrollably."},
]

# The complete module
RED_DEMON_MODULE = {
    "id": "red_demon",
    "name": "The Red Demon in the Vile Fens",
    "description": "A Labyrinth Lord adventure set in the Land of the Thousand Towers. A dangerous challenge for 3rd-4th level characters.",
    "theme": "science_fantasy",
    "level_range": "3-4",
    "starting_area": "exterior",
    "areas": AREAS,
    "monsters": MONSTERS,
    "items": ITEMS,
    "fuel_cell_table": FUEL_CELL_TABLE,
    "console_discoveries": CONSOLE_DISCOVERIES,
    "background": """The Vile Fens are a dangerous swampy area known for Froghemoths, zombie servants of the Fen Witch, and blowgun-wielding tribesmen. Near the northern edge stands the Red Demon - an ancient war machine being reclaimed by the swamp.

The nearby Fish Village folk know little of the Demon except that it has a demonic face, and for generations the waters around it glowed at night and brought death to any who approached. The chief's brother, a great hunter, set off to investigate years ago and never returned.

The Demon's pollution has lessened, but the villagers still shun the cursed place.""",
    "hooks": [
        "The chief of Fish Village offers a reward for news of his lost brother (the Fish Club mace proves his fate)",
        "Rumors of ancient technology and treasure within the metal demon",
        "A scholar in Denethix seeks information about ancient war machines",
    ],
}

