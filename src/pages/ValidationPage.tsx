// ─────────────────────────────────────────────────────────────────────────────
// Page : ValidationPage  (Phase 6)
//
// Liste des dossiers (paiements HelloAsso regroupés), avec :
//   - Sync automatique au montage + bouton refresh manuel
//   - Recherche full-text (payeur, inscrit, email)
//   - Filtres : Statut | Type (1x/3x) | Groupe
//   - Éditeur de statut inline par dossier
// ─────────────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  })
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style:                 'currency',
    currency:              'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// ─── Badge de statut ──────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: PaymentStatusEnum | null
  small?: boolean
}

function statusStyle(status: PaymentStatusEnum | null): string {
  switch (status) {
    case 'Traité':     return 'bg-green-100 text-green-800 border-green-300'
    case 'En attente': return 'bg-citron/70 text-noir border-citron'
    case 'Remboursé':  return 'bg-glace/40 text-noir border-glace'
    case 'Problème':   return 'bg-red-100 text-red-700 border-red-300'
    default:           return 'bg-noir/8 text-noir/60 border-noir/20'
  }
}

function StatusBadge({ status, small }: StatusBadgeProps) {
  const label = status ?? 'À traiter'
  return (
    <span
      className={`
        inline-block border font-bold uppercase tracking-widest
        ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}
        ${statusStyle(status)}
      `}
    >
      {label}
    </span>
  )
}

// ─── Éditeur de statut inline ─────────────────────────────────────────────────

interface StatusEditorProps {
  dossier:      Dossier
  onSave:       (status: PaymentStatusEnum, comment: string | null) => Promise<void>
  onCancel:     () => void
}

