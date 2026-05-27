// ─────────────────────────────────────────────────────────────────────────────
// Page : ConfigPage  (Phase 5)
//
// Deux sections :
//   1. Liens HelloAsso — CRUD
//   2. Groupes — CRUD (liés à un lien principal)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useHelloassoLinks } from '../hooks/useHelloassoLinks'
import type { NewHelloassoLink } from '../hooks/useHelloassoLinks'
import { useGroups } from '../hooks/useGroups'
import type { NewGroup } from '../hooks/useGroups'
import type { HelloassoLink, Group } from '../types/database'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_LINK: NewHelloassoLink = {
  url:            '',
  label:          '',
  is_installment: false,
  parent_link_id: null,
}

const EMPTY_GROUP: NewGroup = {
  name:    '',
  link_id: '',
}

function truncateUrl(url: string, max = 55): string {
  if (url.length <= max) return url
  return url.slice(0, max) + '…'
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ConfigPage() {
  const { user } = useAuth()
  const { links, loading: linksLoading, error: linksError, addLink, updateLink, deleteLink } = useHelloassoLinks()
  const { groups, loading: groupsLoading, error: groupsError, addGroup, updateGroup, deleteGroup } = useGroups()

  return (
    <div className="space-y-10">
      {/* En-tête de page */}
      <div>
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1 mb-3">
          Configuration
        </span>
        <h1 className="text-3xl font-black text-noir">Liens &amp; Groupes</h1>
      </div>

      {/* Section 1 — Liens HelloAsso */}
      <LinksSection
        links={links}
        loading={linksLoading}
        error={linksError}
        userId={user?.id ?? ''}
        onAdd={addLink}
        onUpdate={updateLink}
        onDelete={deleteLink}
      />

      {/* Section 2 — Groupes */}
      <GroupsSection
        groups={groups}
        links={links}
        loading={groupsLoading}
        error={groupsError}
        onAdd={addGroup}
        onUpdate={updateGroup}
        onDelete={deleteGroup}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section : Liens HelloAsso
// ─────────────────────────────────────────────────────────────────────────────

interface LinksSectionProps {
  links:    HelloassoLink[]
  loading:  boolean
  error:    string | null
  userId:   string
  onAdd:    (data: NewHelloassoLink, responsibleId: string) => Promise<void>
  onUpdate: (id: string, data: Partial<NewHelloassoLink>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function LinksSection({ links, loading, error, userId, onAdd, onUpdate, onDelete }: LinksSectionProps) {
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<NewHelloassoLink>(EMPTY_LINK)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Liens maîtres disponibles pour être parent (non-installment)
  const masterLinks = links.filter(l => !l.is_installment && l.id !== editId)

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_LINK)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(link: HelloassoLink) {
    setEditId(link.id)
    setForm({
      url:            link.url,
      label:          link.label,
      is_installment: link.is_installment,
      parent_link_id: link.parent_link_id,
    })
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_LINK)
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.url.trim() || !form.label.trim()) {
      setFormError('Le label et l\'URL sont requis.')
      return
    }
    if (form.is_installment && !form.parent_link_id) {
      setFormError('Un lien d\'échéance doit avoir un lien maître.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editId) {
        await onUpdate(editId, form)
      } else {
        await onAdd(form, userId)
      }
      cancelForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Supprimer le lien "${label}" ?\n\nAttention : les données associées (registrants) ne seront pas supprimées.`)) return
    try {
      await onDelete(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  // Trier : liens maîtres d'abord, puis leurs échéances juste après
  const sortedLinks = [...links].sort((a, b) => {
    const aKey = a.parent_link_id ?? a.id
    const bKey = b.parent_link_id ?? b.id
    if (aKey !== bKey) return aKey.localeCompare(bKey)
    // Même groupe : maître avant échéances
    if (!a.parent_link_id && b.parent_link_id) return -1
    if (a.parent_link_id && !b.parent_link_id) return 1
    return a.label.localeCompare(b.label)
  })

  return (
    <section className="border-4 border-noir shadow-[6px_6px_0px_#000000]">
      {/* En-tête de section */}
      <div className="border-b-4 border-noir px-5 py-3 flex items-center justify-between bg-noir">
        <h2 className="font-black text-blanc uppercase tracking-widest text-sm">
          Liens HelloAsso
          <span className="ml-2 font-mono text-blanc/50 normal-case tracking-normal text-xs">
            ({links.length})
          </span>
        </h2>
        {!showForm && (
          <button
            onClick={openAdd}
            className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-citron text-noir border-2 border-citron hover:border-blanc transition-colors"
          >
            + Ajouter
          </button>
        )}
      </div>

      {/* Corps */}
      <div className="bg-blanc">
        {loading && (
          <p className="px-5 py-6 font-mono text-sm text-noir/50 animate-pulse">Chargement…</p>
        )}
        {error && (
          <p className="px-5 py-4 font-mono text-sm text-red-600 bg-red-50 border-b-2 border-red-200">
            Erreur : {error}
          </p>
        )}

        {/* Liste des liens */}
        {!loading && sortedLinks.length === 0 && !showForm && (
          <p className="px-5 py-6 font-mono text-sm text-noir/40">
            Aucun lien configuré. Cliquez sur "+ Ajouter" pour commencer.
          </p>
        )}

        {sortedLinks.map(link => {
          const parentLabel = link.parent_link_id
            ? links.find(l => l.id === link.parent_link_id)?.label
            : null

          return (
            <div
              key={link.id}
              className={`border-b-2 border-noir/10 px-5 py-3 flex items-start gap-3 hover:bg-noir/[0.02] ${
                link.is_installment ? 'pl-10 bg-noir/[0.015]' : ''
              }`}
            >
              {/* Indicateur d'échéance */}
              {link.is_installment && (
                <span className="mt-0.5 text-noir/30 text-xs font-mono flex-shrink-0">↳</span>
              )}

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-noir">{link.label}</span>
                  {link.is_installment ? (
                    <span className="text-xs font-mono bg-glace/30 border border-glace px-1.5 py-0.5">
                      Échéance
                      {parentLabel && <span className="text-noir/50"> → {parentLabel}</span>}
                    </span>
                  ) : (
                    <span className="text-xs font-mono bg-citron/40 border border-citron/60 px-1.5 py-0.5">
                      Principal
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-noir/50 truncate" title={link.url}>
                  {truncateUrl(link.url)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0 mt-0.5">
                <button
                  onClick={() => openEdit(link)}
                  className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-noir hover:text-blanc transition-colors"
                  title="Modifier"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(link.id, link.label)}
                  className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-red-500 hover:text-blanc hover:border-red-500 transition-colors"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}

        {/* Formulaire d'ajout / édition */}
        {showForm && (
          <form onSubmit={handleSubmit} className="border-t-2 border-noir/20 px-5 py-5 space-y-4 bg-noir/[0.02]">
            <p className="text-xs font-bold uppercase tracking-widest text-noir/50">
              {editId ? 'Modifier le lien' : 'Nouveau lien'}
            </p>

            {/* Label */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">
                Label
              </label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder='ex: "Tarif 280€" ou "Échéance 2/3"'
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20"
              />
            </div>

            {/* URL */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">
                URL HelloAsso
              </label>
              <input
                type="url"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://www.helloasso.com/associations/..."
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">
                Type
              </label>
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="link-type"
                    checked={!form.is_installment}
                    onChange={() => setForm(f => ({ ...f, is_installment: false, parent_link_id: null }))}
                    className="accent-noir"
                  />
                  <span className="text-sm font-medium">Lien principal (1x ou maître 3x)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="link-type"
                    checked={form.is_installment}
                    onChange={() => setForm(f => ({ ...f, is_installment: true }))}
                    className="accent-noir"
                  />
                  <span className="text-sm font-medium">Échéance 3x</span>
                </label>
              </div>
            </div>

            {/* Lien maître (si échéance) */}
            {form.is_installment && (
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-widest text-noir">
                  Lien maître
                </label>
                <select
                  value={form.parent_link_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, parent_link_id: e.target.value || null }))}
                  className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20"
                >
                  <option value="">— Sélectionner un lien principal —</option>
                  {masterLinks.map(l => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Erreur */}
            {formError && (
              <p className="text-sm font-mono text-red-600 bg-red-50 border-l-4 border-red-500 px-3 py-2">
                {formError}
              </p>
            )}

            {/* Boutons */}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 border-2 border-noir text-noir hover:bg-noir/10 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section : Groupes
// ─────────────────────────────────────────────────────────────────────────────

interface GroupsSectionProps {
  groups:   Group[]
  links:    HelloassoLink[]
  loading:  boolean
  error:    string | null
  onAdd:    (data: NewGroup) => Promise<void>
  onUpdate: (id: string, data: Partial<NewGroup>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function GroupsSection({ groups, links, loading, error, onAdd, onUpdate, onDelete }: GroupsSectionProps) {
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<NewGroup>(EMPTY_GROUP)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Seuls les liens principaux (non-échéance) peuvent avoir des groupes
  const principalLinks = links.filter(l => !l.is_installment)

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_GROUP)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(group: Group) {
    setEditId(group.id)
    setForm({ name: group.name, link_id: group.link_id })
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_GROUP)
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Le nom du groupe est requis.')
      return
    }
    if (!form.link_id) {
      setFormError('Un lien HelloAsso est requis.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editId) {
        await onUpdate(editId, form)
      } else {
        await onAdd(form)
      }
      cancelForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Supprimer le groupe "${name}" ?`)) return
    try {
      await onDelete(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="border-4 border-noir shadow-[6px_6px_0px_#000000]">
      {/* En-tête */}
      <div className="border-b-4 border-noir px-5 py-3 flex items-center justify-between bg-noir">
        <h2 className="font-black text-blanc uppercase tracking-widest text-sm">
          Groupes
          <span className="ml-2 font-mono text-blanc/50 normal-case tracking-normal text-xs">
            ({groups.length})
          </span>
        </h2>
        {!showForm && (
          <button
            onClick={openAdd}
            className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-citron text-noir border-2 border-citron hover:border-blanc transition-colors"
          >
            + Ajouter
          </button>
        )}
      </div>

      {/* Corps */}
      <div className="bg-blanc">
        {loading && (
          <p className="px-5 py-6 font-mono text-sm text-noir/50 animate-pulse">Chargement…</p>
        )}
        {error && (
          <p className="px-5 py-4 font-mono text-sm text-red-600 bg-red-50 border-b-2 border-red-200">
            Erreur : {error}
          </p>
        )}

        {!loading && groups.length === 0 && !showForm && (
          <p className="px-5 py-6 font-mono text-sm text-noir/40">
            Aucun groupe configuré.
          </p>
        )}

        {/* Liste des groupes triés par lien puis par nom */}
        {[...groups]
          .sort((a, b) => {
            const la = links.find(l => l.id === a.link_id)?.label ?? ''
            const lb = links.find(l => l.id === b.link_id)?.label ?? ''
            if (la !== lb) return la.localeCompare(lb)
            return a.name.localeCompare(b.name)
          })
          .map(group => {
            const linkLabel = links.find(l => l.id === group.link_id)?.label ?? group.link_id

            return (
              <div
                key={group.id}
                className="border-b-2 border-noir/10 px-5 py-3 flex items-center gap-3 hover:bg-noir/[0.02]"
              >
                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm text-noir">{group.name}</span>
                  <span className="ml-3 text-xs font-mono text-noir/50">
                    → {linkLabel}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(group)}
                    className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-noir hover:text-blanc transition-colors"
                    title="Modifier"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(group.id, group.name)}
                    className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-red-500 hover:text-blanc hover:border-red-500 transition-colors"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

        {/* Formulaire */}
        {showForm && (
          <form onSubmit={handleSubmit} className="border-t-2 border-noir/20 px-5 py-5 space-y-4 bg-noir/[0.02]">
            <p className="text-xs font-bold uppercase tracking-widest text-noir/50">
              {editId ? 'Modifier le groupe' : 'Nouveau groupe'}
            </p>

            {/* Nom */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">
                Nom du groupe
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder='ex: "5-6 ans", "Primaires (débutants)"'
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20"
              />
            </div>

            {/* Lien associé */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">
                Lien HelloAsso associé
              </label>
              {principalLinks.length === 0 ? (
                <p className="text-xs font-mono text-noir/50 italic">
                  Ajoutez d'abord un lien principal dans la section "Liens HelloAsso".
                </p>
              ) : (
                <select
                  value={form.link_id}
                  onChange={e => setForm(f => ({ ...f, link_id: e.target.value }))}
                  className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20"
                >
                  <option value="">— Sélectionner un lien —</option>
                  {principalLinks.map(l => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Erreur */}
            {formError && (
              <p className="text-sm font-mono text-red-600 bg-red-50 border-l-4 border-red-500 px-3 py-2">
                {formError}
              </p>
            )}

            {/* Boutons */}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 border-2 border-noir text-noir hover:bg-noir/10 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
