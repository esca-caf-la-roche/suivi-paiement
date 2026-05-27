// ─────────────────────────────────────────────────────────────────────────────
// Edge Function : sync-helloasso
//
// Rôle : synchronise les paiements HelloAsso vers la table `registrants`.
//        Tournée en service_role → bypass RLS.
//
// Déclenchement : appelée depuis le front au chargement de la page de validation
//                 + bouton refresh manuel.
//
// Cache mémoire 60s : si la même instance reçoit une requête dans la fenêtre,
//                     on renvoie le résultat précédent sans frapper l'API HelloAsso.
//
// Variables d'env requises (Supabase Dashboard → Settings → Edge Functions) :
//   HELLOASSO_CLIENT_ID
//   HELLOASSO_CLIENT_SECRET
//   (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types HelloAsso API v5 ───────────────────────────────────────────────────

interface HaUser {
  firstName?: string
  lastName?: string
  email?: string
  dateOfBirth?: string
  gender?: string
  address?: string
  zipCode?: string
  city?: string
  countryCode?: string
}

interface HaCustomField {
  name: string
  type?: string
  answer?: string
}

interface HaItem {
  id: number
  amount?: number
  type?: string
  state?: string
  name?: string
  user?: HaUser
  customFields?: HaCustomField[]
}

interface HaPayment {
  id: number
  date: string
  amount: number   // en centimes
  state: string    // "Authorized" | "Refunded" | "Refused" | "Pending" | …
  payer?: HaUser
  order?: {
    id?: number
    payer?: HaUser
    formSlug?: string
    formType?: string
  }
  items?: HaItem[]
}

interface HaResponse {
  data: HaPayment[]
  pagination: {
    pageIndex: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

// ─── Type de résultat retourné au frontend ────────────────────────────────────

interface SyncResult {
  synced_count: number
  errors: string[]
  cached?: boolean
}

// ─── Cache mémoire (module-level → survit entre les requêtes warm) ────────────

const CACHE_TTL_MS = 60_000
const CACHE_KEY = 'all-payments'

interface CacheEntry {
  ts: number
  result: SyncResult
}

const syncCache = new Map<string, CacheEntry>()

function getCached(): SyncResult | null {
  const entry = syncCache.get(CACHE_KEY)
  if (!entry) return null
  if (Date.now() - entry.ts < CACHE_TTL_MS) return { ...entry.result, cached: true }
  syncCache.delete(CACHE_KEY)
  return null
}

function setCache(result: SyncResult): void {
  syncCache.set(CACHE_KEY, { ts: Date.now(), result })
}

// ─── OAuth2 HelloAsso ─────────────────────────────────────────────────────────

const HA_TOKEN_URL = 'https://api.helloasso.com/oauth2/token'
const HA_API_BASE = 'https://api.helloasso.com/v5'

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(HA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HelloAsso token request failed (${res.status}): ${body}`)
  }
  const json = await res.json()
  return json.access_token as string
}

// ─── Parsing URL HelloAsso ────────────────────────────────────────────────────
//
// Format public : https://www.helloasso.com/associations/{org-slug}/{type}/{form-slug}
// Types connus : evenements → Event | adhesions → Membership |
//               collectes → CrowdFunding | boutiques → Shop | paiements → PaymentForm

const FORM_TYPE_MAP: Record<string, string> = {
  evenements: 'Event',
  adhesions:  'Membership',
  collectes:  'CrowdFunding',
  boutiques:  'Shop',
  paiements:  'PaymentForm',
}

interface ParsedHaUrl {
  orgSlug: string
  formType: string
  formSlug: string
}

function parseHaUrl(raw: string): ParsedHaUrl | null {
  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)
    // Attendu : ['associations', '{org}', '{type}', '{slug}']
    if (parts.length < 4 || parts[0] !== 'associations') return null
    const orgSlug  = parts[1]
    const formType = FORM_TYPE_MAP[parts[2]]
    const formSlug = parts[3]
    if (!formType || !formSlug) return null
    return { orgSlug, formType, formSlug }
  } catch {
    return null
  }
}

// ─── Récupération paginée des paiements d'un formulaire ──────────────────────

async function fetchAllPayments(
  token: string,
  parsed: ParsedHaUrl,
): Promise<HaPayment[]> {
  const { orgSlug, formType, formSlug } = parsed
  const all: HaPayment[] = []
  let page = 1
  let totalPages = 1

  do {
    const url = [
      HA_API_BASE,
      'organizations', orgSlug,
      'forms', formType, formSlug,
      'payments',
    ].join('/') + `?pageIndex=${page}&pageSize=100`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HelloAsso payments error [${formSlug}] (${res.status}): ${body}`)
    }

    const json: HaResponse = await res.json()
    all.push(...json.data)
    totalPages = json.pagination.totalPages
    page++
  } while (page <= totalPages)

  return all
}

// ─── Mapping HelloAsso → registrant ──────────────────────────────────────────
//
// Priorité pour l'inscrit : item.user > payer
// Téléphone : cherché dans customFields (nom contenant "téléphone" ou "phone")

