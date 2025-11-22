import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, Shield as ShieldIcon, Zap, Wind } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { Button } from '../components/Button'

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedCharacter: character, fetchCharacter, updateCharacter, isLoading } = useCharacterStore()
  const [activeTab, setActiveTab] = useState('stats')
  const [damageAmount, setDamageAmount] = useState('')
  const [healAmount, setHealAmount] = useState('')

  useEffect(() => {
    if (id) {
      fetchCharacter(parseInt(id))
    }
  }, [id])

  const calculateModifier = (score: number) => Math.floor((score - 10) / 2)

  const handleDamage = async () => {
    if (!character || !damageAmount) return
    const damage = parseInt(damageAmount)
    const newHP = Math.max(0, character.hit_points_current - damage)
    await updateCharacter(character.id, { hit_points_current: newHP })
    setDamageAmount('')
  }

  const handleHeal = async () => {
    if (!character || !healAmount) return
    const heal = parseInt(healAmount)
    const newHP = Math.min(character.hit_points_max, character.hit_points_current + heal)
    await updateCharacter(character.id, { hit_points_current: newHP })
    setHealAmount('')
  }

  if (isLoading || !character) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading character...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/characters')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Characters</span>
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{character.name}</h1>
            <p className="text-lg text-gray-600">
              Level {character.level} {character.race} {character.character_class}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <ShieldIcon className="h-6 w-6 text-blue-600 mx-auto" />
              <p className="text-2xl font-bold">{character.armor_class}</p>
              <p className="text-xs text-gray-600">AC</p>
            </div>
            <div className="text-center">
              <Zap className="h-6 w-6 text-yellow-600 mx-auto" />
              <p className="text-2xl font-bold">{character.initiative >= 0 ? '+' : ''}{character.initiative}</p>
              <p className="text-xs text-gray-600">Initiative</p>
            </div>
            <div className="text-center">
              <Wind className="h-6 w-6 text-green-600 mx-auto" />
              <p className="text-2xl font-bold">{character.speed}</p>
              <p className="text-xs text-gray-600">Speed</p>
            </div>
          </div>
        </div>
      </div>

      {/* HP Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Hit Points</h2>
          <span className="text-3xl font-bold text-gray-900">
            {character.hit_points_current}/{character.hit_points_max}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
          <div 
            className={`h-4 rounded-full transition-all ${
              character.hit_points_current / character.hit_points_max > 0.5
                ? 'bg-green-500'
                : character.hit_points_current / character.hit_points_max > 0.25
                ? 'bg-orange-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${(character.hit_points_current / character.hit_points_max) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="Damage"
              className="input flex-1"
              value={damageAmount}
              onChange={(e) => setDamageAmount(e.target.value)}
            />
            <Button variant="danger" onClick={handleDamage}>
              Take Damage
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="Heal"
              className="input flex-1"
              value={healAmount}
              onChange={(e) => setHealAmount(e.target.value)}
            />
            <Button
              onClick={handleHeal}
              style={{ backgroundColor: '#10b981', color: 'white' }}
            >
              Heal
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="flex border-b border-gray-200 mb-6">
          {['stats', 'combat', 'inventory'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((ability) => {
                const score = character[ability]
                const modifier = calculateModifier(score)
                return (
                  <div key={ability} className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-600 uppercase mb-1">{ability.slice(0, 3)}</p>
                    <p className="text-3xl font-bold text-blue-600">{modifier >= 0 ? '+' : ''}{modifier}</p>
                    <p className="text-sm text-gray-600">{score}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Combat Tab */}
        {activeTab === 'combat' && (
          <div>
            {character.hit_points_current === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-red-900 mb-2">Death Saving Throws</h3>
                <div className="flex items-center justify-around">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Successes</p>
                    <div className="flex space-x-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 rounded-full border-2 ${
                            i < character.death_save_successes
                              ? 'bg-green-500 border-green-600'
                              : 'border-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Failures</p>
                    <div className="flex space-x-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 rounded-full border-2 ${
                            i < character.death_save_failures
                              ? 'bg-red-500 border-red-600'
                              : 'border-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {character.conditions.length > 0 && (
              <div>
                <h3 className="font-bold mb-2">Conditions</h3>
                <div className="flex flex-wrap gap-2">
                  {character.conditions.map((condition) => (
                    <span key={condition} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full">
                      {condition}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              {[
                { name: 'PP', amount: character.platinum_pieces, color: 'gray' },
                { name: 'GP', amount: character.gold_pieces, color: 'yellow' },
                { name: 'EP', amount: character.electrum_pieces, color: 'green' },
                { name: 'SP', amount: character.silver_pieces, color: 'gray' },
                { name: 'CP', amount: character.copper_pieces, color: 'orange' },
              ].map((currency) => (
                <div key={currency.name} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600">{currency.name}</p>
                  <p className="text-2xl font-bold">{currency.amount}</p>
                </div>
              ))}
            </div>

            {character.inventory.length === 0 && (
              <p className="text-gray-600 text-center py-8">No items in inventory</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

