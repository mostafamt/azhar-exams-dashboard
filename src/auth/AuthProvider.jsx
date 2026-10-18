import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { AuthContext } from './AuthContext'

// Tracks the signed-in user and their users/{uid} profile (role 'admin' unlocks editing).
export function AuthProvider({ children }) {
  // undefined = not known yet, null = signed out
  const [user, setUser] = useState(undefined)
  // profile: users/{uid} data, or null when the document doesn't exist (yet)
  const [account, setAccount] = useState({ uid: null, profile: null })

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => setAccount({ uid: user.uid, profile: snapshot.exists() ? snapshot.data() : null }),
      () => setAccount({ uid: user.uid, profile: null }),
    )
  }, [user])

  const profileKnown = !user || account.uid === user.uid
  const profile = user && account.uid === user.uid ? account.profile : null
  const value = {
    user: user ?? null,
    profile,
    loading: user === undefined || !profileKnown,
    isAdmin: profile?.role === 'admin',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
