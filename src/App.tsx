function App() {
  return (
    <div className="min-h-screen bg-blanc font-sans flex items-center justify-center p-8">
      <div className="border-4 border-noir shadow-[8px_8px_0px_#000000] bg-blanc p-10 max-w-sm w-full">
        {/* Badge jaune citron */}
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-3 py-1 mb-6">
          CAF La Roche-Bonneville
        </span>

        {/* Titre principal */}
        <h1 className="text-3xl font-black text-noir leading-tight mb-2">
          FJD Inscriptions
        </h1>

        {/* Status */}
        <p className="text-base font-semibold text-noir border-l-4 border-glace pl-3 mb-8">
          Setup OK ✓
        </p>

        {/* Infos stack */}
        <ul className="space-y-1 text-sm text-noir font-mono border-t-2 border-noir pt-4">
          <li>→ Vite + React + TypeScript</li>
          <li>→ Tailwind CSS (palette custom)</li>
          <li>→ Supabase client prêt</li>
          <li>→ Phase 1 complète</li>
        </ul>
      </div>
    </div>
  )
}

export default App
