import Foundation

// D&D 5e System Reference Document (SRD) data

struct D5eData {
    // MARK: - Races
    static let races = [
        "Dwarf", "Elf", "Halfling", "Human",
        "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"
    ]
    
    static let raceDetails: [String: RaceInfo] = [
        "Dwarf": RaceInfo(
            name: "Dwarf",
            abilityBonuses: ["constitution": 2],
            speed: 25,
            traits: ["Darkvision", "Dwarven Resilience", "Stonecunning"]
        ),
        "Elf": RaceInfo(
            name: "Elf",
            abilityBonuses: ["dexterity": 2],
            speed: 30,
            traits: ["Darkvision", "Keen Senses", "Fey Ancestry", "Trance"]
        ),
        "Halfling": RaceInfo(
            name: "Halfling",
            abilityBonuses: ["dexterity": 2],
            speed: 25,
            traits: ["Lucky", "Brave", "Halfling Nimbleness"]
        ),
        "Human": RaceInfo(
            name: "Human",
            abilityBonuses: ["strength": 1, "dexterity": 1, "constitution": 1, "intelligence": 1, "wisdom": 1, "charisma": 1],
            speed: 30,
            traits: []
        ),
        "Dragonborn": RaceInfo(
            name: "Dragonborn",
            abilityBonuses: ["strength": 2, "charisma": 1],
            speed: 30,
            traits: ["Draconic Ancestry", "Breath Weapon", "Damage Resistance"]
        ),
        "Gnome": RaceInfo(
            name: "Gnome",
            abilityBonuses: ["intelligence": 2],
            speed: 25,
            traits: ["Darkvision", "Gnome Cunning"]
        ),
        "Half-Elf": RaceInfo(
            name: "Half-Elf",
            abilityBonuses: ["charisma": 2],
            speed: 30,
            traits: ["Darkvision", "Fey Ancestry", "Skill Versatility"]
        ),
        "Half-Orc": RaceInfo(
            name: "Half-Orc",
            abilityBonuses: ["strength": 2, "constitution": 1],
            speed: 30,
            traits: ["Darkvision", "Menacing", "Relentless Endurance", "Savage Attacks"]
        ),
        "Tiefling": RaceInfo(
            name: "Tiefling",
            abilityBonuses: ["intelligence": 1, "charisma": 2],
            speed: 30,
            traits: ["Darkvision", "Hellish Resistance", "Infernal Legacy"]
        )
    ]
    
    // MARK: - Classes
    static let classes = [
        "Barbarian", "Bard", "Cleric", "Druid",
        "Fighter", "Monk", "Paladin", "Ranger",
        "Rogue", "Sorcerer", "Warlock", "Wizard"
    ]
    
    static let classDetails: [String: ClassInfo] = [
        "Barbarian": ClassInfo(
            name: "Barbarian",
            hitDie: 12,
            primaryAbility: "strength",
            savingThrows: ["strength", "constitution"],
            skillChoices: 2,
            availableSkills: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"]
        ),
        "Bard": ClassInfo(
            name: "Bard",
            hitDie: 8,
            primaryAbility: "charisma",
            savingThrows: ["dexterity", "charisma"],
            skillChoices: 3,
            availableSkills: ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"]
        ),
        "Cleric": ClassInfo(
            name: "Cleric",
            hitDie: 8,
            primaryAbility: "wisdom",
            savingThrows: ["wisdom", "charisma"],
            skillChoices: 2,
            availableSkills: ["History", "Insight", "Medicine", "Persuasion", "Religion"]
        ),
        "Druid": ClassInfo(
            name: "Druid",
            hitDie: 8,
            primaryAbility: "wisdom",
            savingThrows: ["intelligence", "wisdom"],
            skillChoices: 2,
            availableSkills: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"]
        ),
        "Fighter": ClassInfo(
            name: "Fighter",
            hitDie: 10,
            primaryAbility: "strength",
            savingThrows: ["strength", "constitution"],
            skillChoices: 2,
            availableSkills: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"]
        ),
        "Monk": ClassInfo(
            name: "Monk",
            hitDie: 8,
            primaryAbility: "dexterity",
            savingThrows: ["strength", "dexterity"],
            skillChoices: 2,
            availableSkills: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"]
        ),
        "Paladin": ClassInfo(
            name: "Paladin",
            hitDie: 10,
            primaryAbility: "strength",
            savingThrows: ["wisdom", "charisma"],
            skillChoices: 2,
            availableSkills: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"]
        ),
        "Ranger": ClassInfo(
            name: "Ranger",
            hitDie: 10,
            primaryAbility: "dexterity",
            savingThrows: ["strength", "dexterity"],
            skillChoices: 3,
            availableSkills: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"]
        ),
        "Rogue": ClassInfo(
            name: "Rogue",
            hitDie: 8,
            primaryAbility: "dexterity",
            savingThrows: ["dexterity", "intelligence"],
            skillChoices: 4,
            availableSkills: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth"]
        ),
        "Sorcerer": ClassInfo(
            name: "Sorcerer",
            hitDie: 6,
            primaryAbility: "charisma",
            savingThrows: ["constitution", "charisma"],
            skillChoices: 2,
            availableSkills: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"]
        ),
        "Warlock": ClassInfo(
            name: "Warlock",
            hitDie: 8,
            primaryAbility: "charisma",
            savingThrows: ["wisdom", "charisma"],
            skillChoices: 2,
            availableSkills: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"]
        ),
        "Wizard": ClassInfo(
            name: "Wizard",
            hitDie: 6,
            primaryAbility: "intelligence",
            savingThrows: ["intelligence", "wisdom"],
            skillChoices: 2,
            availableSkills: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"]
        )
    ]
    
    // MARK: - Skills
    static let skills = [
        "Acrobatics", "Animal Handling", "Arcana", "Athletics",
        "Deception", "History", "Insight", "Intimidation",
        "Investigation", "Medicine", "Nature", "Perception",
        "Performance", "Persuasion", "Religion", "Sleight of Hand",
        "Stealth", "Survival"
    ]
    
    static let skillAbilities: [String: String] = [
        "Acrobatics": "dexterity",
        "Animal Handling": "wisdom",
        "Arcana": "intelligence",
        "Athletics": "strength",
        "Deception": "charisma",
        "History": "intelligence",
        "Insight": "wisdom",
        "Intimidation": "charisma",
        "Investigation": "intelligence",
        "Medicine": "wisdom",
        "Nature": "intelligence",
        "Perception": "wisdom",
        "Performance": "charisma",
        "Persuasion": "charisma",
        "Religion": "intelligence",
        "Sleight of Hand": "dexterity",
        "Stealth": "dexterity",
        "Survival": "wisdom"
    ]
    
    // MARK: - Backgrounds
    static let backgrounds = [
        "Acolyte", "Charlatan", "Criminal", "Entertainer",
        "Folk Hero", "Guild Artisan", "Hermit", "Noble",
        "Outlander", "Sage", "Sailor", "Soldier", "Urchin"
    ]
    
    // MARK: - Conditions
    static let conditions = [
        "Blinded", "Charmed", "Deafened", "Exhausted",
        "Frightened", "Grappled", "Incapacitated", "Invisible",
        "Paralyzed", "Petrified", "Poisoned", "Prone",
        "Restrained", "Stunned", "Unconscious"
    ]
}

struct RaceInfo {
    let name: String
    let abilityBonuses: [String: Int]
    let speed: Int
    let traits: [String]
}

struct ClassInfo {
    let name: String
    let hitDie: Int
    let primaryAbility: String
    let savingThrows: [String]
    let skillChoices: Int
    let availableSkills: [String]
}


