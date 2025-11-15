import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { CharacterCreate } from '../types'
import { loadAsciiArt, getPlaceholderAscii } from '../lib/asciiArt'

const RACES = ['Dwarf', 'Elf', 'Halfling', 'Human', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling']
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']

export default function CharacterCreation() {
  const navigate = useNavigate()
  const { createCharacter, isLoading } = useCharacterStore()
  
  const [formData, setFormData] = useState({
    name: '',
    race: 'Human',
    character_class: 'Fighter',
    level: 1,
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  })

  // ASCII art state
  const [asciiArt, setAsciiArt] = useState<string>(getPlaceholderAscii())
  const [isLoadingArt, setIsLoadingArt] = useState(false)

  // Load ASCII art when race or class changes
  useEffect(() => {
    const loadArt = async () => {
      setIsLoadingArt(true)
      const art = await loadAsciiArt(formData.race, formData.character_class)
      if (art) {
        setAsciiArt(art)
      } else {
        setAsciiArt(getPlaceholderAscii())
      }
      setIsLoadingArt(false)
    }

    loadArt()
  }, [formData.race, formData.character_class])

  const calculateModifier = (score: number) => Math.floor((score - 10) / 2)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const conMod = calculateModifier(formData.constitution)
    const hitDie = 10 // Default, should vary by class
    const maxHP = hitDie + conMod
    
    const characterData: CharacterCreate = {
      ...formData,
      experience_points: 0,
      hit_points_max: maxHP,
      hit_points_current: maxHP,
      hit_points_temp: 0,
      armor_class: 10 + calculateModifier(formData.dexterity),
      initiative: calculateModifier(formData.dexterity),
      speed: 30,
      death_save_successes: 0,
      death_save_failures: 0,
      saving_throw_proficiencies: [],
      skill_proficiencies: [],
      skill_expertises: [],
      racial_traits: [],
      class_features: [],
      feats: [],
      inventory: [],
      spell_slots: {},
      spell_slots_used: {},
      spells_known: [],
      spells_prepared: [],
      conditions: [],
      attacks: [],
      copper_pieces: 0,
      silver_pieces: 0,
      electrum_pieces: 0,
      gold_pieces: 0,
      platinum_pieces: 0,
    }

    try {
      const character = await createCharacter(characterData)
      navigate(`/characters/${character.id}`)
    } catch (error) {
      // Error handled by store
    }
  }

  const rollStats = () => {
    const rollDice = () => {
      const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
      rolls.sort((a, b) => a - b)
      return rolls.slice(1).reduce((sum, val) => sum + val, 0)
    }

    setFormData({
      ...formData,
      strength: rollDice(),
      dexterity: rollDice(),
      constitution: rollDice(),
      intelligence: rollDice(),
      wisdom: rollDice(),
      charisma: rollDice(),
    })
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/characters')}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Back to Characters</span>
      </button>

      <h1 className="text-3xl font-bold text-gray-900">Create New Character</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Character Form */}
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <input
                type="number"
                min="1"
                max="20"
                className="input"
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Race *</label>
              <select
                className="input"
                value={formData.race}
                onChange={(e) => setFormData({ ...formData, race: e.target.value })}
              >
                {RACES.map((race) => (
                  <option key={race} value={race}>{race}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
              <select
                className="input"
                value={formData.character_class}
                onChange={(e) => setFormData({ ...formData, character_class: e.target.value })}
              >
                {CLASSES.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ability Scores */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Ability Scores</h2>
            <button
              type="button"
              onClick={rollStats}
              className="btn btn-secondary"
            >
              Roll 4d6 (drop lowest)
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((ability) => {
              const score = formData[ability]
              const modifier = calculateModifier(score)
              return (
                <div key={ability} className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2 capitalize">
                    {ability}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="input mb-2"
                    value={score}
                    onChange={(e) => setFormData({ ...formData, [ability]: parseInt(e.target.value) || 10 })}
                  />
                  <p className="text-center text-2xl font-bold text-blue-600">
                    {modifier >= 0 ? '+' : ''}{modifier}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

            {/* Submit */}
            <div className="flex items-center justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/characters')}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary"
              >
                {isLoading ? 'Creating...' : 'Create Character'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column - ASCII Art Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="card bg-gray-900 p-6 overflow-hidden">
            <h2 className="text-xl font-bold mb-4 text-white">Character Preview</h2>
            <div className="relative">
              {isLoadingArt && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
                  <div className="text-white">Loading...</div>
                </div>
              )}
              <pre className="text-green-400 font-mono text-[0.5rem] leading-tight overflow-x-auto whitespace-pre"
                   style={{ 
                     textShadow: '0 0 5px rgba(74, 222, 128, 0.5)',
                     fontFamily: 'monospace',
                     letterSpacing: '-0.05em'
                   }}>
                {asciiArt}
              </pre>
            </div>
            <div className="mt-4 text-sm text-gray-400 text-center">
              {formData.race} {formData.character_class && `• ${formData.character_class}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

