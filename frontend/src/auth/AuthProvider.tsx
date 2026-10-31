import axios from 'axios'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { apiClient, ensureCsrfToken } from '../lib/api/client'
import { AuthContext } from './context'
import { getApiErrorMessage } from './errors'
import type { AuthContextValue, UserProfile } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = useCallback(async () => {
    const { data } = await apiClient.get<UserProfile>('/auth/me/')
    setUser(data)
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        await ensureCsrfToken()
        const { data } = await apiClient.get<UserProfile>('/auth/me/')
        if (active) setUser(data)
      } catch (loadError) {
        if (active && axios.isAxiosError(loadError) && loadError.response?.status !== 401) {
          setError(getApiErrorMessage(loadError))
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(
    async (identifier: string, password: string) => {
      setError(null)
      await ensureCsrfToken()
      const { data } = await apiClient.post<{ user: UserProfile }>('/auth/login/', {
        identifier,
        password,
      })
      setUser(data.user)
    },
    [],
  )

  const register = useCallback(
    async (data: {
      username: string
      email: string
      password: string
      first_name: string
      last_name: string
    }) => {
      setError(null)
      await ensureCsrfToken()
      await apiClient.post('/auth/register/', data)
    },
    [],
  )

  const logout = useCallback(async () => {
    await ensureCsrfToken()
    await apiClient.post('/auth/logout/')
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, login, register, logout, refreshUser, setUser }),
    [user, loading, error, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
