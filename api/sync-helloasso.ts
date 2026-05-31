// ─────────────────────────────────────────────────────────────────────────────
// Vercel Function : api/sync-helloasso
//
// Remplace l'Edge Function Supabase qui était bloquée par le WAF Cloudflare
// de HelloAsso (IPs Supabase/AWS rejetées avec 403).
//
// Variables d'env requises (Vercel Dashboard → Settings → Environment Variables) :
//   HELLOASSO_CLIENT_ID
//   HELLOASSO_CLIENT_SECRET
//   SUPABASE_URL              (= VITE_SUPABASE_URL sans le préfixe VITE_)
//   SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncResult {
  synced_count: number
  errors:       string[]
  cached?:      boolean
}

interface HaUser {
  firstName?: string
  lastName?:  string
  email?:     string
}

interface HaCustomField {
  name:    string
  type?:   string
  answer?: string
}

interface HaItem {
  id:           number
  amount?:      number
  user?:        HaUser
  customFields?: HaCustomField[]
}

interface HaPayment {
  id:     number
  date:   string
  amount: number   // centimes
  state:  string
  payer?: HaUser
  order?: { id?: number, payer?: HaUser }
  items?: HaItem[]
  initialTransactionId?: number
}

interface HaResponse {
  data:       HaPayment[]
  pagination?: {
    pageIndex?: number
    pageSize?: number
    totalCount?: number
    totalPages?: number
    continuationToken?: string
  }
}

interface RegistrantRow {
  helloasso_payment_id: string
  helloasso_order_id:   string | null
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HA_TOKEN_URL = 'https://api.helloasso.com/oauth2/token'
const HA_API_BASE  = 'https://api.helloasso.com/v5'

const FORM_TYPE_MAP: Record<string, string> = {
  evenements: 'Event',
  adhesions:  'Membership',
  collectes:  'CrowdFunding',
  boutiques:  'Shop',
  paiements:  'PaymentForm',
}

function parseHaUrl(raw: string): { orgSlug: string; formType: string; formSlug: string } | null {
  try {
    const url   = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)
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

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(HA_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HelloAsso token (${res.status}): ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  return json.access_token as string
}

async function fetchAllPayments(
  token:   string,
  orgSlug: string,
  formType: string,
  formSlug: string,
): Promise<HaPayment[]> {
  const all: HaPayment[] = []
  let continuationToken: string | undefined = undefined

  do {
    const url = new URL(`${HA_API_BASE}/organizations/${orgSlug}/forms/${formType}/${formSlug}/payments`)
    url.searchParams.set('pageSize', '100')
    if (continuationToken) {
      url.searchParams.set('continuationToken', continuationToken)
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HelloAsso payments [${formSlug}] (${res.status}): ${body.slice(0, 200)}`)
    }
    const json: HaResponse = await res.json()
    
    if (!json.data || json.data.length === 0) {
      break
    }
    
    // On ne garde que les paiements valides ou remboursés
    const validPayments = json.data.filter(p => p.state !== 'Refused' && p.state !== 'Canceled')
    all.push(...validPayments)
    
    continuationToken = json.pagination?.continuationToken
  } while (continuationToken)

  return all
}

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

function mapPayment(payment: HaPayment, linkId: string, now: string): RegistrantRow {
  const payer     = payment.payer ?? payment.order?.payer ?? {}
  const firstItem = payment.items?.[0]
  const user      = firstItem?.user ?? {}

  return {
    helloasso_payment_id: String(payment.id),
    helloasso_order_id:   payment.order?.id 
                            ? String(payment.order.id) 
                            : (payment.initialTransactionId ? String(payment.initialTransactionId) : String(payment.id)),
    helloasso_link_id:    linkId,
    first_name:           user.firstName  || payer.firstName || '',
    last_name:            user.lastName   || payer.lastName  || '',
    email:                user.email      ?? null,
    phone:                extractPhone(payment.items),
    payer_first_name:     payer.firstName ?? '',
    payer_last_name:      payer.lastName  ?? '',
    payer_email:          payer.email     ?? '',
    payment_date:         payment.date,
    amount:               payment.amount / 100,
    helloasso_status:     payment.state,
    synced_at:            now,
  }
}

// ─── Handler Vercel ───────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const clientId     = process.env.HELLOASSO_CLIENT_ID
    const clientSecret = process.env.HELLOASSO_CLIENT_SECRET
    const supabaseUrl  = process.env.SUPABASE_URL
    const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!clientId || !clientSecret) {
      return res.status(500).json({ synced_count: 0, errors: ['HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET manquants'] } satisfies SyncResult)
    }
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ synced_count: 0, errors: ['SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants'] } satisfies SyncResult)
    }

    // Client Supabase service_role → bypass RLS
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // Récupération des liens configurés
    const { data: links, error: linksError } = await supabase
      .from('helloasso_links')
      .select('id, url, label, is_installment')

    if (linksError) throw new Error(`Supabase helloasso_links: ${linksError.message}`)
    if (!links?.length) {
      return res.status(200).json({ synced_count: 0, errors: ['Aucun lien HelloAsso configuré'] } satisfies SyncResult)
    }

    // Token HelloAsso
    const token = await getAccessToken(clientId, clientSecret)

    const now    = new Date().toISOString()
    const errors: string[] = []
    const rows:   RegistrantRow[] = []

    for (const link of links) {
      const parsed = parseHaUrl(link.url)
      if (!parsed) {
        errors.push(`URL non parsable [${link.label}]: ${link.url}`)
        continue
      }
      try {
        const payments = await fetchAllPayments(token, parsed.orgSlug, parsed.formType, parsed.formSlug)
        console.log(`[sync-helloasso] ${link.label} → ${payments.length} paiements`)
        for (const p of payments) rows.push(mapPayment(p, link.id, now))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`[${link.label}] ${msg}`)
        console.error(`[sync-helloasso] Erreur "${link.label}":`, msg)
      }
    }

    // Upsert par lots de 500
    let synced_count = 0
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error: upsertError, count } = await supabase
        .from('registrants')
        .upsert(batch, { onConflict: 'helloasso_payment_id', count: 'exact' })

      if (upsertError) {
        errors.push(`Upsert batch ${Math.floor(i / BATCH) + 1}: ${upsertError.message}`)
      } else {
        synced_count += count ?? batch.length
      }
    }

    console.log(`[sync-helloasso] ✓ ${synced_count} upsertés, ${errors.length} erreur(s)`)
    return res.status(200).json({ synced_count, errors } satisfies SyncResult)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync-helloasso] Fatal:', message)
    return res.status(500).json({ synced_count: 0, errors: [message] } satisfies SyncResult)
  }
}
