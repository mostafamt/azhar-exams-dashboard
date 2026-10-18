import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { docPath } from '../lib/paths'

// Live single document; `data` is null when it doesn't exist.
export function useDocument(ids) {
  const path = docPath(ids)
  const [state, setState] = useState({ path: null, data: null, error: null })

  useEffect(() => {
    return onSnapshot(
      doc(db, path),
      (snapshot) =>
        setState({
          path,
          data: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
          error: null,
        }),
      (error) => setState({ path, data: null, error }),
    )
  }, [path])

  const loading = state.path !== path
  return { data: loading ? null : state.data, loading, error: loading ? null : state.error }
}
