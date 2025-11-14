import { User, Mail, Shield } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function Profile() {
  const { user, logout } = useAuthStore()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Profile</h1>

      <div className="card">
        <div className="flex items-center space-x-4 mb-6">
          <div className="p-4 bg-blue-100 rounded-full">
            <User className="h-12 w-12 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{user?.username}</h2>
            <p className="text-gray-600">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
            <Mail className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-700">Email</p>
              <p className="text-gray-900">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
            <Shield className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-700">Role</p>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                user?.role === 'dm'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {user?.role === 'dm' ? 'Dungeon Master' : 'Player'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={logout}
            className="w-full btn btn-danger"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

