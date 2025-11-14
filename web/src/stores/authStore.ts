import { create } from 'zustand'
import api from '../lib/api'
import { API_ENDPOINTS } from '../config'
import { User, LoginCredentials, RegisterData, TokenResponse } from '../types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  
  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<TokenResponse>(API_ENDPOINTS.LOGIN, credentials)
      localStorage.setItem('token', data.access_token)
      
      const { data: user } = await api.get<User>(API_ENDPOINTS.ME)
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Login failed', 
        isLoading: false 
      })
      throw error
    }
  },
  
  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      await api.post(API_ENDPOINTS.REGISTER, data)
      // Auto-login after registration
      await useAuthStore.getState().login({ 
        email: data.email, 
        password: data.password 
      })
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Registration failed', 
        isLoading: false 
      })
      throw error
    }
  },
  
  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, isAuthenticated: false })
  },
  
  checkAuth: async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      set({ isAuthenticated: false })
      return
    }
    
    try {
      const { data } = await api.get<User>(API_ENDPOINTS.ME)
      set({ user: data, isAuthenticated: true })
    } catch (error) {
      localStorage.removeItem('token')
      set({ user: null, isAuthenticated: false })
    }
  },
  
  clearError: () => set({ error: null }),
}))

// Check auth on app load
if (typeof window !== 'undefined') {
  useAuthStore.getState().checkAuth()
}

