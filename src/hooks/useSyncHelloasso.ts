// ─────────────────────────────────────────────────────────────────────────────
// Hook : useSyncHelloasso
//
// Appelle la Vercel Function `/api/sync-helloasso` (remplace l'Edge Function
// Supabase qui était bloquée par le WAF Cloudflare de HelloAsso).
//
// Utilisé par la page de validation :
//   - auto-déclenché au montage
//   - ré-déclenché par le bouton refresh manuel
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react'

export interface SyncResult {
  synced_count: number
  errors:       string[]
  cached?:      boolean
}

export interface UseSyncHelloassoReturn {
  /** Résultat de la dernière sync (null = jamais lancée) */
  result:     SyncResult | null
  /** En cours de sync */
  loading:    boolean
  /** Erreur réseau ou métier */
  error:      string | null
  /** Timestamp ISO de la dernière sync réussie */
  lastSyncAt: string | null
  /** Lance (ou re-lance) une sync. force=true est transmis à la fonction. */
  sync:       (force?: boolean) => Promise<void>
}

export function useSyncHelloasso(): UseSyncHelloassoReturn {
  const [result,     setResult]     = useState<SyncResult | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  // Empêche les doubles appels simultanés
  const inFlightRef = useRef(false)

  const sync = useCallback(async (force = false) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/sync-helloasso', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ force }),
      })

      // Lire le corps JSON (même en cas d'erreur HTTP)
      let data: SyncResult | null = null
      try {
        data = await res.json() as SyncResult
      } catch {
        throw new Error(`Réponse non-JSON (HTTP ${res.status})`)
      }

      if (!res.ok) {
        // La Vercel Function retourne toujours { synced_count, errors }
        const detail = data?.errors?.[0] ?? `Erreur HTTP ${res.status}`
        throw new Error(detail)
      }

      if (data) {
        setResult(data)
        setLastSyncAt(new Date().toISOString())
        if (data.errors.length > 0) {
          console.warn('[useSyncHelloasso] Sync errors:', data.errors)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error('[useSyncHelloasso]', message)
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [])

  return { result, loading, error, lastSyncAt, sync }
}
