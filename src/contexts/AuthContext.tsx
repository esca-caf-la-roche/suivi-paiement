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

  // Charge le profil responsable depuis la DB
  async function loadResponsible(userId: string) {
    const { data, error } = await supabase
      .from('responsibles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) setResponsible(data)
    else setResponsible(null)
  }

  useEffect(() => {
    // Session initiale (au montage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadResponsible(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Écoute les changements de session (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user) {
          loadResponsible(session.user.id)
        } else {
          setResponsible(null)
        }
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
