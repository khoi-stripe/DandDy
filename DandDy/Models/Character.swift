import Foundation

enum Alignment: String, Codable, CaseIterable {
    case lawfulGood = "lawful_good"
    case neutralGood = "neutral_good"
    case chaoticGood = "chaotic_good"
    case lawfulNeutral = "lawful_neutral"
    case trueNeutral = "true_neutral"
    case chaoticNeutral = "chaotic_neutral"
    case lawfulEvil = "lawful_evil"
    case neutralEvil = "neutral_evil"
    case chaoticEvil = "chaotic_evil"
    
    var displayName: String {
        switch self {
        case .lawfulGood: return "Lawful Good"
        case .neutralGood: return "Neutral Good"
        case .chaoticGood: return "Chaotic Good"
        case .lawfulNeutral: return "Lawful Neutral"
        case .trueNeutral: return "True Neutral"
        case .chaoticNeutral: return "Chaotic Neutral"
        case .lawfulEvil: return "Lawful Evil"
        case .neutralEvil: return "Neutral Evil"
        case .chaoticEvil: return "Chaotic Evil"
        }
    }
}

struct Character: Codable, Identifiable {
    let id: Int
    let ownerId: Int
    let campaignId: Int?
    
    // Basic Info
    var name: String
    var race: String
    var characterClass: String
    var level: Int
    var background: String?
    var alignment: Alignment?
    var experiencePoints: Int
    
    // Ability Scores
    var strength: Int
    var dexterity: Int
    var constitution: Int
    var intelligence: Int
    var wisdom: Int
    var charisma: Int
    
    // Combat Stats
    var hitPointsMax: Int
    var hitPointsCurrent: Int
    var hitPointsTemp: Int
    var armorClass: Int
    var initiative: Int
    var speed: Int
    
    // Death Saves
    var deathSaveSuccesses: Int
    var deathSaveFailures: Int
    
    // Proficiencies
    var savingThrowProficiencies: [String]
    var skillProficiencies: [String]
    var skillExpertises: [String]
    
    // Features
    var racialTraits: [[String: String]]
    var classFeatures: [[String: String]]
    var feats: [[String: String]]
    
    // Personality
    var personalityTraits: String?
    var ideals: String?
    var bonds: String?
    var flaws: String?
    
    // Appearance
    var appearance: String?
    var backstory: String?
    
    // Inventory
    var inventory: [[String: String]]
    
    // Spellcasting
    var spellcastingAbility: String?
    var spellSaveDc: Int?
    var spellAttackBonus: Int?
    var spellSlots: [String: Int]
    var spellSlotsUsed: [String: Int]
    var spellsKnown: [[String: String]]
    var spellsPrepared: [String]
    
    // Combat
    var conditions: [String]
    var attacks: [[String: String]]
    
    // Currency
    var copperPieces: Int
    var silverPieces: Int
    var electrumPieces: Int
    var goldPieces: Int
    var platinumPieces: Int
    
    enum CodingKeys: String, CodingKey {
        case id, name, race, level, background, alignment
        case ownerId = "owner_id"
        case campaignId = "campaign_id"
        case characterClass = "character_class"
        case experiencePoints = "experience_points"
        case strength, dexterity, constitution, intelligence, wisdom, charisma
        case hitPointsMax = "hit_points_max"
        case hitPointsCurrent = "hit_points_current"
        case hitPointsTemp = "hit_points_temp"
        case armorClass = "armor_class"
        case initiative, speed
        case deathSaveSuccesses = "death_save_successes"
        case deathSaveFailures = "death_save_failures"
        case savingThrowProficiencies = "saving_throw_proficiencies"
        case skillProficiencies = "skill_proficiencies"
        case skillExpertises = "skill_expertises"
        case racialTraits = "racial_traits"
        case classFeatures = "class_features"
        case feats
        case personalityTraits = "personality_traits"
        case ideals, bonds, flaws
        case appearance, backstory
        case inventory
        case spellcastingAbility = "spellcasting_ability"
        case spellSaveDc = "spell_save_dc"
        case spellAttackBonus = "spell_attack_bonus"
        case spellSlots = "spell_slots"
        case spellSlotsUsed = "spell_slots_used"
        case spellsKnown = "spells_known"
        case spellsPrepared = "spells_prepared"
        case conditions, attacks
        case copperPieces = "copper_pieces"
        case silverPieces = "silver_pieces"
        case electrumPieces = "electrum_pieces"
        case goldPieces = "gold_pieces"
        case platinumPieces = "platinum_pieces"
    }
}

