// ─────────────────────────────────────────────────────────────────────────────
// Hook : useSyncHelloasso
//
// Appelle l'Edge Function `sync-helloasso` et expose l'état de la sync.
// Utilisé par la page de validation :
//   - auto-déclenché au montage
//   - ré-déclenché par le bouton refresh manuel
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export interface SyncResult {
  synced_count: number
  errors: string[]
  cached?: boolean
}

export interface UseSyncHelloassoReturn {
  /** Résultat de la dernière sync (null = jamais lancée) */
  result: SyncResult | null
  /** En cours de sync */
  loading: boolean
  /** Erreur réseau/fetch (distinct des erreurs métier dans result.errors) */
  error: string | null
  /** Timestamp ISO de la dernière sync réussie */
  lastSyncAt: string | null
  /** Lance (ou re-lance) une sync. force=true invalide le cache côté serveur. */
  sync: (force?: boolean) => Promise<void>
}

export function useSyncHelloasso(): UseSyncHelloassoReturn {
  const [result, setResult]       = useState<SyncResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  // Empêche les doubles appels simultanés
  const inFlightRef = useRef(false)

  const sync = useCallback(async (force = false) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke<SyncResult>(
        'sync-helloasso',
        {
          method: 'POST',
          // Passer force=true permet d'implémenter côté Edge Function
          // une invalidation de cache si besoin (actuellement ignoré par la fonction)
          body: { force },
        },
      )

      if (fnError) {
        throw new Error(fnError.message)
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
