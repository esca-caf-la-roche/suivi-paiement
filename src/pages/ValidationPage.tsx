import { useState, useEffect, useMemo } from 'react'
import { useDossiers } from '../hooks/useDossiers'
import { useSyncHelloasso } from '../hooks/useSyncHelloasso'
import type { Dossier, PaymentStatusEnum, Responsible } from '../types/database'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: PaymentStatusEnum; label: string }> = [
  { value: 'Traité',     label: 'Traité'     },
  { value: 'En attente', label: 'En attente' },
  { value: 'Remboursé',  label: 'Remboursé'  },
  { value: 'Problème',   label: 'Problème'   },
]

// Statuts nécessitant un commentaire avant confirmation
const NEEDS_COMMENT = new Set<PaymentStatusEnum>(['En attente', 'Remboursé', 'Problème'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} à ${timeStr}`;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
}

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function statusBtnActive(status: PaymentStatusEnum): string {
  switch (status) {
    case 'Traité':     return 'bg-green-100 text-green-800 border-green-400'
    case 'En attente': return 'bg-citron/70 text-noir border-citron'
    case 'Remboursé':  return 'bg-glace/40 text-noir border-glace'
    case 'Problème':   return 'bg-red-100 text-red-700 border-red-400'
  }
}

// ─── Barre de stats ───────────────────────────────────────────────────────────

function StatsBar({ dossiers }: { dossiers: Dossier[] }) {
  const counts = useMemo(() => {
    const t: Record<string, number> = { total: dossiers.length }
    for (const d of dossiers) {
      const k = d.local_status ?? 'À traiter'
      t[k] = (t[k] ?? 0) + 1
    }
    return t
  }, [dossiers])

  const items = [
    { label: 'Total',      value: counts['total']      ?? 0, cls: 'text-noir' },
    { label: 'À traiter',  value: counts['À traiter']  ?? 0, cls: 'text-noir/50' },
    { label: 'En attente', value: counts['En attente'] ?? 0, cls: 'text-citron' },
    { label: 'Traité',     value: counts['Traité']     ?? 0, cls: 'text-green-600' },
    { label: 'Problème',   value: counts['Problème']   ?? 0, cls: 'text-red-600' },
    { label: 'Remboursé',  value: counts['Remboursé']  ?? 0, cls: 'text-glace' },
  ]

  return (
    <div className="flex flex-wrap gap-3 font-mono">
      {items.map(it => (
        <div key={it.label} className="flex items-baseline gap-1">
          <span className={`text-xl font-black ${it.cls}`}>{it.value}</span>
          <span className="text-noir/40 text-[10px] uppercase tracking-widest">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Carte de dossier ─────────────────────────────────────────────────────────

interface DossierCardProps {
  dossier:      Dossier
  responsibles: Responsible[]
  onSave:       (status: PaymentStatusEnum, comment: string | null) => Promise<void>
  onReset:      () => Promise<void>
}

function DossierCard({ dossier, responsibles, onSave, onReset }: DossierCardProps) {
  const [pendingStatus, setPendingStatus] = useState<PaymentStatusEnum | null>(null)
  const [comment,       setComment]       = useState('')
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState<string | null>(null)

  async function handleStatusClick(status: PaymentStatusEnum) {
    setErr(null)

    // Cliquer sur le statut actif → remettre à vierge
    if (dossier.local_status === status) {
      setSaving(true)
      try { await onReset() }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
      finally { setSaving(false) }
      return
    }

    // Remboursé / Problème → demander un commentaire avant de confirmer
    if (NEEDS_COMMENT.has(status)) {
      setComment(dossier.comment ?? '')
      setPendingStatus(status)
      return
    }

    // Traité / En attente → sauvegarde immédiate
    setSaving(true)
    try { await onSave(status, null) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function handleConfirm() {
    if (!pendingStatus) return
    setSaving(true)
    setErr(null)
    try {
      await onSave(pendingStatus, comment.trim() || null)
      setPendingStatus(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function cancelPending() {
    setPendingStatus(null)
    setComment('')
    setErr(null)
  }

  const resp = responsibles.find(r => r.id === dossier.updated_by)

  return (
    <div className={`border-b-2 border-noir/10 px-4 py-3 transition-opacity ${saving ? 'opacity-60' : ''}`}>

      {/* ── Identité + méta ── */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-noir/40 flex-shrink-0 w-14">Inscrit:</span>
              <span className="font-bold text-sm text-noir">
                {dossier.first_name} {dossier.last_name}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-noir/40 flex-shrink-0 w-14">Payeur:</span>
              <span className="font-mono text-xs text-noir/60">
                {dossier.payer_first_name} {dossier.payer_last_name}
              </span>
            </div>
            {dossier.payer_email && (
              <p className="font-mono text-[11px] text-noir/40 truncate pl-16">{dossier.payer_email}</p>
            )}
          </div>
          {dossier.groups.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {dossier.groups.map(g => (
                <span key={g.id} className="text-[10px] font-mono bg-glace/30 border border-glace px-1.5 py-0.5">
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 border ${
              dossier.is_installment ? 'bg-glace/30 border-glace' : 'bg-citron/40 border-citron/60'
            }`}>
              {dossier.is_installment ? '3×' : '1×'}
            </span>
            <span className="font-mono text-sm font-bold text-noir">{formatAmount(dossier.total_amount)}</span>
          </div>
          <span className="font-mono text-[11px] text-noir/40">{formatDateTime(dossier.first_payment_date)}</span>
          {resp && dossier.updated_at && (
            <span className="font-mono text-[10px] text-noir/30">{resp.name} · {formatDateTime(dossier.updated_at)}</span>
          )}
        </div>
      </div>

      {/* ── Boutons de statut ── */}
      {!pendingStatus && (
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleStatusClick(opt.value)}
              disabled={saving}
              className={`
                text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 border-2 transition-colors
                ${dossier.local_status === opt.value
                  ? statusBtnActive(opt.value)
                  : 'bg-blanc border-noir/20 text-noir/60 hover:border-noir hover:text-noir'
                }
              `}
            >
              {opt.label}
              {dossier.local_status === opt.value && ' ×'}
            </button>
          ))}
        </div>
      )}

      {/* ── Zone de confirmation (Remboursé / Problème) ── */}
      {pendingStatus && (
        <div className="space-y-2 bg-noir/[0.03] border border-noir/10 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-noir/60">
            {pendingStatus} — commentaire (optionnel)
          </p>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Ex : chèque non reçu, remboursement demandé le…"
            rows={2}
            autoFocus
            className="w-full border-2 border-noir/30 px-2.5 py-2 text-[11px] font-mono bg-blanc
                       focus:outline-none focus:border-noir resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="text-[11px] font-bold uppercase tracking-widest px-3 py-1.5
                         bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir
                         transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : `Confirmer ${pendingStatus}`}
            </button>
            <button
              onClick={cancelPending}
              disabled={saving}
              className="text-[11px] font-bold uppercase tracking-widest px-3 py-1.5
                         border-2 border-noir/30 text-noir hover:border-noir transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Commentaire existant (hors zone de confirmation) */}
      {!pendingStatus && dossier.comment && (
        <p className="mt-1.5 text-[11px] font-mono text-noir/50 italic border-l-2 border-noir/20 pl-2">
          {dossier.comment}
        </p>
      )}

      {err && <p className="mt-1 text-[11px] font-mono text-red-600">{err}</p>}

      {dossier.has_status_mismatch && !dossier.needs_refund_action && (
        <p className="mt-1 text-[10px] font-bold text-red-600">⚠ HelloAsso indique un remboursement</p>
      )}

      {dossier.needs_refund_action && (
        <div className="mt-2 bg-orange-100 border-l-4 border-orange-500 px-3 py-2">
          <p className="text-[11px] font-bold text-orange-800">
            {dossier.local_status === 'Remboursé' 
              ? '⚠ Remboursement demandé localement. À effectuer sur HelloAsso.'
              : '⚠ Remboursé sur HelloAsso. Mettre à jour le statut local.'}
          </p>
        </div>
      )}

      {/* Historique des transactions HelloAsso */}
      {dossier.transactions.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-noir/10 space-y-0.5">
          {dossier.transactions.map((inst) => {
            const isRefund = inst.helloasso_payment_id.startsWith('refund-')
            const positiveTransactions = dossier.transactions.filter(t => !t.helloasso_payment_id.startsWith('refund-'))
            const posIndex = positiveTransactions.findIndex(t => t.helloasso_payment_id === inst.helloasso_payment_id)

            const label = isRefund 
              ? 'Remboursement' 
              : (dossier.is_installment ? `Échéance ${posIndex + 1}/${positiveTransactions.length}` : 'Paiement')

            const isSuccess = inst.helloasso_status === 'Authorized' || inst.helloasso_status === 'Processed'
            const isRefunded = inst.helloasso_status === 'Refunded'

            return (
              <div key={inst.helloasso_payment_id} className="flex gap-3 text-[11px] font-mono text-noir/40 flex-wrap">
                <span className={`flex-shrink-0 w-28 ${isRefund ? 'text-red-500 font-bold' : ''}`}>
                  {label}
                </span>
                <span className={isRefund ? 'text-red-500 font-bold' : ''}>
                  {formatAmount(Number(inst.amount))}
                </span>
                <span>{formatDateTime(inst.payment_date)}</span>
                <span className={
                  isSuccess ? 'text-green-600 font-bold' :
                  isRefunded ? 'text-red-500 font-bold' : ''
                }>
                  → {isSuccess ? 'Validé' : (isRefunded ? 'Remboursé' : inst.helloasso_status)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ValidationPage() {
  const { dossiers, responsibles, loading: dossiersLoading, error: dossiersError, refresh, upsertStatus, resetStatus } = useDossiers()
  const { loading: syncLoading, error: syncError, result: syncResult, lastSyncAt, sync } = useSyncHelloasso()

  useEffect(() => { sync() }, [sync]) // eslint-disable-line react-hooks/exhaustive-deps

  const [search,       setSearch]       = useState('')
  // Par défaut : uniquement les dossiers vierges (pas encore traités)
  const [filterStatus, setFilterStatus] = useState('À traiter')
  const [filterType,   setFilterType]   = useState('')
  const [filterGroup,  setFilterGroup]  = useState('')

  const allGroups = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of dossiers) {
      for (const g of d.groups) map.set(g.id, g.name)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dossiers])

  // Stats calculées sur TOUS les dossiers (pas sur filtrés)
  const filtered = useMemo(() => {
    const q = normalise(search.trim())
    return dossiers.filter(d => {
      if (q) {
        const hay = normalise(
          `${d.payer_first_name} ${d.payer_last_name} ${d.payer_email} ${d.first_name} ${d.last_name}`
        )
        if (!hay.includes(q)) return false
      }
      if (filterStatus) {
        if (filterStatus === 'Suivi Remboursements') {
          if (!d.needs_refund_action) return false
        } else if ((d.local_status ?? 'À traiter') !== filterStatus) {
          return false
        }
      }
      if (filterType === '1x' && d.is_installment)  return false
      if (filterType === '3x' && !d.is_installment) return false
      if (filterGroup && !d.groups.some(g => g.id === filterGroup)) return false
      return true
    })
  }, [dossiers, search, filterStatus, filterType, filterGroup])

  async function handleSyncAndRefresh(force = false) {
    await sync(force)
    await refresh()
  }

  return (
    <div className="space-y-4">

      {/* En-tête */}
      <div>
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1 mb-2">
          Validation
        </span>
        <h1 className="text-2xl font-black text-noir">Liste des dossiers</h1>
      </div>

      {/* Barre de sync */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => handleSyncAndRefresh(true)}
          disabled={syncLoading || dossiersLoading}
          className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50"
        >
          {syncLoading ? '⟳ Sync…' : '⟳ Sync HelloAsso'}
        </button>
        <span className="font-mono text-xs text-noir/40">
          {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('fr-FR') : 'Pas encore synchronisé'}
        </span>
        {syncResult && syncResult.synced_count > 0 && (
          <span className="font-mono text-xs text-green-600">+{syncResult.synced_count} importé{syncResult.synced_count > 1 ? 's' : ''}</span>
        )}
        {syncError && <span className="font-mono text-xs text-red-600">Sync : {syncError}</span>}
        {syncResult?.errors && syncResult.errors.length > 0 && (
          <span className="font-mono text-xs text-orange-600" title={syncResult.errors.join('\n')}>
            ⚠ {syncResult.errors.length} erreur{syncResult.errors.length > 1 ? 's' : ''} (hover)
          </span>
        )}
      </div>

      {/* Stats sur tous les dossiers */}
      {!dossiersLoading && !dossiersError && <StatsBar dossiers={dossiers} />}

      {dossiersError && (
        <p className="font-mono text-sm text-red-600 bg-red-50 border-l-4 border-red-400 px-4 py-3">
          Erreur : {dossiersError}
        </p>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="border-2 border-noir px-3 py-1.5 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20 w-36 min-w-0"
        />

        {/* Filtre statut */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border-2 border-noir px-2 py-1.5 text-sm font-mono bg-blanc focus:outline-none">
          <option value="">Tous</option>
          <option value="À traiter">À traiter</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          <option value="Suivi Remboursements">Suivi Remboursements</option>
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border-2 border-noir px-2 py-1.5 text-sm font-mono bg-blanc focus:outline-none">
          <option value="">1× et 3×</option>
          <option value="1x">1× only</option>
          <option value="3x">3× only</option>
        </select>

        {allGroups.length > 0 && (
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
            className="border-2 border-noir px-2 py-1.5 text-sm font-mono bg-blanc focus:outline-none">
            <option value="">Tous groupes</option>
            {allGroups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}

        {(search || filterType || filterGroup || filterStatus !== 'À traiter') && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('À traiter'); setFilterType(''); setFilterGroup('') }}
            className="text-xs font-mono text-noir/50 underline hover:text-noir"
          >
            ↺ Reset
          </button>
        )}
      </div>

      {/* Liste */}
      <section className="border-4 border-noir shadow-[6px_6px_0px_#000000]">
        <div className="border-b-4 border-noir px-4 py-2.5 bg-noir flex items-center justify-between">
          <h2 className="font-black text-blanc uppercase tracking-widest text-sm">
            Dossiers
            <span className="ml-2 font-mono text-blanc/50 normal-case tracking-normal text-xs">
              {filtered.length !== dossiers.length ? `${filtered.length} / ${dossiers.length}` : `(${dossiers.length})`}
            </span>
          </h2>
          {!dossiersLoading && (
            <button onClick={refresh} className="text-[11px] font-mono text-blanc/50 hover:text-blanc transition-colors">
              ↺ Actualiser
            </button>
          )}
        </div>

        <div className="bg-blanc">
          {dossiersLoading && (
            <p className="px-5 py-6 font-mono text-sm text-noir/50 animate-pulse">Chargement…</p>
          )}

          {!dossiersLoading && !dossiersError && dossiers.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="font-mono text-sm text-noir/40 mb-1">Aucun paiement à afficher.</p>
              <p className="font-mono text-xs text-noir/30">Vérifiez que vos liens HelloAsso vous sont assignés dans Config.</p>
            </div>
          )}

          {!dossiersLoading && dossiers.length > 0 && filtered.length === 0 && (
            <p className="px-5 py-8 font-mono text-sm text-noir/40 text-center">
              {filterStatus === 'À traiter'
                ? '✓ Tous les dossiers ont été traités !'
                : 'Aucun dossier ne correspond aux filtres.'
              }
            </p>
          )}

          {!dossiersLoading && filtered.map(d => (
            <DossierCard
              key={d.id}
              dossier={d}
              responsibles={responsibles}
              onSave={(status, comment) => upsertStatus(d.id, status, comment)}
              onReset={() => resetStatus(d.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
