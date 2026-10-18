import { useAuth } from './useAuth'

// Admin = signed in and listed in the `admins` collection (see firestore.rules).
export function useIsAdmin() {
  return useAuth().isAdmin
}
