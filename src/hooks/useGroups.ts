// ─────────────────────────────────────────────────────────────────────────────
// Hook : useGroups
//
// CRUD complet sur la table `groups`.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Group } from '../types/database'

export interface NewGroup {
  name:    string
  link_id: string
}

export interface UseGroupsReturn {
  groups:      Group[]
  loading:     boolean
  error:       string | null
  addGroup:    (data: NewGroup) => Promise<void>
  updateGroup: (id: string, data: Partial<NewGroup>) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  refresh:     () => void
}

export function useGroups(): UseGroupsReturn {
  const [groups, setGroups]   = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tick, setTick]       = useState(0)

  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('groups')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          setGroups(data ?? [])
        }
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const addGroup = useCallback(async (data: NewGroup) => {
    const { error } = await supabase
      .from('groups')
      .insert(data)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const updateGroup = useCallback(async (id: string, data: Partial<NewGroup>) => {
    const { error } = await supabase
      .from('groups')
      .update(data)
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const deleteGroup = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  return { groups, loading, error, addGroup, updateGroup, deleteGroup, refresh }
}
