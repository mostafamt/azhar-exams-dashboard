import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { sortItems } from '../lib/crud'
import { categoriesPath, collectionPath } from '../lib/paths'

// Live, sorted list of the children of `parentIds`.
export function useCollection(parentIds) {
  return useCollectionAt(collectionPath(parentIds))
}

// Live, sorted categories of a section; pass null when not on a subjects page.
export function useCategories(sectionIds) {
  return useCollectionAt(sectionIds ? categoriesPath(sectionIds) : null)
}

function useCollectionAt(path) {
  const [state, setState] = useState({ path: null, items: [], error: null })

  useEffect(() => {
    if (!path) return
    return onSnapshot(
      collection(db, path),
      (snapshot) =>
        setState({
          path,
          items: sortItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
          error: null,
        }),
      (error) => setState({ path, items: [], error }),
    )
  }, [path])

  if (!path) return { items: [], loading: false, error: null }
  // Until the first snapshot for the current path arrives, don't show the previous path's data
  const loading = state.path !== path
  return { items: loading ? [] : state.items, loading, error: loading ? null : state.error }
}