function StatusEditor({ dossier, onSave, onCancel }: StatusEditorProps) {
  const [status,  setStatus]  = useState<PaymentStatusEnum>(dossier.status ?? 'En attente')
  const [comment, setComment] = useState<string>(dossier.comment ?? '')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      await onSave(status, comment.trim() || null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-noir/[0.03] border-t-2 border-noir/10 px-4 py-4 space-y-3">
      {/* Statut */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-noir/50 mb-2">
          Statut
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={`
                text-xs font-bold uppercase tracking-widest px-3 py-1.5
                border-2 transition-colors
                ${status === opt.value
                  ? 'bg-noir text-blanc border-noir'
                  : 'bg-blanc text-noir border-noir/30 hover:border-noir'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Commentaire */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-noir/50 mb-1">
          Commentaire (optionnel)
        </p>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={2}
          placeholder="Remarque, référence chèque, etc."
          className="w-full border-2 border-noir/30 px-3 py-2 text-sm font-mono bg-blanc
                     focus:outline-none focus:border-noir resize-none"
        />
      </div>

      {err && (
        <p className="text-xs font-mono text-red-600 bg-red-50 border-l-4 border-red-400 px-3 py-2">
          {err}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs font-bold uppercase tracking-widest px-4 py-2
                     bg-noir text-blanc border-2 border-noir
                     hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-xs font-bold uppercase tracking-widest px-4 py-2
                     border-2 border-noir text-noir hover:bg-noir/10 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Ligne de dossier ─────────────────────────────────────────────────────────

interface DossierRowProps {
  dossier:      Dossier
  responsibles: Responsible[]
  isExpanded:   boolean
  onToggleEdit: () => void
  onSave:       (status: PaymentStatusEnum, comment: string | null) => Promise<void>
  onCancel:     () => void
}

function DossierRow({ dossier, responsibles, isExpanded, onToggleEdit, onSave, onCancel }: DossierRowProps) {
  const resp = responsibles.find(r => r.id === dossier.updated_by)

  return (
    <div className={`border-b-2 border-noir/10 ${isExpanded ? 'bg-noir/[0.015]' : 'hover:bg-noir/[0.02]'}`}>
      {/* ── Ligne principale ── */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 items-center px-4 py-3 min-w-[700px]">

        {/* Payeur + inscrit */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-sm text-noir">
              {dossier.payer_first_name} {dossier.payer_last_name}
            </span>
            {/* Inscrit différent du payeur */}
            {(
              dossier.installments[0].first_name !== dossier.payer_first_name ||
              dossier.installments[0].last_name  !== dossier.payer_last_name
            ) && (
              <span className="text-[11px] font-mono text-noir/50">
                → {dossier.installments[0].first_name} {dossier.installments[0].last_name}
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-noir/40 truncate">
            {dossier.payer_email}
          </p>
          {/* Groupes */}
          {dossier.groups.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {dossier.groups.map(g => (
                <span
                  key={g.id}
                  className="text-[10px] font-mono bg-glace/30 border border-glace px-1.5 py-0.5"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Type */}
        <div className="flex-shrink-0">
          <span className={`
            text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border
            ${dossier.is_installment
              ? 'bg-glace/30 border-glace text-noir'
              : 'bg-citron/40 border-citron/60 text-noir'
            }
          `}>
            {dossier.is_installment ? '3×' : '1×'}
          </span>
        </div>

        {/* Montant */}
        <div className="flex-shrink-0 font-mono text-sm text-noir text-right">
          {formatAmount(dossier.total_amount)}
        </div>

        {/* Date */}
        <div className="flex-shrink-0 font-mono text-[11px] text-noir/50">
          {formatDate(dossier.first_payment_date)}
        </div>

        {/* Statut */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <StatusBadge status={dossier.status} small />
          {dossier.has_status_mismatch && (
            <span
              title="Statut local « Traité » mais HelloAsso indique un remboursement"
              className="text-[10px] font-bold bg-red-500 text-blanc px-1.5 py-0.5"
            >
              ⚠ Divergence
            </span>
          )}
          {dossier.updated_by && (
            <span className="text-[10px] font-mono text-noir/30">
              {resp?.name ?? '?'} · {formatDate(dossier.updated_at!)}
            </span>
          )}
        </div>

        {/* Bouton édition */}
        <div className="flex-shrink-0">
          <button
            onClick={onToggleEdit}
            title={isExpanded ? 'Fermer' : 'Modifier le statut'}
            className={`
              text-xs font-bold px-2 py-1 border-2 transition-colors
              ${isExpanded
                ? 'bg-noir text-blanc border-noir'
                : 'border-noir hover:bg-noir hover:text-blanc'
              }
            `}
          >
            {isExpanded ? '✕' : '✎'}
          </button>
        </div>
      </div>

      {/* ── Éditeur inline (3x : détail des échéances) ── */}
      {isExpanded && (
        <>
          {/* Détail des échéances si 3x */}
          {dossier.is_installment && dossier.installments.length > 1 && (
            <div className="border-t border-noir/10 px-4 py-2 bg-blanc">
              <p className="text-[10px] font-bold uppercase tracking-widest text-noir/40 mb-1.5">
                Échéances HelloAsso
              </p>
              <div className="space-y-1">
                {dossier.installments.map((inst, i) => (
                  <div key={inst.helloasso_payment_id} className="flex items-center gap-3 text-[11px] font-mono">
                    <span className="text-noir/40">{i + 1}/3</span>
                    <span className="text-noir">{formatAmount(Number(inst.amount))}</span>
                    <span className="text-noir/50">{formatDate(inst.payment_date)}</span>
                    <span className={`
                      px-1.5 py-0.5 border text-[10px] font-bold
                      ${inst.helloasso_status === 'Authorized'
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : inst.helloasso_status === 'Refunded' || inst.helloasso_status === 'Refused'
                          ? 'bg-red-50 border-red-300 text-red-600'
                          : 'bg-noir/5 border-noir/20 text-noir/50'
                      }
                    `}>
                      {inst.helloasso_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <StatusEditor dossier={dossier} onSave={onSave} onCancel={onCancel} />
        </>
      )}
    </div>
  )
}

// ─── Barre de stats ───────────────────────────────────────────────────────────

interface StatsBarProps {
  dossiers: Dossier[]
}

function StatsBar({ dossiers }: StatsBarProps) {
  const counts = useMemo(() => {
    const totals: Record<string, number> = { total: dossiers.length }
    for (const d of dossiers) {
      const k = d.status ?? 'À traiter'
      totals[k] = (totals[k] ?? 0) + 1
    }
    return totals
  }, [dossiers])

  const items = [
    { label: 'Total',      value: counts['total']      ?? 0, cls: 'text-noir' },
    { label: 'À traiter',  value: counts['À traiter']  ?? 0, cls: 'text-noir/60' },
    { label: 'En attente', value: counts['En attente'] ?? 0, cls: 'text-citron' },
    { label: 'Traité',     value: counts['Traité']     ?? 0, cls: 'text-green-600' },
    { label: 'Problème',   value: counts['Problème']   ?? 0, cls: 'text-red-600'  },
    { label: 'Remboursé',  value: counts['Remboursé']  ?? 0, cls: 'text-glace'    },
  ]

  return (
    <div className="flex flex-wrap gap-4 font-mono text-sm">
      {items.map(it => (
        <div key={it.label} className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-black ${it.cls}`}>{it.value}</span>
          <span className="text-noir/40 text-xs uppercase tracking-widest">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ValidationPage() {
  const {
    dossiers,
    responsibles,
    loading: dossiersLoading,
    error:   dossiersError,
    refresh,
    upsertStatus,
  } = useDossiers()

  const {
    loading:    syncLoading,
    error:      syncError,
    result:     syncResult,
    lastSyncAt,
    sync,
  } = useSyncHelloasso()

  // ── Auto-sync au montage ───────────────────────────────────────────────────
  useEffect(() => { sync() }, [sync]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtres ────────────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')   // '' = tous
  const [filterType,   setFilterType]   = useState<string>('')   // '' | '1x' | '3x'
  const [filterGroup,  setFilterGroup]  = useState<string>('')   // '' | group.id

  // ── Édition inline ─────────────────────────────────────────────────────────
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // ── Données dérivées ───────────────────────────────────────────────────────

  // Tous les groupes connus (dédupliqués)
  const allGroups = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of dossiers) {
      for (const g of d.groups) {
        map.set(g.id, g.name)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dossiers])

  // Dossiers filtrés
  const filtered = useMemo(() => {
    const q = normalise(search.trim())

    return dossiers.filter(d => {
      // Recherche
      if (q) {
        const haystack = normalise(
          `${d.payer_first_name} ${d.payer_last_name} ${d.payer_email} ` +
          d.installments.map(r => `${r.first_name} ${r.last_name}`).join(' '),
        )
        if (!haystack.includes(q)) return false
      }

      // Filtre statut
      if (filterStatus) {
        const statusLabel = d.status ?? 'À traiter'
        if (statusLabel !== filterStatus) return false
      }

      // Filtre type
      if (filterType === '1x' && d.is_installment)  return false
      if (filterType === '3x' && !d.is_installment) return false

      // Filtre groupe
      if (filterGroup) {
        if (!d.groups.some(g => g.id === filterGroup)) return false
      }

      return true
    })
  }, [dossiers, search, filterStatus, filterType, filterGroup])

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleSyncAndRefresh(force = false) {
    await sync(force)
    await refresh()
  }

  async function handleSave(dossierKey: string, status: PaymentStatusEnum, comment: string | null) {
    await upsertStatus(dossierKey, status, comment)
    setExpandedKey(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div>
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1 mb-3">
          Validation
        </span>
        <h1 className="text-3xl font-black text-noir mb-1">Liste des dossiers</h1>
        <p className="font-mono text-xs text-noir/40">
          Vérifiez et validez les paiements synchronisés depuis HelloAsso.
        </p>
      </div>

      {/* Barre de sync */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => handleSyncAndRefresh(true)}
          disabled={syncLoading || dossiersLoading}
          className="
            text-xs font-bold uppercase tracking-widest px-4 py-2
            bg-noir text-blanc border-2 border-noir
            hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50
          "
        >
          {syncLoading ? '⟳ Synchronisation…' : '⟳ Sync HelloAsso'}
        </button>

        <span className="font-mono text-xs text-noir/40">
          {lastSyncAt
            ? `Dernière sync : ${new Date(lastSyncAt).toLocaleTimeString('fr-FR')}`
            : 'Pas encore synchronisé'}
        </span>

        {syncResult && syncResult.synced_count > 0 && (
          <span className="font-mono text-xs text-green-600">
            +{syncResult.synced_count} paiement{syncResult.synced_count > 1 ? 's' : ''} importé{syncResult.synced_count > 1 ? 's' : ''}
          </span>
        )}
        {syncResult?.cached && (
          <span className="font-mono text-xs text-noir/30">(cache)</span>
        )}

        {syncError && (
          <span className="font-mono text-xs text-red-600">
            Sync : {syncError}
          </span>
        )}
      </div>

      {/* Stats */}
      {!dossiersLoading && !dossiersError && (
        <StatsBar dossiers={dossiers} />
      )}

      {/* Erreur chargement dossiers */}
      {dossiersError && (
        <p className="font-mono text-sm text-red-600 bg-red-50 border-l-4 border-red-400 px-4 py-3">
          Erreur : {dossiersError}
        </p>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Recherche */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (nom, email…)"
          className="
            border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc
            focus:outline-none focus:bg-citron/20 w-56
          "
        />

        {/* Statut */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="À traiter">À traiter</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Type */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none"
        >
          <option value="">1× et 3×</option>
          <option value="1x">1× seulement</option>
          <option value="3x">3× seulement</option>
        </select>

        {/* Groupe */}
        {allGroups.length > 0 && (
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            className="border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none"
          >
            <option value="">Tous les groupes</option>
            {allGroups.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        {/* Reset filtres */}
        {(search || filterStatus || filterType || filterGroup) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterGroup('') }}
            className="text-xs font-mono text-noir/50 underline hover:text-noir transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Liste des dossiers */}
      <section className="border-4 border-noir shadow-[6px_6px_0px_#000000]">
        {/* En-tête de table */}
        <div className="border-b-4 border-noir px-4 py-3 bg-noir flex items-center justify-between">
          <h2 className="font-black text-blanc uppercase tracking-widest text-sm">
            Dossiers
            <span className="ml-2 font-mono text-blanc/50 normal-case tracking-normal text-xs">
              {filtered.length !== dossiers.length
                ? `${filtered.length} / ${dossiers.length}`
                : `(${dossiers.length})`
              }
            </span>
          </h2>
          {!dossiersLoading && (
            <button
              onClick={refresh}
              className="text-[11px] font-mono text-blanc/50 hover:text-blanc transition-colors"
              title="Recharger depuis la base"
            >
              ↺ Actualiser
            </button>
          )}
        </div>

        {/* Contenu */}
        <div className="bg-blanc overflow-x-auto">
          {/* Chargement */}
          {(dossiersLoading) && (
            <p className="px-5 py-6 font-mono text-sm text-noir/50 animate-pulse">
              Chargement des dossiers…
            </p>
          )}

          {/* Aucune donnée */}
          {!dossiersLoading && !dossiersError && dossiers.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="font-mono text-sm text-noir/40 mb-2">
                Aucun paiement synchronisé.
              </p>
              <p className="font-mono text-xs text-noir/30">
                Configurez vos liens HelloAsso puis lancez une synchronisation.
              </p>
            </div>
          )}

          {/* Aucun résultat après filtre */}
          {!dossiersLoading && !dossiersError && dossiers.length > 0 && filtered.length === 0 && (
            <p className="px-5 py-6 font-mono text-sm text-noir/40">
              Aucun dossier ne correspond aux filtres.
            </p>
          )}

          {/* En-têtes colonnes */}
          {!dossiersLoading && filtered.length > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-4 py-2
                            border-b-2 border-noir/10 min-w-[700px]">
              {['Payeur / Inscrit', 'Type', 'Montant', 'Date', 'Statut', ''].map((h, i) => (
                <span key={i} className="text-[10px] font-bold uppercase tracking-widest text-noir/40">
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Lignes */}
          {!dossiersLoading && filtered.map(d => (
            <DossierRow
              key={d.dossier_key}
              dossier={d}
              responsibles={responsibles}
              isExpanded={expandedKey === d.dossier_key}
              onToggleEdit={() =>
                setExpandedKey(prev => prev === d.dossier_key ? null : d.dossier_key)
              }
              onSave={(status, comment) => handleSave(d.dossier_key, status, comment)}
              onCancel={() => setExpandedKey(null)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
