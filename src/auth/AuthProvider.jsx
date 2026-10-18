import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { AuthContext } from './AuthContext'

// Tracks the signed-in user and whether admins/{uid} exists for them.
export function AuthProvider({ children }) {
  // undefined = not known yet, null = signed out
  const [user, setUser] = useState(undefined)
  const [admin, setAdmin] = useState({ uid: null, isAdmin: false })

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      doc(db, 'admins', user.uid),
      (snapshot) => setAdmin({ uid: user.uid, isAdmin: snapshot.exists() }),
      () => setAdmin({ uid: user.uid, isAdmin: false }),
    )
  }, [user])

  const adminKnown = !user || admin.uid === user.uid
  const value = {
    user: user ?? null,
    loading: user === undefined || !adminKnown,
    isAdmin: Boolean(user) && admin.uid === user.uid && admin.isAdmin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
