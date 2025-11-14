import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Heart, Shield as ShieldIcon, Trash2 } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'

export default function CharacterList() {
  const { characters, fetchCharacters, deleteCharacter, isLoading } = useCharacterStore()

  useEffect(() => {
    fetchCharacters()
  }, [])

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Delete ${name}?`)) {
      await deleteCharacter(id)
    }
  }

  if (isLoading && characters.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading characters...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">My Characters</h1>
        <Link to="/characters/new" className="btn btn-primary inline-flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>New Character</span>
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="card text-center py-12">
          <ShieldIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Characters Yet</h3>
          <p className="text-gray-600 mb-6">Create your first character to begin your adventure</p>
          <Link to="/characters/new" className="btn btn-primary inline-flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Create Character</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <div key={character.id} className="card hover:shadow-lg transition-shadow group relative">
              <Link to={`/characters/${character.id}`} className="block">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors">
                      {character.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {character.race} {character.character_class}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-bold rounded-full">
                    Lv {character.level}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* HP Bar */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">Hit Points</span>
                      <span className={`font-bold ${
                        character.hit_points_current / character.hit_points_max > 0.5
                          ? 'text-green-600'
                          : character.hit_points_current / character.hit_points_max > 0.25
                          ? 'text-orange-600'
                          : 'text-red-600'
                      }`}>
                        {character.hit_points_current}/{character.hit_points_max}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          character.hit_points_current / character.hit_points_max > 0.5
                            ? 'bg-green-500'
                            : character.hit_points_current / character.hit_points_max > 0.25
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${(character.hit_points_current / character.hit_points_max) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-1">
                      <ShieldIcon className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">AC {character.armor_class}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="font-medium">Init {character.initiative >= 0 ? '+' : ''}{character.initiative}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="font-medium">{character.speed}ft</span>
                    </div>
                  </div>

                  {/* Conditions */}
                  {character.conditions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {character.conditions.slice(0, 3).map((condition) => (
                        <span key={condition} className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                          {condition}
                        </span>
                      ))}
                      {character.conditions.length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          +{character.conditions.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>

              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  handleDelete(character.id, character.name)
                }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

