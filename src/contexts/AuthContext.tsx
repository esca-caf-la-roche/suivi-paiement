import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Responsible } from '../types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  responsible: Responsible | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [responsible, setResponsible] = useState<Responsible | null>(null)
  const [loading, setLoading] = useState(true)

  // Charge le profil responsable depuis la DB (fire-and-forget, pas de await)
  function loadResponsible(userId: string) {
    supabase
      .from('responsibles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setResponsible(data)
        else setResponsible(null)
      })
  }

  useEffect(() => {
    // 1. Session initiale au montage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) loadResponsible(session.user.id)
      setLoading(false)
    })

    // 2. Changements de session (login OTP, logout, refresh token)
    // IMPORTANT : le callback doit être synchrone (pas async/await)
    // Supabase ne supporte pas les callbacks async dans onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user) {
          loadResponsible(session.user.id)
        } else {
          setResponsible(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      responsible,
      loading,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
