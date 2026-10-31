export interface UserProfile {
  id: string
  username: string
  email: string
  email_verified: boolean
  first_name: string
  last_name: string
  bio: string
  timezone: string
  avatar: string | null
  date_joined: string
}

export interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  error: string | null
  login: (identifier: string, password: string) => Promise<void>
  register: (data: {
    username: string
    email: string
    password: string
    first_name: string
    last_name: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  setUser: (user: UserProfile) => void
}
