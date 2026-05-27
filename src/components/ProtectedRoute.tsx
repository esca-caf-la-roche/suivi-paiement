import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  children: React.ReactNode
}

/**
 * Redirige vers /login si l'utilisateur n'est pas connecté.
 * Affiche un loader pendant la vérification de session initiale.
 */
export default function ProtectedRoute({ children }: Props) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-blanc flex items-center justify-center">
        <span className="font-mono text-sm text-noir animate-pulse">Chargement…</span>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
