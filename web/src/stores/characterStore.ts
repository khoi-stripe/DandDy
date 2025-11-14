import { create } from 'zustand'
import api from '../lib/api'
import { API_ENDPOINTS } from '../config'
import { Character, CharacterCreate } from '../types'

interface CharacterState {
  characters: Character[]
  selectedCharacter: Character | null
  isLoading: boolean
  error: string | null
  
  fetchCharacters: () => Promise<void>
  fetchCharacter: (id: number) => Promise<void>
  createCharacter: (data: CharacterCreate) => Promise<Character>
  updateCharacter: (id: number, updates: Partial<Character>) => Promise<void>
  deleteCharacter: (id: number) => Promise<void>
  clearError: () => void
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  selectedCharacter: null,
  isLoading: false,
  error: null,
  
  fetchCharacters: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.get<Character[]>(API_ENDPOINTS.CHARACTERS)
      set({ characters: data, isLoading: false })
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to fetch characters', 
        isLoading: false 
      })
    }
  },
  
  fetchCharacter: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.get<Character>(API_ENDPOINTS.CHARACTER(id))
      set({ selectedCharacter: data, isLoading: false })
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to fetch character', 
        isLoading: false 
      })
    }
  },
  
  createCharacter: async (characterData) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<Character>(API_ENDPOINTS.CHARACTERS, characterData)
      set({ 
        characters: [...get().characters, data], 
        isLoading: false 
      })
      return data
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to create character', 
        isLoading: false 
      })
      throw error
    }
  },
  
  updateCharacter: async (id, updates) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.put<Character>(API_ENDPOINTS.CHARACTER(id), updates)
      
      set({ 
        characters: get().characters.map(c => c.id === id ? data : c),
        selectedCharacter: get().selectedCharacter?.id === id ? data : get().selectedCharacter,
        isLoading: false 
      })
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to update character', 
        isLoading: false 
      })
      throw error
    }
  },
  
  deleteCharacter: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(API_ENDPOINTS.CHARACTER(id))
      set({ 
        characters: get().characters.filter(c => c.id !== id),
        selectedCharacter: get().selectedCharacter?.id === id ? null : get().selectedCharacter,
        isLoading: false 
      })
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to delete character', 
        isLoading: false 
      })
      throw error
    }
  },
  
  clearError: () => set({ error: null }),
}))

