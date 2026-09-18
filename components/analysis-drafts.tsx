'use client'
import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

// Ephemeral, session-scoped memory: includes selected Files, never localStorage.
// The authenticated layout keys the provider by user, so signing out discards drafts.
const Drafts = createContext<Map<string, unknown> | null>(null)
export function AnalysisDrafts({ children }: { children: ReactNode }) {
  const [store] = useState(() => new Map<string, unknown>())
  return <Drafts.Provider value={store}>{children}</Drafts.Provider>
}
export function useAnalysisDraft<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(Drafts)
  const [value, setValue] = useState<T>(() => {
    if (!store?.has(key)) store?.set(key, initial)
    return store?.has(key) ? store.get(key) as T : initial
  })
  const current = useRef(value)
  const update: Dispatch<SetStateAction<T>> = useCallback(next => {
    const resolved = typeof next === 'function' ? (next as (v: T) => T)(current.current) : next
    current.current = resolved
    store?.set(key, resolved)
    setValue(resolved)
  }, [store, key])
  return [value, update]
}
