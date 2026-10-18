import { useContext } from 'react'
import { AuthContext } from '../auth/AuthContext'

// { user, loading, isAdmin }
export function useAuth() {
  return useContext(AuthContext)
}
