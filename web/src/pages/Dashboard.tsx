import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Users, Map, Plus, TrendingUp } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { useAuthStore } from '../stores/authStore'
import { Button } from '../components/Button'

export default function Dashboard() {
  const { user } = useAuthStore()
  const { characters, fetchCharacters } = useCharacterStore()

  useEffect(() => {
    fetchCharacters()
  }, [])

  const recentCharacters = characters.slice(0, 3)

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.username}!
        </h1>
        <p className="mt-2 text-gray-600">
          {user?.role === 'dm' ? 'Manage your campaigns and characters' : 'Manage your characters and join campaigns'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Characters</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{characters.length}</p>
            </div>
            <Users className="h-12 w-12 text-blue-600" />
          </div>
          <Button
            asChild
            variant="primary"
            size="sm"
            className="mt-4"
          >
            <Link to="/characters/new">
              Create New Character →
            </Link>
          </Button>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Campaigns</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">0</p>
            </div>
            <Map className="h-12 w-12 text-purple-600" />
          </div>
          {user?.role === 'dm' && (
            <Link to="/campaigns" className="mt-4 text-sm text-purple-600 hover:text-purple-700 font-medium">
              Create Campaign →
            </Link>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Levels</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {characters.reduce((sum, c) => sum + c.level, 0)}
              </p>
            </div>
            <TrendingUp className="h-12 w-12 text-green-600" />
          </div>
        </div>
      </div>

      {/* Recent Characters */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Recent Characters</h2>
          <Link to="/characters" className="text-blue-600 hover:text-blue-700 font-medium">
            View All →
          </Link>
        </div>

        {recentCharacters.length === 0 ? (
          <div className="card text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Characters Yet</h3>
            <p className="text-gray-600 mb-6">Create your first character to get started</p>
            <Link to="/characters/new" className="btn btn-primary inline-flex items-center space-x-2">
              <Plus className="h-5 w-5" />
              <span>Create Character</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentCharacters.map((character) => (
              <Link
                key={character.id}
                to={`/characters/${character.id}`}
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{character.name}</h3>
                    <p className="text-sm text-gray-600">
                      {character.race} {character.character_class}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                    Lv {character.level}
                  </span>
                </div>

                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <span className="font-medium text-gray-700">HP:</span>
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
                  <div className="flex items-center space-x-1">
                    <span className="font-medium text-gray-700">AC:</span>
                    <span className="font-bold text-gray-900">{character.armor_class}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/characters/new" className="card hover:shadow-lg transition-shadow group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
              <Plus className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Create New Character</h3>
              <p className="text-sm text-gray-600">Start building your next adventure</p>
            </div>
          </div>
        </Link>

        <Link to="/campaigns" className="card hover:shadow-lg transition-shadow group">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
              <Map className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Browse Campaigns</h3>
              <p className="text-sm text-gray-600">Join or manage campaigns</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}

