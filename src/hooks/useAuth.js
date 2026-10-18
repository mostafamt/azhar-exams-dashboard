import { useContext } from 'react'
import { AuthContext } from '../auth/AuthContext'

// { user, profile, loading, isAdmin }
export function useAuth() {
  return useContext(AuthContext)
}
