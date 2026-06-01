import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type {
  Dossier,
  HelloassoTransaction,
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
  upsertStatus:  (dossierId: string, status: PaymentStatusEnum, comment: string | null) => Promise<void>
  resetStatus:   (dossierId: string) => Promise<void>
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
        { data: dossiersRaw,    error: dosErr },
        { data: linksRaw,       error: linksErr },
        { data: groupsRaw,      error: groupsErr },
        { data: groupLinksRaw,  error: glErr },
        { data: responsiblesRaw, error: respErr },
      ] = await Promise.all([
        supabase.from('dossiers').select('*, helloasso_transactions(*)'),
        supabase.from('helloasso_links').select('*'),
        supabase.from('groups').select('*'),
        supabase.from('group_links').select('*'),
        supabase.from('responsibles').select('*'),
      ])

      if (dosErr)      throw dosErr
      if (linksErr)    throw linksErr
      if (groupsErr)   throw groupsErr
      if (glErr)       throw glErr
      if (respErr)     throw respErr

      const rawDossiers:  any[]           = dossiersRaw     ?? []
      const links:        HelloassoLink[] = linksRaw        ?? []
      const groups:       Group[]         = groupsRaw       ?? []
      const groupLinks:   any[]           = groupLinksRaw   ?? []
      const resps:        Responsible[]   = responsiblesRaw ?? []

      setResponsibles(resps)

      const linksMap  = new Map<string, HelloassoLink>(links.map(l => [l.id, l]))

      const linkToGroups = new Map<string, string[]>()
      for (const gl of groupLinks) {
        if (!linkToGroups.has(gl.link_id)) linkToGroups.set(gl.link_id, [])
        linkToGroups.get(gl.link_id)!.push(gl.group_id)
      }

      const result: Dossier[] = []

      for (const d of rawDossiers) {
        const link = linksMap.get(d.helloasso_link_id)
        if (!link) continue

        // RLS : Si le lien a un responsable assigné, et que ce n'est pas l'utilisateur connecté, on ignore
        if (link.responsible_id && link.responsible_id !== user?.id) continue

        const groupIds = linkToGroups.get(link.id) ?? []
        const dossierGroups = groups.filter(g => groupIds.includes(g.id))

        // Récupérer et trier chronologiquement les transactions HelloAsso
        const transactions: HelloassoTransaction[] = d.helloasso_transactions ?? []
        // Filtrer les éventuels statuts invalides si nécessaire, mais HelloAsso a déjà filtré Refused/Canceled lors de la sync
        transactions.sort((a, b) => a.payment_date.localeCompare(b.payment_date))

        const firstPaymentDate = transactions.length > 0 ? transactions[0].payment_date : d.updated_at || new Date().toISOString()

        const has_status_mismatch =
          d.local_status === 'Traité' &&
          transactions.some(r => r.helloasso_status === 'Refunded' || r.helloasso_status === 'Refused')

        const isLocallyRefunded = d.local_status === 'Remboursé'
        const totalPaid = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
        const hasRefundTransaction = transactions.some(t => t.helloasso_payment_id.startsWith('refund-'))
        const isHARefunded = transactions.length > 0 && (totalPaid <= 0 || hasRefundTransaction || transactions.every(r => r.helloasso_status === 'Refunded'))
        
        const needs_refund_action = (isLocallyRefunded && !isHARefunded) || (!isLocallyRefunded && isHARefunded)

        result.push({
          id:                 d.id,
          helloasso_link_id:  d.helloasso_link_id,
          link_url:           link.url,
          is_installment:     link.is_installment,
          payer_first_name:   d.payer_first_name,
          payer_last_name:    d.payer_last_name,
          payer_email:        d.payer_email,
          first_name:         d.first_name,
          last_name:          d.last_name,
          email:              d.email,
          phone:              d.phone,
          first_payment_date: firstPaymentDate,
          total_amount:       Number(d.total_amount),
          groups:             dossierGroups,
          transactions,
          local_status:       d.local_status,
          comment:            d.comment,
          updated_by:         d.updated_by,
          updated_at:         d.updated_at,
          has_status_mismatch,
          needs_refund_action,
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
    dossierId: string,
    status:     PaymentStatusEnum,
    comment:    string | null,
  ) => {
    if (!user?.id) throw new Error('Non authentifié')

    const dossier = dossiers.find(d => d.id === dossierId)
    if (!dossier) throw new Error('Dossier introuvable')

    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('dossiers')
      .update({
        local_status: status,
        comment:      comment ?? null,
        updated_by:   user.id,
        updated_at:   now,
      })
      .eq('id', dossierId)

    if (updateErr) throw updateErr

    setDossiers(prev => prev.map(d => {
      if (d.id !== dossierId) return d
      return {
        ...d,
        local_status: status,
        comment:    comment ?? null,
        updated_by: user.id,
        updated_at: now,
        has_status_mismatch:
          status === 'Traité' &&
          d.transactions.some(r => r.helloasso_status === 'Refunded' || r.helloasso_status === 'Refused'),
        needs_refund_action: (() => {
          const totalPaid = d.transactions.reduce((sum, t) => sum + Number(t.amount), 0)
          const hasRefundTransaction = d.transactions.some(t => t.helloasso_payment_id.startsWith('refund-'))
          const isHARefunded = d.transactions.length > 0 && (totalPaid <= 0 || hasRefundTransaction || d.transactions.every(r => r.helloasso_status === 'Refunded'))
          return (status === 'Remboursé' && !isHARefunded) || (status !== 'Remboursé' && isHARefunded)
        })(),
      }
    }))
  }, [dossiers, user])

  const resetStatus = useCallback(async (dossierId: string) => {
    const dossier = dossiers.find(d => d.id === dossierId)
    if (!dossier) throw new Error('Dossier introuvable')

    const { error: updateErr } = await supabase
      .from('dossiers')
      .update({
        local_status: null,
        comment:      null,
        updated_by:   null,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', dossierId)

    if (updateErr) throw updateErr

    setDossiers(prev => prev.map(d => {
      if (d.id !== dossierId) return d
      return { 
        ...d, 
        local_status: null, 
        comment: null, 
        updated_by: null, 
        updated_at: null, 
        has_status_mismatch: false,
        needs_refund_action: (() => {
          const totalPaid = d.transactions.reduce((sum, t) => sum + Number(t.amount), 0)
          const hasRefundTransaction = d.transactions.some(t => t.helloasso_payment_id.startsWith('refund-'))
          return d.transactions.length > 0 && (totalPaid <= 0 || hasRefundTransaction || d.transactions.every(r => r.helloasso_status === 'Refunded'))
        })()
      }
    }))
  }, [dossiers])

  return { dossiers, responsibles, loading, error, refresh: load, upsertStatus, resetStatus }
}
