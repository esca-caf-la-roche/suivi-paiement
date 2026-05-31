import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { HelloassoLink } from '../types/database'

export interface NewHelloassoLink {
  url:            string
  label:          string
  is_installment: boolean
  responsible_id: string | null
}

export interface UseHelloassoLinksReturn {
  links:      HelloassoLink[]
  loading:    boolean
  error:      string | null
  addLink:    (data: NewHelloassoLink) => Promise<void>
  updateLink: (id: string, data: Partial<NewHelloassoLink>) => Promise<void>
  deleteLink: (id: string) => Promise<void>
  refresh:    () => void
}

export function useHelloassoLinks(): UseHelloassoLinksReturn {
  const [links, setLinks]     = useState<HelloassoLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tick, setTick]       = useState(0)

  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('helloasso_links')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          setLinks(data ?? [])
        }
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const addLink = useCallback(async (data: NewHelloassoLink) => {
    const { error } = await supabase
      .from('helloasso_links')
      .insert({
        url:            data.url,
        label:          data.label,
        is_installment: data.is_installment,
        responsible_id: data.responsible_id || null,
      })
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const updateLink = useCallback(async (id: string, data: Partial<NewHelloassoLink>) => {
    const { error } = await supabase
      .from('helloasso_links')
      .update(data)
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const deleteLink = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('helloasso_links')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  return { links, loading, error, addLink, updateLink, deleteLink, refresh }
}
