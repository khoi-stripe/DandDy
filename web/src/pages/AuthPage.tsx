import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { UserRole } from '../types'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'player' as UserRole
  })
  const { login, register, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (!isLogin && formData.password !== formData.confirmPassword) {
      return
    }

    try {
      if (isLogin) {
        await login({ email: formData.email, password: formData.password })
      } else {
        await register({
          email: formData.email,
          username: formData.username,
          password: formData.password,
          role: formData.role
        })
      }
      navigate('/')
    } catch (error) {
      // Error is handled by store
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center">
            <Shield className="h-16 w-16 text-blue-600" />
          </div>
          <h2 className="mt-6 text-4xl font-bold text-gray-900">DandDy</h2>
          <p className="mt-2 text-sm text-gray-600">
            D&D 5e Character Manager
          </p>
        </div>

        {/* Form */}
        <div className="card">
          <div className="flex justify-center space-x-4 mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                isLogin
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                !isLogin
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                className="input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                className="input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    className="input"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    className="input"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  >
                    <option value="player">Player</option>
                    <option value="dm">Dungeon Master</option>
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary"
            >
              {isLoading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600">
          Manage your D&D characters, track combat, and organize campaigns
        </p>
      </div>
    </div>
  )
}

