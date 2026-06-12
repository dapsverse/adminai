import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  fullName: string
  businessName: string
  invoiceSenderName?: string | null
  emailPollIntervalMinutes?: number
  onboardingState?: unknown
  tier?: string
  createdAt?: string
  telegramConnected?: boolean
}

interface AuthStore {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    { name: 'adminai-auth' }
  )
)
