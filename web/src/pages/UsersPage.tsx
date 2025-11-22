import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { API_ENDPOINTS } from '../config'
import { User, UserRole } from '../types'
import { useAuthStore } from '../stores/authStore'

interface UserFormState {
  id?: number
  email: string
  username: string
  role: UserRole
  password: string
}

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<UserFormState>({
    email: '',
    username: '',
    role: 'player',
    password: '',
  })

  const isDm = currentUser?.role === 'dm'

  useEffect(() => {
    if (isDm) {
      fetchUsers()
    }
  }, [isDm])

  const fetchUsers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get<User[]>(API_ENDPOINTS.USERS)
      setUsers(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setForm({
      email: '',
      username: '',
      role: 'player',
      password: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (user: User) => {
    setForm({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      password: '',
    })
    setIsModalOpen(true)
  }

  const handleChange = (field: keyof UserFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      if (form.id) {
        // Update existing user
        const payload: any = {
          email: form.email,
          username: form.username,
          role: form.role,
        }
        // Only send password if provided (acts as reset)
        if (form.password.trim()) {
          payload.password = form.password
        }
        await api.patch(API_ENDPOINTS.USER(form.id), payload)
      } else {
        // Create new user
        await api.post(API_ENDPOINTS.USERS, {
          email: form.email,
          username: form.username,
          password: form.password,
          role: form.role,
        })
      }

      setIsModalOpen(false)
      await fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save user')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (userId: number) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return

    try {
      await api.delete(API_ENDPOINTS.USER(userId))
      await fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete user')
    }
  }

  if (!isDm) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold mb-2">Access denied</h1>
        <p className="text-gray-600">
          Only Dungeon Masters can manage users. If you believe this is an error, contact your administrator.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="mt-2 text-gray-600">
            Manage player and DM accounts. Passwords are only set or reset here and are never shown.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn btn-primary btn-md"
        >
          <Plus className="h-5 w-5" />
          <span>New User</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        {isLoading ? (
          <p className="text-gray-600">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-gray-600">No users found.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{u.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{u.username}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{u.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        u.role === 'dm'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {u.role === 'dm' ? 'DM' : 'Player'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right space-x-2">
                    <button
                      onClick={() => openEditModal(u)}
                      className="btn btn-sm btn-secondary"
                    >
                      <Edit2 className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                    {currentUser && currentUser.id !== u.id && (
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="btn btn-sm btn-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {form.id ? 'Edit User' : 'Create User'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) => handleChange('role', e.target.value as UserRole)}
                >
                  <option value="player">Player</option>
                  <option value="dm">Dungeon Master</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.id ? 'New Password (leave blank to keep existing)' : 'Password'}
                </label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  {...(form.id ? {} : { required: true })}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


