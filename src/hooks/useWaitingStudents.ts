import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { WaitingStudent } from '../types/database'

export interface UseWaitingStudentsReturn {
  waitingStudents:      WaitingStudent[]
  loading:               boolean
  error:                 string | null
  addWaitingStudent:    (data: Omit<WaitingStudent, 'id' | 'created_at'>) => Promise<void>
  addWaitingStudentsBulk: (data: Omit<WaitingStudent, 'id' | 'created_at'>[]) => Promise<void>
  updateWaitingStudent: (id: string, data: Omit<WaitingStudent, 'id' | 'created_at'>) => Promise<void>
  deleteWaitingStudent: (id: string) => Promise<void>
  refresh:               () => void
}

export function useWaitingStudents(): UseWaitingStudentsReturn {
  const [waitingStudents, setWaitingStudents] = useState<WaitingStudent[]>([])
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [tick, setTick]                       = useState(0)

  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('waiting_students')
      .select('*')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          setWaitingStudents(data ?? [])
        }
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const addWaitingStudent = useCallback(async (data: Omit<WaitingStudent, 'id' | 'created_at'>) => {
    const { error } = await supabase
      .from('waiting_students')
      .insert({
        first_name: data.first_name.trim(),
        last_name:  data.last_name.trim(),
        email:      data.email.trim()
      })
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const addWaitingStudentsBulk = useCallback(async (data: Omit<WaitingStudent, 'id' | 'created_at'>[]) => {
    if (data.length === 0) return
    const formatted = data.map(d => ({
      first_name: d.first_name.trim(),
      last_name:  d.last_name.trim(),
      email:      d.email.trim()
    }))
    const { error } = await supabase
      .from('waiting_students')
      .insert(formatted)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const updateWaitingStudent = useCallback(async (id: string, data: Omit<WaitingStudent, 'id' | 'created_at'>) => {
    const { error } = await supabase
      .from('waiting_students')
      .update({
        first_name: data.first_name.trim(),
        last_name:  data.last_name.trim(),
        email:      data.email.trim()
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  const deleteWaitingStudent = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('waiting_students')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
  }, [refresh])

  return { waitingStudents, loading, error, addWaitingStudent, addWaitingStudentsBulk, updateWaitingStudent, deleteWaitingStudent, refresh }
}
