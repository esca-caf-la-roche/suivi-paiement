import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ApprovedStudent } from '../types/database'

export interface UseApprovedStudentsReturn {
  approvedStudents:      ApprovedStudent[]
  loading:               boolean
  error:                 string | null
  addApprovedStudent:    (data: Omit<ApprovedStudent, 'id' | 'created_at'>) => Promise<void>
  updateApprovedStudent: (id: string, data: Omit<ApprovedStudent, 'id' | 'created_at'>) => Promise<void>
  deleteApprovedStudent: (id: string) => Promise<void>
  refresh:               () => void
}

export function useApprovedStudents(): UseApprovedStudentsReturn {
  const [approvedStudents, setApprovedStudents] = useState<ApprovedStudent[]>([])
  const [loading, setLoading]                   = useState(true)
  const [error, setError]                       = useState<string | null>(null)
  const [tick, setTick]                         = useState(0)

  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('approved_students')
      .select('*')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          setApprovedStudents(data ?? [])
        }
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const addApprovedStudent = useCallback(async (data: Omit<ApprovedStudent, 'id' | 'created_at'>) => {
    const { error } = await supabase
      .from('approved_students')
      .insert({
        first_name: data.first_name,
        last_name:  data.last_name,
        email:      data.email.trim(),
        group_id:   data.group_id
      })
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const updateApprovedStudent = useCallback(async (id: string, data: Omit<ApprovedStudent, 'id' | 'created_at'>) => {
    const { error } = await supabase
      .from('approved_students')
      .update({
        first_name: data.first_name,
        last_name:  data.last_name,
        email:      data.email.trim(),
        group_id:   data.group_id
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const deleteApprovedStudent = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('approved_students')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  return { approvedStudents, loading, error, addApprovedStudent, updateApprovedStudent, deleteApprovedStudent, refresh }
}
