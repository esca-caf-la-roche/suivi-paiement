// ─────────────────────────────────────────────────────────────────────────────
// Composant : Layout
//
// Enveloppe toutes les pages protégées :
//   - Barre de navigation horizontale (Config / Validation)
//   - Infos utilisateur + bouton déconnexion
//   - <Outlet /> pour le contenu de la page courante
// ─────────────────────────────────────────────────────────────────────────────

import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Layout() {
  const { responsible, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-blanc font-sans flex flex-col">
      {/* ── Barre de navigation ───────────────────────────────────────────── */}
      <header className="border-b-4 border-noir bg-blanc">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Logo / titre */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1">
              CAF
            </span>
            <span className="font-black text-noir text-lg leading-none">
              FJD Inscriptions
            </span>
          </div>

          {/* Séparateur */}
          <div className="hidden sm:block w-px h-6 bg-noir/20" />

          {/* Liens de navigation */}
          <nav className="flex gap-1">
            <NavLink
              to="/config"
              className={({ isActive }) =>
                `text-xs font-bold uppercase tracking-widest px-3 py-1.5 border-2 transition-colors ${
                  isActive
                    ? 'bg-noir text-blanc border-noir'
                    : 'border-transparent text-noir hover:border-noir'
                }`
              }
            >
              Config
            </NavLink>
            <NavLink
              to="/validation"
              className={({ isActive }) =>
                `text-xs font-bold uppercase tracking-widest px-3 py-1.5 border-2 transition-colors ${
                  isActive
                    ? 'bg-noir text-blanc border-noir'
                    : 'border-transparent text-noir hover:border-noir'
                }`
              }
            >
              Validation
            </NavLink>
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Utilisateur + déconnexion */}
          <div className="flex items-center gap-3">
            {responsible && (
              <span className="text-xs font-mono text-noir/60 hidden sm:block">
                {responsible.name}
              </span>
            )}
            <button
              onClick={signOut}
              className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 border-2 border-noir hover:bg-noir hover:text-blanc transition-colors"
            >
              Déco
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenu de la page ────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
