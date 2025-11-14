export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const API_ENDPOINTS = {
  // Auth
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
  ME: '/auth/me',
  
  // Characters
  CHARACTERS: '/characters',
  CHARACTER: (id: number) => `/characters/${id}`,
  
  // Campaigns
  CAMPAIGNS: '/campaigns',
  CAMPAIGN: (id: number) => `/campaigns/${id}`,
}