function extractPhone(items?: HaItem[]): string | null {
  if (!items?.length) return null
  for (const item of items) {
    for (const cf of item.customFields ?? []) {
      const name = cf.name.toLowerCase()
      if ((name.includes('téléphone') || name.includes('telephone') || name.includes('phone') || name.includes('mobile') || name.includes('portable')) && cf.answer) {
        return cf.answer
      }
    }
  }
  return null
}

interface RegistrantRow {
  helloasso_payment_id: string
  helloasso_link_id:    string
  first_name:           string
  last_name:            string
  email:                string | null
  phone:                string | null
  payer_first_name:     string
  payer_last_name:      string
  payer_email:          string
  payment_date:         string
  amount:               number
  helloasso_status:     string
  synced_at:            string
}

function mapPayment(payment: HaPayment, linkId: string, now: string): RegistrantRow {
  // Payer : préférer payment.payer, fallback order.payer
  const payer = payment.payer ?? payment.order?.payer ?? {}

  // Inscrit : préférer le user du premier item, fallback sur le payer
  const firstItem = payment.items?.[0]
  const user = firstItem?.user ?? {}

  const firstName = user.firstName || payer.firstName || ''
  const lastName  = user.lastName  || payer.lastName  || ''
  const email     = user.email     || null

  return {
    helloasso_payment_id: String(payment.id),
    helloasso_link_id:    linkId,
    first_name:           firstName,
    last_name:            lastName,
    email,
    phone:                extractPhone(payment.items),
    payer_first_name:     payer.firstName ?? '',
    payer_last_name:      payer.lastName  ?? '',
    payer_email:          payer.email     ?? '',
    payment_date:         payment.date,
    amount:               payment.amount / 100,   // centimes → euros
    helloasso_status:     payment.state,
    synced_at:            now,
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    // ── 1. Cache hit ? ────────────────────────────────────────────────────────
    const cached = getCached()
    if (cached) {
      console.log('[sync-helloasso] Cache hit — returning cached result')
      return new Response(JSON.stringify(cached), { headers: corsHeaders })
    }

    // ── 2. Vérification des variables d'env ───────────────────────────────────
    const clientId     = Deno.env.get('HELLOASSO_CLIENT_ID')
    const clientSecret = Deno.env.get('HELLOASSO_CLIENT_SECRET')
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!clientId || !clientSecret) {
      throw new Error('Variables d\'env HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET manquantes')
    }

    // ── 3. Client Supabase (service_role → bypass RLS) ────────────────────────
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // ── 4. Récupération des liens HelloAsso actifs ────────────────────────────
    const { data: links, error: linksError } = await supabase
      .from('helloasso_links')
      .select('id, url, label, is_installment')

    if (linksError) throw new Error(`Supabase helloasso_links: ${linksError.message}`)
    if (!links?.length) {
      const result: SyncResult = { synced_count: 0, errors: ['Aucun lien HelloAsso configuré'] }
      return new Response(JSON.stringify(result), { headers: corsHeaders })
    }

    // ── 5. Token OAuth2 HelloAsso ─────────────────────────────────────────────
    console.log('[sync-helloasso] Obtention token HelloAsso…')
    const token = await getAccessToken(clientId, clientSecret)

    // ── 6. Sync par lien ──────────────────────────────────────────────────────
    const now = new Date().toISOString()
    const errors: string[] = []
    const rows: RegistrantRow[] = []

    for (const link of links) {
      const parsed = parseHaUrl(link.url)
      if (!parsed) {
        errors.push(`URL non parsable [${link.label}]: ${link.url}`)
        continue
      }

      console.log(`[sync-helloasso] Fetch payments pour "${link.label}" (${parsed.formType}/${parsed.formSlug})…`)

      try {
        const payments = await fetchAllPayments(token, parsed)
        console.log(`  → ${payments.length} paiements récupérés`)

        for (const payment of payments) {
          rows.push(mapPayment(payment, link.id, now))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`[${link.label}] ${msg}`)
        console.error(`[sync-helloasso] Erreur sur "${link.label}":`, msg)
      }
    }

    // ── 7. Upsert dans registrants ────────────────────────────────────────────
    let synced_count = 0

    if (rows.length > 0) {
      // Upsert par lots de 500 pour éviter les timeouts
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const { error: upsertError, count } = await supabase
          .from('registrants')
          .upsert(batch, {
            onConflict: 'helloasso_payment_id',
            count: 'exact',
          })

        if (upsertError) {
          errors.push(`Upsert batch ${i / BATCH + 1}: ${upsertError.message}`)
          console.error('[sync-helloasso] Upsert error:', upsertError)
        } else {
          synced_count += count ?? batch.length
        }
      }
    }

    // ── 8. Résultat & mise en cache ───────────────────────────────────────────
    const result: SyncResult = { synced_count, errors }
    setCache(result)

    console.log(`[sync-helloasso] ✓ ${synced_count} paiements upsertés, ${errors.length} erreur(s)`)

    return new Response(JSON.stringify(result), { headers: corsHeaders })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync-helloasso] Fatal:', message)
    return new Response(
      JSON.stringify({ synced_count: 0, errors: [message] } satisfies SyncResult),
      { status: 500, headers: corsHeaders },
    )
  }
})
