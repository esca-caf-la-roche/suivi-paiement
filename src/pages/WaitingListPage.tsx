import { useState, useMemo } from 'react'
import { useWaitingStudents } from '../hooks/useWaitingStudents'
import { useDossiers } from '../hooks/useDossiers'
import type { WaitingStudent } from '../types/database'

export default function WaitingListPage() {
  const {
    waitingStudents,
    loading: studentsLoading,
    error: studentsError,
    addWaitingStudent,
    addWaitingStudentsBulk,
    updateWaitingStudent,
    deleteWaitingStudent,
  } = useWaitingStudents()

  const { dossiers, loading: dossiersLoading } = useDossiers()

  // Formulaire d'ajout individuel
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // États de modification individuelle
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName,  setEditLastName]  = useState('')
  const [editEmail,     setEditEmail]     = useState('')

  // États pour l'import CSV
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<Omit<WaitingStudent, 'id' | 'created_at'>[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // Recherche locale dans la liste d'attente
  const [search, setSearch] = useState('')

  async function handleIndividualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setSubmitError('Veuillez remplir tous les champs.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      await addWaitingStudent({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        email:      email.trim(),
      })
      // Reset formulaire
      setFirstName('')
      setLastName('')
      setEmail('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEdit(student: WaitingStudent) {
    setEditingStudentId(student.id)
    setEditFirstName(student.first_name)
    setEditLastName(student.last_name)
    setEditEmail(student.email)
  }

  function handleCancelEdit() {
    setEditingStudentId(null)
    setEditFirstName('')
    setEditLastName('')
    setEditEmail('')
  }

  async function handleSaveEdit(id: string) {
    if (!editFirstName.trim() || !editLastName.trim() || !editEmail.trim()) {
      alert('Veuillez remplir tous les champs.')
      return
    }

    try {
      await updateWaitingStudent(id, {
        first_name: editFirstName.trim(),
        last_name:  editLastName.trim(),
        email:      editEmail.trim(),
      })
      handleCancelEdit()
    } catch (err) {
      alert(`Erreur lors de la modification : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment retirer cet élève de la liste d\'attente ?')) return
    try {
      await deleteWaitingStudent(id)
    } catch (err) {
      alert(`Erreur lors de la suppression : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Analyseur de fichier CSV robuste
  function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setCsvFile(null)
    setCsvPreview([])
    setCsvError(null)

    if (!file) return

    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) {
        setCsvError('Le fichier est vide.')
        return
      }

      try {
        const lines = text.split(/\r?\n/)
        if (lines.length === 0) {
          setCsvError('Le fichier ne contient aucune ligne.')
          return
        }

        // Détection du délimiteur (virgule ou point-virgule)
        const firstLine = lines[0]
        const commaCount = (firstLine.match(/,/g) || []).length
        const semiCount = (firstLine.match(/;/g) || []).length
        const delim = semiCount > commaCount ? ';' : ','

        const parseLine = (line: string) => {
          const result: string[] = []
          let current = ''
          let inQuotes = false
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === delim && !inQuotes) {
              result.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          result.push(current.trim())
          return result
        }

        const headers = parseLine(lines[0]).map(h => 
          h.toLowerCase()
           .normalize('NFD')
           .replace(/[̀-ͯ]/g, '')
           .replace(/^["']|["']$/g, '')
           .trim()
        )

        let firstNameIdx = -1
        let lastNameIdx = -1
        let emailIdx = -1

        for (let i = 0; i < headers.length; i++) {
          const h = headers[i]
          if (h.includes('prenom') || h.includes('first') || h === 'pnom') {
            firstNameIdx = i
          } else if (h.includes('nom') || h.includes('last') || h === 'n') {
            lastNameIdx = i
          } else if (h.includes('mail') || h.includes('email') || h === 'e-mail') {
            emailIdx = i
          }
        }

        const hasHeaders = firstNameIdx !== -1 || lastNameIdx !== -1 || emailIdx !== -1
        const startIdx = hasHeaders ? 1 : 0
        const parsedStudents: Omit<WaitingStudent, 'id' | 'created_at'>[] = []

        for (let i = startIdx; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          const columns = parseLine(line)
          let fName = ''
          let lName = ''
          let mail = ''

          if (hasHeaders) {
            if (firstNameIdx !== -1 && columns[firstNameIdx] !== undefined) fName = columns[firstNameIdx]
            if (lastNameIdx !== -1 && columns[lastNameIdx] !== undefined) lName = columns[lastNameIdx]
            if (emailIdx !== -1 && columns[emailIdx] !== undefined) mail = columns[emailIdx]
          } else {
            if (columns[0] !== undefined) fName = columns[0]
            if (columns[1] !== undefined) lName = columns[1]
            if (columns[2] !== undefined) mail = columns[2]
          }

          const clean = (val: string) => val.replace(/^["']|["']$/g, '').trim()
          fName = clean(fName)
          lName = clean(lName)
          mail = clean(mail)

          if (fName && lName && mail && mail.includes('@')) {
            parsedStudents.push({
              first_name: fName,
              last_name:  lName,
              email:      mail,
            })
          }
        }

        if (parsedStudents.length === 0) {
          setCsvError("Aucune ligne valide n'a pu être lue. Vérifiez que votre fichier contient bien les colonnes Nom, Prénom et E-mail.")
        } else {
          setCsvPreview(parsedStudents)
        }
      } catch (err) {
        setCsvError(`Erreur de lecture du fichier : ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    reader.readAsText(file)
  }

  async function handleImportCsv() {
    if (csvPreview.length === 0) return
    setImporting(true)
    setCsvError(null)

    try {
      await addWaitingStudentsBulk(csvPreview)
      // Reset de l'import après succès
      setCsvFile(null)
      setCsvPreview([])
      alert(`Importation réussie de ${csvPreview.length} élève(s) sur liste d'attente.`)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleCancelCsv() {
    setCsvFile(null)
    setCsvPreview([])
    setCsvError(null)
  }

  const isLoading = studentsLoading || dossiersLoading
  const error = studentsError

  // Filtrer la liste d'attente selon la recherche
  const filteredWaitingStudents = useMemo(() => {
    const q = search.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    if (!q) return waitingStudents

    return waitingStudents.filter(student => {
      const matchName = `${student.first_name} ${student.last_name}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
      return matchName.includes(q) || student.email.toLowerCase().includes(q)
    })
  }, [waitingStudents, search])

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-2 py-1 mb-2">
          Administration
        </span>
        <h1 className="text-2xl font-black text-noir">Liste d'attente générale</h1>
        <p className="text-sm text-noir/60 mt-1">
          Gérez les élèves sur liste d'attente globale. La détection s'effectue automatiquement par e-mail sur la page de validation des paiements.
        </p>
      </div>

      {error && (
        <p className="font-mono text-sm text-red-600 bg-red-50 border-l-4 border-red-400 px-4 py-3">
          Erreur : {error}
        </p>
      )}

      {/* Grid deux colonnes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Colonne Gauche : Ajouter un élève / Importer CSV */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Section 1 : Ajouter manuellement */}
          <section className="border-4 border-noir shadow-[4px_4px_0px_#000000] p-4 bg-blanc">
            <h2 className="font-black text-noir uppercase tracking-wider text-sm mb-4 border-b-2 border-noir pb-2">
              Ajouter un élève
            </h2>

            <form onSubmit={handleIndividualSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-noir/60 mb-1">
                  Prénom
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Ex: Paul"
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
                  placeholder="Ex: Bernard"
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
                  placeholder="Ex: paul.bernard@mail.com"
                  className="w-full border-2 border-noir px-3 py-1.5 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/10"
                />
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
          </section>

          {/* Section 2 : Import CSV */}
          <section className="border-4 border-noir shadow-[4px_4px_0px_#000000] p-4 bg-blanc">
            <h2 className="font-black text-noir uppercase tracking-wider text-sm mb-4 border-b-2 border-noir pb-2">
              Importer un fichier CSV
            </h2>

            {csvError && (
              <p className="text-xs font-mono text-red-600 bg-red-50 border-l-2 border-red-500 p-2 mb-3">
                {csvError}
              </p>
            )}

            {!csvFile ? (
              <div className="space-y-3">
                <p className="text-xs text-noir/60 leading-relaxed font-mono">
                  Le fichier CSV doit contenir des colonnes avec les en-têtes : <span className="font-bold">Prenom</span>, <span className="font-bold">Nom</span>, <span className="font-bold">Email</span> (ou équivalents).
                </p>
                <div className="relative border-2 border-dashed border-noir/40 hover:border-noir p-4 text-center cursor-pointer bg-noir/[0.02] transition-colors">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <p className="text-xs font-mono font-bold text-noir/70">📁 Sélectionner un fichier .csv</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-noir/20 p-2 bg-noir/[0.02]">
                  <p className="text-xs font-mono truncate font-bold text-noir">📄 {csvFile.name}</p>
                  <p className="text-[10px] font-mono text-noir/40">{(csvFile.size / 1024).toFixed(1)} KB · {csvPreview.length} élèves détectés</p>
                </div>

                {csvPreview.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-noir text-[11px] font-mono divide-y divide-noir/10 bg-blanc">
                    {csvPreview.slice(0, 5).map((p, idx) => (
                      <div key={idx} className="p-1.5 truncate">
                        {p.first_name} {p.last_name} ({p.email})
                      </div>
                    ))}
                    {csvPreview.length > 5 && (
                      <div className="p-1.5 text-center text-noir/40 bg-noir/[0.02] italic">
                        ... et {csvPreview.length - 5} autres élèves
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleImportCsv}
                    disabled={importing || csvPreview.length === 0}
                    className="flex-1 text-[10px] font-bold uppercase tracking-widest px-2.5 py-2 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors disabled:opacity-50"
                  >
                    {importing ? 'Importation…' : 'Confirmer l\'import'}
                  </button>
                  <button
                    onClick={handleCancelCsv}
                    className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-2 border-2 border-noir/30 text-noir hover:border-noir transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Colonne Droite : Liste des élèves sur liste d'attente */}
        <div className="md:col-span-2 space-y-4">
          
          {/* Barre de recherche locale */}
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom, prénom ou email…"
              className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:bg-citron/10 shadow-[2px_2px_0px_#000000]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-xs font-mono text-noir/50 underline px-2"
              >
                Reset
              </button>
            )}
          </div>

          <section className="border-4 border-noir shadow-[4px_4px_0px_#000000]">
            <div className="border-b-4 border-noir px-4 py-2 bg-noir flex items-center justify-between">
              <h2 className="font-black text-blanc uppercase tracking-widest text-xs">
                Élèves sur Liste d'Attente
              </h2>
              <span className="font-mono text-xs text-blanc/60">
                {filteredWaitingStudents.length} élève{filteredWaitingStudents.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="bg-blanc divide-y divide-noir/10">
              {isLoading && (
                <p className="p-4 font-mono text-sm text-noir/50 animate-pulse text-center">Chargement des données…</p>
              )}

              {!isLoading && filteredWaitingStudents.length === 0 && (
                <p className="p-6 font-mono text-xs text-noir/40 italic text-center">
                  Aucun élève trouvé sur la liste d'attente.
                </p>
              )}

              {!isLoading && filteredWaitingStudents.map(student => {
                // Détecter si le paiement est traité pour cet élève
                const isProcessed = dossiers.some(dossier => {
                  if (dossier.local_status !== 'Traité') return false
                  const studentEmail = student.email.toLowerCase()
                  return dossier.payer_email.toLowerCase() === studentEmail || 
                    (dossier.email && dossier.email.toLowerCase() === studentEmail)
                })

                const isEditing = editingStudentId === student.id

                if (isEditing) {
                  return (
                    <div key={student.id} className="p-3 bg-citron/10 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editFirstName}
                          onChange={e => setEditFirstName(e.target.value)}
                          className="border-2 border-noir px-2 py-1 text-xs font-mono bg-blanc focus:outline-none"
                          placeholder="Prénom"
                        />
                        <input
                          type="text"
                          value={editLastName}
                          onChange={e => setEditLastName(e.target.value)}
                          className="border-2 border-noir px-2 py-1 text-xs font-mono bg-blanc focus:outline-none"
                          placeholder="Nom"
                        />
                      </div>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="w-full border-2 border-noir px-2 py-1 text-xs font-mono bg-blanc focus:outline-none"
                        placeholder="Email"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleSaveEdit(student.id)}
                          className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 bg-noir text-blanc border-2 border-noir hover:bg-blanc hover:text-noir transition-colors font-bold"
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 border-2 border-noir/30 text-noir hover:border-noir transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div 
                    key={student.id} 
                    className={`p-3 flex items-center justify-between gap-4 transition-colors ${
                      isProcessed ? 'bg-green-100/60' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm text-noir">
                          {student.first_name} {student.last_name}
                        </p>
                        {isProcessed && (
                          <span className="text-xs text-green-600 font-bold bg-green-200 border border-green-400 px-1 py-0.5 rounded-sm uppercase tracking-widest font-mono scale-90" title="Paiement Traité !">
                            Traité
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-noir/50 truncate">
                        {student.email}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleStartEdit(student)}
                        className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5 border border-noir text-noir bg-blanc hover:bg-noir hover:text-blanc transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5 border border-red-500 text-red-500 bg-blanc hover:bg-red-50 transition-colors"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

      </div>
    </div>
  )
}
