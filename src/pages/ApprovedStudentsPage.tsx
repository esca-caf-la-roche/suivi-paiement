import { useState, useMemo } from 'react'
import { useApprovedStudents } from '../hooks/useApprovedStudents'
import { useGroups } from '../hooks/useGroups'

export default function ApprovedStudentsPage() {
  const { approvedStudents, loading: studentsLoading, error: studentsError, addApprovedStudent, deleteApprovedStudent } = useApprovedStudents()
  const { groups, loading: groupsLoading, error: groupsError } = useGroups()

  // Formulaire d'ajout
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [groupId,   setGroupId]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Filtrer les groupes qui requièrent une approbation
  const approvalGroups = useMemo(() => {
    return groups.filter(g => g.requires_approval)
  }, [groups])

  // Grouper les élèves approuvés par groupe
  const studentsByGroup = useMemo(() => {
    const map = new Map<string, typeof approvedStudents>()
    for (const group of approvalGroups) {
      map.set(group.id, [])
    }
    for (const student of approvedStudents) {
      if (map.has(student.group_id)) {
        map.get(student.group_id)!.push(student)
      }
    }
    return map
  }, [approvedStudents, approvalGroups])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !groupId) {
      setSubmitError('Veuillez remplir tous les champs.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      await addApprovedStudent({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        email:      email.trim(),
        group_id:   groupId
      })
      // Reset formulaire
      setFirstName('')
      setLastName('')
      setEmail('')
      setGroupId('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment retirer cet élève de la liste ?')) return
    try {
      await deleteApprovedStudent(id)
    } catch (err) {
      alert(`Erreur lors de la suppression : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const isLoading = studentsLoading || groupsLoading
  const error = studentsError || groupsError

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1 mb-2">
          Administration
        </span>
        <h1 className="text-2xl font-black text-noir">Élèves pour les groupes sous approbation</h1>
        <p className="text-sm text-noir/60 mt-1">
          Gérez la liste des élèves autorisés à s'inscrire dans les groupes nécessitant une approbation par le moniteur.
        </p>
      </div>

      {error && (
        <p className="font-mono text-sm text-red-600 bg-red-50 border-l-4 border-red-400 px-4 py-3">
          Erreur : {error}
        </p>
      )}

      {/* Grid deux colonnes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Colonne Gauche : Ajouter un élève */}
        <div className="md:col-span-1 space-y-4">
          <section className="border-4 border-noir shadow-[4px_4px_0px_#000000] p-4 bg-blanc">
            <h2 className="font-black text-noir uppercase tracking-wider text-sm mb-4 border-b-2 border-noir pb-2">
              Ajouter un élève
            </h2>

            {approvalGroups.length === 0 && !isLoading && (
              <p className="text-xs text-noir/50 font-mono italic">
                Aucun groupe n'est configuré "Sous approbation du moniteur". Activez cette option dans la page Config pour vos groupes afin de pouvoir y ajouter des élèves.
              </p>
            )}

            {approvalGroups.length > 0 && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-noir/60 mb-1">
                    Prénom
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Ex: Jean"
                    className="w-full border-2 border-noir px-3 py-1.5 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/10"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-noir/60 mb-1">
                    Nom
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Ex: Dupont"
                    className="w-full border-2 border-noir px-3 py-1.5 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/10"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-noir/60 mb-1">
                    Adresse mail
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Ex: jean.dupont@mail.com"
                    className="w-full border-2 border-noir px-3 py-1.5 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/10"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-noir/60 mb-1">
                    Groupe concerné
                  </label>
                  <select
                    required
                    value={groupId}
                    onChange={e => setGroupId(e.target.value)}
                    className="w-full border-2 border-noir px-2 py-1.5 text-sm font-mono bg-blanc focus:outline-none"
                  >
                    <option value="">-- Choisir un groupe --</option>
                    {approvalGroups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {submitError && (
                  <p className="text-xs font-mono text-red-600">{submitError}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full text-xs font-bold uppercase tracking-widest px-4 py-2.5 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Ajout en cours…' : 'Ajouter à la liste'}
                </button>
              </form>
            )}
          </section>
        </div>

        {/* Colonne Droite : Listes par groupe */}
        <div className="md:col-span-2 space-y-6">
          {isLoading && (
            <p className="font-mono text-sm text-noir/50 animate-pulse">Chargement des données…</p>
          )}

          {!isLoading && approvalGroups.length === 0 && (
            <div className="border-4 border-noir shadow-[4px_4px_0px_#000000] p-6 bg-blanc text-center">
              <p className="font-mono text-sm text-noir/40">Aucun groupe sous approbation configuré.</p>
              <p className="font-mono text-xs text-noir/30 mt-1">Allez dans la page "Config" pour activer l'approbation sur vos groupes.</p>
            </div>
          )}

          {!isLoading && approvalGroups.map(group => {
            const groupStudents = studentsByGroup.get(group.id) ?? []

            return (
              <section key={group.id} className="border-4 border-noir shadow-[4px_4px_0px_#000000]">
                <div className="border-b-4 border-noir px-4 py-2 bg-noir flex items-center justify-between">
                  <h2 className="font-black text-blanc uppercase tracking-widest text-xs">
                    Groupe : {group.name}
                  </h2>
                  <span className="font-mono text-xs text-blanc/60">
                    {groupStudents.length} élève{groupStudents.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="bg-blanc divide-y divide-noir/10">
                  {groupStudents.length === 0 ? (
                    <p className="p-4 font-mono text-xs text-noir/40 italic">
                      Aucun élève approuvé dans ce groupe pour le moment.
                    </p>
                  ) : (
                    groupStudents.map(student => (
                      <div key={student.id} className="p-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-noir">
                            {student.first_name} {student.last_name}
                          </p>
                          <p className="font-mono text-xs text-noir/50 truncate">
                            {student.email}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDelete(student.id)}
                          className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5 border border-red-500 text-red-500 bg-blanc hover:bg-red-50 transition-colors"
                        >
                          Retirer
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>

      </div>
    </div>
  )
}