struct CharacterCreate: Codable {
    var name: String
    var race: String
    var characterClass: String
    var level: Int = 1
    var background: String?
    var alignment: Alignment?
    var experiencePoints: Int = 0
    
    var strength: Int
    var dexterity: Int
    var constitution: Int
    var intelligence: Int
    var wisdom: Int
    var charisma: Int
    
    var hitPointsMax: Int
    var hitPointsCurrent: Int
    var hitPointsTemp: Int = 0
    var armorClass: Int
    var initiative: Int = 0
    var speed: Int = 30
    
    var deathSaveSuccesses: Int = 0
    var deathSaveFailures: Int = 0
    
    var savingThrowProficiencies: [String] = []
    var skillProficiencies: [String] = []
    var skillExpertises: [String] = []
    
    var racialTraits: [[String: String]] = []
    var classFeatures: [[String: String]] = []
    var feats: [[String: String]] = []
    
    var personalityTraits: String?
    var ideals: String?
    var bonds: String?
    var flaws: String?
    
    var appearance: String?
    var backstory: String?
    
    var inventory: [[String: String]] = []
    
    var spellcastingAbility: String?
    var spellSaveDc: Int?
    var spellAttackBonus: Int?
    var spellSlots: [String: Int] = [:]
    var spellSlotsUsed: [String: Int] = [:]
    var spellsKnown: [[String: String]] = []
    var spellsPrepared: [String] = []
    
    var conditions: [String] = []
    var attacks: [[String: String]] = []
    
    var copperPieces: Int = 0
    var silverPieces: Int = 0
    var electrumPieces: Int = 0
    var goldPieces: Int = 0
    var platinumPieces: Int = 0
    
    var campaignId: Int?
    
    enum CodingKeys: String, CodingKey {
        case name, race, level, background, alignment
        case characterClass = "character_class"
        case experiencePoints = "experience_points"
        case strength, dexterity, constitution, intelligence, wisdom, charisma
        case hitPointsMax = "hit_points_max"
        case hitPointsCurrent = "hit_points_current"
        case hitPointsTemp = "hit_points_temp"
        case armorClass = "armor_class"
        case initiative, speed
        case deathSaveSuccesses = "death_save_successes"
        case deathSaveFailures = "death_save_failures"
        case savingThrowProficiencies = "saving_throw_proficiencies"
        case skillProficiencies = "skill_proficiencies"
        case skillExpertises = "skill_expertises"
        case racialTraits = "racial_traits"
        case classFeatures = "class_features"
        case feats
        case personalityTraits = "personality_traits"
        case ideals, bonds, flaws
        case appearance, backstory
        case inventory
        case spellcastingAbility = "spellcasting_ability"
        case spellSaveDc = "spell_save_dc"
        case spellAttackBonus = "spell_attack_bonus"
        case spellSlots = "spell_slots"
        case spellSlotsUsed = "spell_slots_used"
        case spellsKnown = "spells_known"
        case spellsPrepared = "spells_prepared"
        case conditions, attacks
        case copperPieces = "copper_pieces"
        case silverPieces = "silver_pieces"
        case electrumPieces = "electrum_pieces"
        case goldPieces = "gold_pieces"
        case platinumPieces = "platinum_pieces"
        case campaignId = "campaign_id"
    }
}


