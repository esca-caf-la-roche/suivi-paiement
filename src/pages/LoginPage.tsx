import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'email' | 'otp'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },  // Interdit la création de compte
    })
    setLoading(false)
    if (error) {
      setError('Adresse non reconnue ou erreur d\'envoi. Vérifiez l\'email.')
    } else {
      setInfo(`Code envoyé à ${email}. Vérifiez votre boîte mail.`)
      setStep('otp')
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError('Code invalide ou expiré. Vérifiez le code ou recommencez.')
    }
    // Si OK, onAuthStateChange dans AuthContext met à jour la session → redirect auto
  }

  return (
    <div className="min-h-screen bg-blanc font-sans flex items-center justify-center p-8">
      <div className="border-4 border-noir shadow-[8px_8px_0px_#000000] bg-blanc p-10 max-w-sm w-full">

        {/* Header */}
        <span className="inline-block bg-citron border-2 border-noir text-noir text-xs font-bold uppercase tracking-widest px-3 py-1 mb-6">
          CAF La Roche-Bonneville
        </span>
        <h1 className="text-3xl font-black text-noir leading-tight mb-1">
          FJD Inscriptions
        </h1>
        <p className="text-sm font-mono text-noir border-l-4 border-glace pl-3 mb-8">
          {step === 'email' ? 'Connexion par code email' : 'Entrez votre code'}
        </p>

        {/* Étape 1 — Saisie email */}
        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-noir mb-1">
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="patrick@example.com"
                className="w-full border-2 border-noir px-3 py-2 text-sm font-mono bg-blanc focus:outline-none focus:border-glace"
              />
            </div>
            {error && (
              <p className="text-xs font-mono border-l-4 border-red-500 pl-3 text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-citron border-2 border-noir text-noir font-bold uppercase tracking-widest text-sm px-4 py-2 shadow-[4px_4px_0px_#000000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Envoi…' : 'Envoyer le code →'}
            </button>
          </form>
        )}

        {/* Étape 2 — Saisie OTP */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {info && (
              <p className="text-xs font-mono border-l-4 border-glace pl-3 text-noir">
                {info}
              </p>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-noir mb-1">
                Code à 6 chiffres
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                placeholder="123456"
                className="w-full border-2 border-noir px-3 py-2 text-lg font-mono tracking-[0.5em] bg-blanc focus:outline-none focus:border-glace"
              />
            </div>
            {error && (
              <p className="text-xs font-mono border-l-4 border-red-500 pl-3 text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-citron border-2 border-noir text-noir font-bold uppercase tracking-widest text-sm px-4 py-2 shadow-[4px_4px_0px_#000000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Vérification…' : 'Se connecter →'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError(null); setInfo(null) }}
              className="w-full text-xs font-mono text-noir underline underline-offset-2 hover:no-underline"
            >
              ← Changer d'adresse
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
