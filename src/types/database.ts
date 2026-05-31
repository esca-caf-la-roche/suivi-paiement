// ─────────────────────────────────────────────────────────────────────────────
// Types TypeScript — base de données Supabase
// Mis à jour : Phase 3 (schéma complet)
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Énumérations
// ---------------------------------------------------------------------------

/** Statuts locaux posés par les encadrants sur un paiement. */
export type PaymentStatusEnum =
  | 'Traité'
  | 'En attente'
  | 'Remboursé'
  | 'Problème'

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Table : responsibles (1:1 avec auth.users) */
export interface Responsible {
  id:   string   // uuid = auth.users.id
  name: string   // "Patrick C" ou "Stéphane M"
}

/**
 * Table : helloasso_links
 *
 * Les liens 3x sont maintenant des liens indépendants. 
 * Ils sont rattachés aux mêmes groupes que les liens normaux correspondants via la table group_links.
 */
export interface HelloassoLink {
  id:             string    // uuid
  url:            string
  label:          string    // ex: "Tarif 280€", "Échéance 2/3"
  responsible_id: string    // uuid → responsibles.id
  is_installment: boolean
  created_at:     string    // ISO 8601
}

/** Table : groups */
export interface Group {
  id:       string   // uuid
  name:     string   // "5-6 ans", "Primaires (débutants)", etc.
  link_ids?: string[]
}

/** Table de liaison : group_links */
export interface GroupLink {
  group_id: string // uuid → groups.id
  link_id:  string // uuid → helloasso_links.id
}

/**
 * Table : registrants
 *
 * Cache local synchronisé depuis l'API HelloAsso (upsert par Edge Function).
 * PK = helloasso_payment_id (identifiant unique HelloAsso).
 */
/** Table : dossiers */
export interface DossierRow {
  id:                   string            // PK — ID du premier paiement HelloAsso
  helloasso_link_id:    string            // uuid → helloasso_links.id
  first_name:           string            // Inscrit
  last_name:            string
  email:                string | null
  phone:                string | null
  payer_first_name:     string            // Payeur
  payer_last_name:      string
  payer_email:          string
  total_amount:         number
  local_status:         PaymentStatusEnum | null // null = À traiter
  comment:              string | null
  updated_by:           string | null     // uuid → responsibles.id
  updated_at:           string | null     // ISO 8601
}

/** Table : helloasso_transactions */
export interface HelloassoTransaction {
  helloasso_payment_id: string            // PK — identifiant unique HelloAsso
  dossier_id:           string            // FK → dossiers.id
  amount:               number
  payment_date:         string            // ISO 8601
  helloasso_status:     string            // "Authorized" | "Refunded" | "Refused" | …
  synced_at:            string            // ISO 8601
  payment_receipt_url?: string | null
  fiscal_receipt_url?:  string | null
}

/** Table : payments_status_history (alimentée par trigger, jamais par le front) */
export interface PaymentStatusHistory {
  id:                   string            // uuid
  helloasso_payment_id: string            // pas de FK (conservé après vidage saison)
  old_status:           string | null     // null = première action
  new_status:           string
  comment:              string | null
  updated_by:           string            // uuid
  updated_at:           string            // ISO 8601
}

/** Table : season_resets */
export interface SeasonReset {
  id:       string   // uuid
  reset_at: string   // ISO 8601
  reset_by: string   // uuid → responsibles.id
}

// ---------------------------------------------------------------------------
// Vues / agrégats utilisés côté front
// ---------------------------------------------------------------------------

/**
 * Un "dossier" représente l'unité affichée sur la page de validation.
 * Pour un paiement 1x : un dossier = un paiement.
 * Pour un 3x : un dossier = 3 paiements regroupés par dossier_key.
 */
export interface Dossier {
  id:                 string            // ID unique du dossier
  helloasso_link_id:  string
  is_installment:     boolean
  payer_first_name:   string
  payer_last_name:    string
  payer_email:        string
  first_name:         string
  last_name:          string
  email:              string | null
  phone:              string | null
  first_payment_date: string             // date du 1er paiement (ISO 8601)
  total_amount:       number             // montant total prévu
  groups:             Group[]            // groupes associés au lien HelloAsso
  transactions:       HelloassoTransaction[] // historique des transactions
  local_status:       PaymentStatusEnum | null // null = "À traiter"
  comment:            string | null
  updated_by:         string | null      // uuid du responsible
  updated_at:         string | null
  /** ⚠️ Divergence : statut local "Traité" mais HelloAsso dit "Refunded" */
  has_status_mismatch: boolean
  /** TRUE si (local = Remboursé ET HA != Refunded) OU (local != Remboursé ET HA == Refunded) */
  needs_refund_action: boolean
}

// computeDossierKey a été supprimée car la clé unique est désormais l'ID du dossier stocké en base.
