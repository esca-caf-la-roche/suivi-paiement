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

export interface UseDossiersReturn {
  dossiers:      Dossier[]
  responsibles:  Responsible[]
  loading:       boolean
  error:         string | null
  refresh:       () => Promise<void>
  upsertStatus:  (dossierKey: string, status: PaymentStatusEnum, comment: string | null) => Promise<void>
  resetStatus:   (dossierKey: string) => Promise<void>
}

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
      const [
        { data: registrantsRaw, error: regErr },
        { data: linksRaw,       error: linksErr },
        { data: groupsRaw,      error: groupsErr },
        { data: groupLinksRaw,  error: glErr },
        { data: statusesRaw,    error: statusesErr },
        { data: responsiblesRaw, error: respErr },
      ] = await Promise.all([
        supabase.from('registrants').select('*'),
        supabase.from('helloasso_links').select('*'),
        supabase.from('groups').select('*'),
        supabase.from('group_links').select('*'),
        supabase.from('payments_status').select('*'),
        supabase.from('responsibles').select('*'),
      ])

      if (regErr)      throw regErr
      if (linksErr)    throw linksErr
      if (groupsErr)   throw groupsErr
      if (glErr)       throw glErr
      if (statusesErr) throw statusesErr
      if (respErr)     throw respErr

      const registrants:  Registrant[]    = registrantsRaw  ?? []
      const links:        HelloassoLink[] = linksRaw        ?? []
      const groups:       Group[]         = groupsRaw       ?? []
      const groupLinks:   any[]           = groupLinksRaw   ?? []
      const statuses:     any[]           = statusesRaw     ?? []
      const resps:        Responsible[]   = responsiblesRaw ?? []

      setResponsibles(resps)

      const linksMap  = new Map<string, HelloassoLink>(links.map(l => [l.id, l]))
      const statusMap = new Map<string, any>(statuses.map(s => [s.helloasso_payment_id, s]))

      const linkToGroups = new Map<string, string[]>()
      for (const gl of groupLinks) {
        if (!linkToGroups.has(gl.link_id)) linkToGroups.set(gl.link_id, [])
        linkToGroups.get(gl.link_id)!.push(gl.group_id)
      }

      const dossierMap = new Map<string, Registrant[]>()
      for (const reg of registrants) {
        const link = linksMap.get(reg.helloasso_link_id)
        if (!link) continue
        const groupIds = linkToGroups.get(link.id) ?? []
        const key = computeDossierKey(reg, link.is_installment, groupIds)
        if (!dossierMap.has(key)) dossierMap.set(key, [])
        dossierMap.get(key)!.push(reg)
      }

      const result: Dossier[] = []

      for (const [dossierKey, regs] of dossierMap) {
        regs.sort((a, b) => a.payment_date.localeCompare(b.payment_date))

        const first = regs[0]
        const link  = linksMap.get(first.helloasso_link_id)!

        if (link.responsible_id && link.responsible_id !== user?.id) continue

        const groupIds = linkToGroups.get(link.id) ?? []
        const dossierGroups = groups.filter(g => groupIds.includes(g.id))

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

        const has_status_mismatch =
          status === 'Traité' &&
          regs.some(r => r.helloasso_status === 'Refunded' || r.helloasso_status === 'Refused')

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

      // Ordre chronologique : plus vieux en premier
      result.sort((a, b) => a.first_payment_date.localeCompare(b.first_payment_date))

      setDossiers(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const upsertStatus = useCallback(async (
    dossierKey: string,
    status:     PaymentStatusEnum,
    comment:    string | null,
  ) => {
    if (!user?.id) throw new Error('Non authentifié')

    const dossier = dossiers.find(d => d.dossier_key === dossierKey)
    if (!dossier) throw new Error('Dossier introuvable')

    const now = new Date().toISOString()
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

    setDossiers(prev => prev.map(d => {
      if (d.dossier_key !== dossierKey) return d
      return {
        ...d,
        status,
        comment:    comment ?? null,
        updated_by: user.id,
        updated_at: now,
        has_status_mismatch:
          status === 'Traité' &&
          d.installments.some(r => r.helloasso_status === 'Refunded' || r.helloasso_status === 'Refused'),
      }
    }))
  }, [dossiers, user])

  const resetStatus = useCallback(async (dossierKey: string) => {
    const dossier = dossiers.find(d => d.dossier_key === dossierKey)
    if (!dossier) throw new Error('Dossier introuvable')

    const ids = dossier.installments.map(r => r.helloasso_payment_id)
    const { error } = await supabase
      .from('payments_status')
      .delete()
      .in('helloasso_payment_id', ids)

    if (error) throw error

    setDossiers(prev => prev.map(d => {
      if (d.dossier_key !== dossierKey) return d
      return { ...d, status: null, comment: null, updated_by: null, updated_at: null, has_status_mismatch: false }
    }))
  }, [dossiers])

  return { dossiers, responsibles, loading, error, refresh: load, upsertStatus, resetStatus }
}
