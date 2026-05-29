// ─────────────────────────────────────────────────────────────────────────────
// Hook : useDossiers  (Phase 6)
//
// Charge toutes les données nécessaires à la page de validation et les agrège
// en une liste de Dossier[] côté client.
//
// Dossier = unité logique de validation :
//   - Paiement 1x → 1 registrant, dossier_key = helloasso_payment_id
//   - Paiement 3x → 3 registrants, dossier_key = payer_email::parent_link_id
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { computeDossierKey } from '../types/database'
import type {
  Dossier,
  Registrant,
  HelloassoLink,
  Group,
  Responsible,
  PaymentStatusEnum,
} from '../types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDossiersReturn {
  dossiers:      Dossier[]
  responsibles:  Responsible[]         // pour afficher le nom de l'auteur
  loading:       boolean
  error:         string | null
  refresh:       () => Promise<void>
  upsertStatus:  (
    dossierKey: string,
    status:     PaymentStatusEnum,
    comment:    string | null,
  ) => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDossiers(): UseDossiersReturn {
  const { user } = useAuth()

  const [dossiers,     setDossiers]     = useState<Dossier[]>([])
  const [responsibles, setResponsibles] = useState<Responsible[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── Chargement parallèle de toutes les tables ──────────────────────────
      const [
        { data: registrantsRaw, error: regErr },
        { data: linksRaw,       error: linksErr },
        { data: groupsRaw,      error: groupsErr },
        { data: statusesRaw,    error: statusesErr },
        { data: responsiblesRaw, error: respErr },
      ] = await Promise.all([
        supabase.from('registrants').select('*'),
        supabase.from('helloasso_links').select('*'),
        supabase.from('groups').select('*'),
        supabase.from('payments_status').select('*'),
        supabase.from('responsibles').select('*'),
      ])

      if (regErr)     throw regErr
      if (linksErr)   throw linksErr
      if (groupsErr)  throw groupsErr
      if (statusesErr) throw statusesErr
      if (respErr)    throw respErr

      const registrants:  Registrant[]    = registrantsRaw  ?? []
      const links:        HelloassoLink[] = linksRaw        ?? []
      const groups:       Group[]         = groupsRaw       ?? []
      const statuses:     any[]           = statusesRaw     ?? []
      const resps:        Responsible[]   = responsiblesRaw ?? []

      setResponsibles(resps)

      // ── Maps rapides ────────────────────────────────────────────────────────
      const linksMap  = new Map<string, HelloassoLink>(links.map(l => [l.id, l]))
      const statusMap = new Map<string, any>(statuses.map(s => [s.helloasso_payment_id, s]))

      // ── Regroupement des registrants par dossier_key ───────────────────────
      const dossierMap = new Map<string, Registrant[]>()

      for (const reg of registrants) {
        const link = linksMap.get(reg.helloasso_link_id)
        if (!link) continue                          // lien inconnu → ignore

        const key = computeDossierKey(reg, link)
        if (!dossierMap.has(key)) dossierMap.set(key, [])
        dossierMap.get(key)!.push(reg)
      }

      // ── Construction des Dossier[] ─────────────────────────────────────────
      const result: Dossier[] = []

      for (const [dossierKey, regs] of dossierMap) {
        // Tri chronologique des échéances
        regs.sort((a, b) => a.payment_date.localeCompare(b.payment_date))

        const first = regs[0]
        const link  = linksMap.get(first.helloasso_link_id)!

        // Lien principal servant de clé pour les groupes
        const principalLinkId = link.is_installment && link.parent_link_id
          ? link.parent_link_id
          : link.id

        // Filtre : n'afficher que les dossiers du lien assigné à l'utilisateur courant
        // (si responsible_id est null → visible par tous)
        const principalLink = linksMap.get(principalLinkId)
        if (principalLink?.responsible_id && principalLink.responsible_id !== user?.id) continue

        // Groupes associés à ce dossier
        const dossierGroups = groups.filter(g => g.link_id === principalLinkId)

        // Statut agrégé : on prend la ligne la plus récente parmi toutes les
        // échéances (en cas de divergence, la mise à jour la plus récente gagne)
        const dossierStatuses = regs
          .map(r => statusMap.get(r.helloasso_payment_id))
          .filter(Boolean)

        let status:     PaymentStatusEnum | null = null
        let comment:    string | null = null
        let updated_by: string | null = null
        let updated_at: string | null = null

        if (dossierStatuses.length > 0) {
          const latest = [...dossierStatuses].sort(
            (a, b) => b.updated_at.localeCompare(a.updated_at),
          )[0]
          status     = latest.status
          comment    = latest.comment ?? null
          updated_by = latest.updated_by
          updated_at = latest.updated_at
        }

        // Divergence : traité localement mais remboursé / refusé chez HelloAsso
        const has_status_mismatch =
          status === 'Traité' &&
          regs.some(r =>
            r.helloasso_status === 'Refunded' ||
            r.helloasso_status === 'Refused',
          )

        result.push({
          dossier_key:        dossierKey,
          is_installment:     link.is_installment,
          payer_first_name:   first.payer_first_name,
          payer_last_name:    first.payer_last_name,
          payer_email:        first.payer_email,
          first_payment_date: first.payment_date,
          total_amount:       regs.reduce((sum, r) => sum + Number(r.amount), 0),
          groups:             dossierGroups,
          installments:       regs,
          status,
          comment,
          updated_by,
          updated_at,
          has_status_mismatch,
        })
      }

      // Tri par date décroissante
      result.sort((a, b) =>
        b.first_payment_date.localeCompare(a.first_payment_date),
      )

      setDossiers(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── upsertStatus ────────────────────────────────────────────────────────────
  const upsertStatus = useCallback(async (
    dossierKey: string,
    status:     PaymentStatusEnum,
    comment:    string | null,
  ) => {
    if (!user?.id) throw new Error('Non authentifié')

    const dossier = dossiers.find(d => d.dossier_key === dossierKey)
    if (!dossier) throw new Error('Dossier introuvable')

    const now = new Date().toISOString()

    // Upsert une ligne par paiement (même dossier_key, même statut)
    const rows = dossier.installments.map(reg => ({
      helloasso_payment_id: reg.helloasso_payment_id,
      dossier_key:          dossierKey,
      status,
      comment:              comment ?? null,
      updated_by:           user.id,
      updated_at:           now,
    }))

    const { error: upsertErr } = await supabase
      .from('payments_status')
      .upsert(rows, { onConflict: 'helloasso_payment_id' })

    if (upsertErr) throw upsertErr

    // Mise à jour optimiste (évite un re-fetch complet)
    setDossiers(prev =>
      prev.map(d => {
        if (d.dossier_key !== dossierKey) return d
        return {
          ...d,
          status,
          comment:    comment ?? null,
          updated_by: user.id,
          updated_at: now,
          has_status_mismatch:
            status === 'Traité' &&
            d.installments.some(
              r => r.helloasso_status === 'Refunded' || r.helloasso_status === 'Refused',
            ),
        }
      }),
    )
  }, [dossiers, user])

  return { dossiers, responsibles, loading, error, refresh: load, upsertStatus }
}
