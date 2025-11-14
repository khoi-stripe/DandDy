export type UserRole = 'player' | 'dm'

export interface User {
  id: number
  email: string
  username: string
  role: UserRole
}

export type Alignment = 
  | 'lawful_good'
  | 'neutral_good'
  | 'chaotic_good'
  | 'lawful_neutral'
  | 'true_neutral'
  | 'chaotic_neutral'
  | 'lawful_evil'
  | 'neutral_evil'
  | 'chaotic_evil'

export interface Character {
  id: number
  owner_id: number
  campaign_id?: number
  
  // Basic Info
  name: string
  race: string
  character_class: string
  level: number
  background?: string
  alignment?: Alignment
  experience_points: number
  
  // Ability Scores
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  
  // Combat Stats
  hit_points_max: number
  hit_points_current: number
  hit_points_temp: number
  armor_class: number
  initiative: number
  speed: number
  
  // Death Saves
  death_save_successes: number
  death_save_failures: number
  
  // Proficiencies
  saving_throw_proficiencies: string[]
  skill_proficiencies: string[]
  skill_expertises: string[]
  
  // Features
  racial_traits: Record<string, any>[]
  class_features: Record<string, any>[]
  feats: Record<string, any>[]
  
  // Personality
  personality_traits?: string
  ideals?: string
  bonds?: string
  flaws?: string
  
  // Appearance
  appearance?: string
  backstory?: string
  
  // Inventory
  inventory: Record<string, any>[]
  
  // Spellcasting
  spellcasting_ability?: string
  spell_save_dc?: number
  spell_attack_bonus?: number
  spell_slots: Record<string, number>
  spell_slots_used: Record<string, number>
  spells_known: Record<string, any>[]
  spells_prepared: string[]
  
  // Combat
  conditions: string[]
  attacks: Record<string, any>[]
  
  // Currency
  copper_pieces: number
  silver_pieces: number
  electrum_pieces: number
  gold_pieces: number
  platinum_pieces: number
}

export interface Campaign {
  id: number
  name: string
  description?: string
  dm_id: number
}

export interface CampaignWithCharacters extends Campaign {
  characters: Character[]
}

export interface CharacterCreate extends Omit<Character, 'id' | 'owner_id'> {
  campaign_id?: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData extends LoginCredentials {
  username: string
  role: UserRole
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

