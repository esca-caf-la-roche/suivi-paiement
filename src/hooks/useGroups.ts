// ─────────────────────────────────────────────────────────────────────────────
// Hook : useGroups
//
// CRUD complet sur la table `groups`.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Group } from '../types/database'

export interface NewGroup {
  name:     string
  link_ids: string[]
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
      .select('*, group_links(link_id)')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          const mapped = (data ?? []).map((row: any) => ({
            id: row.id,
            name: row.name,
            link_ids: row.group_links?.map((gl: any) => gl.link_id) ?? []
          }))
          setGroups(mapped)
        }
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const addGroup = useCallback(async (data: NewGroup) => {
    const { data: newGroup, error } = await supabase
      .from('groups')
      .insert({ name: data.name })
      .select()
      .single()
    if (error) throw new Error(error.message)
    
    if (data.link_ids && data.link_ids.length > 0) {
      const { error: linkError } = await supabase
        .from('group_links')
        .insert(data.link_ids.map(linkId => ({ group_id: newGroup.id, link_id: linkId })))
      if (linkError) throw new Error(linkError.message)
    }
    refresh()
  }, [refresh])

  const updateGroup = useCallback(async (id: string, data: Partial<NewGroup>) => {
    if (data.name !== undefined) {
      const { error } = await supabase
        .from('groups')
        .update({ name: data.name })
        .eq('id', id)
      if (error) throw new Error(error.message)
    }
    
    if (data.link_ids !== undefined) {
      const { error: delError } = await supabase
        .from('group_links')
        .delete()
        .eq('group_id', id)
      if (delError) throw new Error(delError.message)
        
      if (data.link_ids.length > 0) {
        const { error: insError } = await supabase
          .from('group_links')
          .insert(data.link_ids.map(linkId => ({ group_id: id, link_id: linkId })))
        if (insError) throw new Error(insError.message)
      }
    }
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
