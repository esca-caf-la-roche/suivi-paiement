import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useHelloassoLinks } from '../hooks/useHelloassoLinks'
import type { NewHelloassoLink } from '../hooks/useHelloassoLinks'
import { useGroups } from '../hooks/useGroups'
import type { NewGroup } from '../hooks/useGroups'
import { supabase } from '../lib/supabase'
import type { HelloassoLink, Group, Responsible } from '../types/database'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEmptyLink(defaultResponsibleId: string): NewHelloassoLink {
  return {
    url:            '',
    label:          '',
    is_installment: false,
    responsible_id: defaultResponsibleId || null,
  }
}

const EMPTY_GROUP: NewGroup = { name: '', link_ids: [] }

function truncateUrl(url: string, max = 55): string {
  if (url.length <= max) return url
  return url.slice(0, max) + '…'
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ConfigPage() {
  const { user } = useAuth()
  const { links, loading: linksLoading, error: linksError, addLink, updateLink, deleteLink } = useHelloassoLinks()
  const { groups, loading: groupsLoading, error: groupsError, addGroup, updateGroup, deleteGroup } = useGroups()

  const [responsibles, setResponsibles] = useState<Responsible[]>([])

  useEffect(() => {
    supabase.from('responsibles').select('*').order('name').then(({ data }) => {
      if (data) setResponsibles(data)
    })
  }, [])

  return (
    <div className="space-y-10">
      <div>
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1 mb-3">
          Configuration
        </span>
        <h1 className="text-3xl font-black text-noir">Liens &amp; Groupes</h1>
      </div>

      <LinksSection
        links={links}
        loading={linksLoading}
        error={linksError}
        responsibles={responsibles}
        currentUserId={user?.id ?? ''}
        onAdd={addLink}
        onUpdate={updateLink}
        onDelete={deleteLink}
      />

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
  links:         HelloassoLink[]
  loading:       boolean
  error:         string | null
  responsibles:  Responsible[]
  currentUserId: string
  onAdd:         (data: NewHelloassoLink) => Promise<void>
  onUpdate:      (id: string, data: Partial<NewHelloassoLink>) => Promise<void>
  onDelete:      (id: string) => Promise<void>
}

function LinksSection({ links, loading, error, responsibles, currentUserId, onAdd, onUpdate, onDelete }: LinksSectionProps) {
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<NewHelloassoLink>(makeEmptyLink(currentUserId))
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function openAdd() {
    setEditId(null)
    setForm(makeEmptyLink(currentUserId))
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(link: HelloassoLink) {
    setEditId(link.id)
    setForm({
      url:            link.url,
      label:          link.label,
      is_installment: link.is_installment,
      responsible_id: link.responsible_id ?? null,
    })
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(makeEmptyLink(currentUserId))
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.url.trim() || !form.label.trim()) {
      setFormError('Le label et l\'URL sont requis.')
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

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Supprimer le lien "${label}" ?\n\nAttention : les données associées (dossiers et transactions) ne seront pas supprimées.`)) return
    try { await onDelete(id) }
    catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  const sortedLinks = [...links].sort((a, b) => {
    return a.label.localeCompare(b.label)
  })

  return (
    <section className="border-4 border-noir shadow-[6px_6px_0px_#000000]">
      <div className="border-b-4 border-noir px-5 py-3 flex items-center justify-between bg-noir">
        <h2 className="font-black text-blanc uppercase tracking-widest text-sm">
          Liens HelloAsso
          <span className="ml-2 font-mono text-blanc/50 normal-case tracking-normal text-xs">({links.length})</span>
        </h2>
        {!showForm && (
          <button onClick={openAdd} className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-citron text-noir border-2 border-citron hover:border-blanc transition-colors">
            + Ajouter
          </button>
        )}
      </div>

      <div className="bg-blanc">
        {loading && <p className="px-5 py-6 font-mono text-sm text-noir/50 animate-pulse">Chargement…</p>}
        {error && <p className="px-5 py-4 font-mono text-sm text-red-600 bg-red-50 border-b-2 border-red-200">Erreur : {error}</p>}

        {!loading && sortedLinks.length === 0 && !showForm && (
          <p className="px-5 py-6 font-mono text-sm text-noir/40">Aucun lien configuré. Cliquez sur "+ Ajouter" pour commencer.</p>
        )}

        {sortedLinks.map(link => {
          const respName    = responsibles.find(r => r.id === link.responsible_id)?.name

          return (
            <div
              key={link.id}
              className={`border-b-2 border-noir/10 px-5 py-3 flex items-start gap-3 hover:bg-noir/[0.02] ${link.is_installment ? 'bg-noir/[0.015]' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-noir">{link.label}</span>
                  {link.is_installment ? (
                    <span className="text-xs font-mono bg-glace/30 border border-glace px-1.5 py-0.5">
                      Échéance 3x
                    </span>
                  ) : (
                    <span className="text-xs font-mono bg-citron/40 border border-citron/60 px-1.5 py-0.5">Principal</span>
                  )}
                  {respName && (
                    <span className="text-xs font-mono text-noir/50">👤 {respName}</span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-noir/50 truncate" title={link.url}>{truncateUrl(link.url)}</p>
              </div>

              <div className="flex gap-1 flex-shrink-0 mt-0.5">
                <button onClick={() => openEdit(link)} className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-noir hover:text-blanc transition-colors" title="Modifier">✎</button>
                <button onClick={() => handleDelete(link.id, link.label)} className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-red-500 hover:text-blanc hover:border-red-500 transition-colors" title="Supprimer">✕</button>
              </div>
            </div>
          )
        })}

        {showForm && (
          <form onSubmit={handleSubmit} className="border-t-2 border-noir/20 px-5 py-5 space-y-4 bg-noir/[0.02]">
            <p className="text-xs font-bold uppercase tracking-widest text-noir/50">
              {editId ? 'Modifier le lien' : 'Nouveau lien'}
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">Label</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder='ex: "Tarif 280€" ou "Échéance 2/3"'
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20" />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">URL HelloAsso</label>
              <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://www.helloasso.com/associations/..."
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20" />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">Responsable</label>
              {responsibles.length === 0 ? (
                <p className="text-xs font-mono text-noir/50 italic">Aucun responsable enregistré.</p>
              ) : (
                <select value={form.responsible_id ?? ''} onChange={e => setForm(f => ({ ...f, responsible_id: e.target.value || null }))}
                  className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20">
                  <option value="">— Aucun responsable —</option>
                  {responsibles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">Type</label>
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="link-type" checked={!form.is_installment}
                    onChange={() => setForm(f => ({ ...f, is_installment: false }))} className="accent-noir" />
                  <span className="text-sm font-medium">Lien principal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="link-type" checked={form.is_installment}
                    onChange={() => setForm(f => ({ ...f, is_installment: true }))} className="accent-noir" />
                  <span className="text-sm font-medium">Échéance 3x</span>
                </label>
              </div>
            </div>

            {formError && (
              <p className="text-sm font-mono text-red-600 bg-red-50 border-l-4 border-red-500 px-3 py-2">{formError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" onClick={cancelForm} disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 border-2 border-noir text-noir hover:bg-noir/10 transition-colors">
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

  function openAdd() { setEditId(null); setForm(EMPTY_GROUP); setFormError(null); setShowForm(true) }
  function openEdit(group: Group) { setEditId(group.id); setForm({ name: group.name, link_ids: group.link_ids ?? [] }); setFormError(null); setShowForm(true) }
  function cancelForm() { setShowForm(false); setEditId(null); setForm(EMPTY_GROUP); setFormError(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Le nom du groupe est requis.'); return }
    setSaving(true); setFormError(null)
    try {
      if (editId) { await onUpdate(editId, form) } else { await onAdd(form) }
      cancelForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Supprimer le groupe "${name}" ?`)) return
    try { await onDelete(id) } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  return (
    <section className="border-4 border-noir shadow-[6px_6px_0px_#000000]">
      <div className="border-b-4 border-noir px-5 py-3 flex items-center justify-between bg-noir">
        <h2 className="font-black text-blanc uppercase tracking-widest text-sm">
          Groupes
          <span className="ml-2 font-mono text-blanc/50 normal-case tracking-normal text-xs">({groups.length})</span>
        </h2>
        {!showForm && (
          <button onClick={openAdd} className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-citron text-noir border-2 border-citron hover:border-blanc transition-colors">
            + Ajouter
          </button>
        )}
      </div>

      <div className="bg-blanc">
        {loading && <p className="px-5 py-6 font-mono text-sm text-noir/50 animate-pulse">Chargement…</p>}
        {error && <p className="px-5 py-4 font-mono text-sm text-red-600 bg-red-50 border-b-2 border-red-200">Erreur : {error}</p>}
        {!loading && groups.length === 0 && !showForm && <p className="px-5 py-6 font-mono text-sm text-noir/40">Aucun groupe configuré.</p>}

        {[...groups]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(group => {
            const groupLinks = links.filter(l => group.link_ids?.includes(l.id))
            return (
              <div key={group.id} className="border-b-2 border-noir/10 px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-noir/[0.02]">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm text-noir">{group.name}</span>
                  {groupLinks.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {groupLinks.map(l => (
                        <span key={l.id} className="text-xs font-mono bg-noir/5 text-noir px-2 py-0.5 rounded border border-noir/10">
                          {l.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(group)} className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-noir hover:text-blanc transition-colors">✎</button>
                  <button onClick={() => handleDelete(group.id, group.name)} className="text-xs font-bold px-2 py-1 border-2 border-noir hover:bg-red-500 hover:text-blanc hover:border-red-500 transition-colors">✕</button>
                </div>
              </div>
            )
          })}

        {showForm && (
          <form onSubmit={handleSubmit} className="border-t-2 border-noir/20 px-5 py-5 space-y-4 bg-noir/[0.02]">
            <p className="text-xs font-bold uppercase tracking-widest text-noir/50">{editId ? 'Modifier le groupe' : 'Nouveau groupe'}</p>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">Nom du groupe</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder='ex: "5-6 ans", "Primaires (débutants)"'
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/20" />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-noir">Liens HelloAsso associés</label>
              {links.length === 0 ? (
                <p className="text-xs font-mono text-noir/50 italic">Ajoutez d'abord des liens HelloAsso.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto border-2 border-noir p-3 bg-blanc">
                  {links.map(link => (
                    <label key={link.id} className="flex items-center gap-2 cursor-pointer hover:bg-noir/5 p-1 -mx-1 rounded">
                      <input
                        type="checkbox"
                        checked={form.link_ids.includes(link.id)}
                        onChange={(e) => {
                          const isChecked = e.target.checked
                          setForm(f => ({
                            ...f,
                            link_ids: isChecked
                              ? [...f.link_ids, link.id]
                              : f.link_ids.filter(id => id !== link.id)
                          }))
                        }}
                        className="accent-noir w-4 h-4"
                      />
                      <span className="text-sm font-medium text-noir">
                        {link.label} {link.is_installment && <span className="text-xs text-noir/50 font-normal">(3x)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {formError && <p className="text-sm font-mono text-red-600 bg-red-50 border-l-4 border-red-500 px-3 py-2">{formError}</p>}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" onClick={cancelForm} disabled={saving}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 border-2 border-noir text-noir hover:bg-noir/10 transition-colors">
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
