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
    // onAuthStateChange est la source de vérité unique pour la session.
    // Il se déclenche immédiatement au montage avec la session existante,
    // ET à chaque login/logout/refresh — donc on y gère aussi setLoading.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          await loadResponsible(session.user.id)
        } else {
          setResponsible(null)
        }
        // Toujours lever le loading une fois qu'on a la réponse
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
