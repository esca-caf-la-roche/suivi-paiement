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
  id:      string   // uuid
  name:    string   // "5-6 ans", "Primaires (débutants)", etc.
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
export interface Registrant {
  helloasso_payment_id: string         // PK — identifiant unique HelloAsso
  helloasso_link_id:    string         // uuid → helloasso_links.id
  first_name:           string         // Inscrit
  last_name:            string
  email:                string | null
  phone:                string | null
  payer_first_name:     string         // Payeur (souvent le parent)
  payer_last_name:      string
  payer_email:          string         // Clé de regroupement pour les 3x
  payment_date:         string         // ISO 8601
  amount:               number
  helloasso_status:     string         // "Authorized" | "Refunded" | "Refused" | …
  synced_at:            string         // ISO 8601
}

/**
 * Table : payments_status
 *
 * Pattern "absence = à traiter" :
 *   - Pas de ligne → statut implicite "À traiter"
 *   - Ligne créée uniquement à la première action de l'encadrant
 *
 * dossier_key :
 *   - Paiement 3x → `${payer_email}::${group_ids}`
 *   - Paiement 1x → helloasso_payment_id
 */
export interface PaymentStatus {
  helloasso_payment_id: string             // PK FK → registrants
  dossier_key:          string             // clé de regroupement
  status:               PaymentStatusEnum
  comment:              string | null
  updated_by:           string             // uuid → responsibles.id
  updated_at:           string             // ISO 8601
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
  dossier_key:        string
  is_installment:     boolean
  payer_first_name:   string
  payer_last_name:    string
  payer_email:        string
  first_payment_date: string             // date du 1er paiement (ISO 8601)
  total_amount:       number
  groups:             Group[]            // groupes théoriques liés au lien principal
  installments:       Registrant[]       // 1 item si 1x, 3 items si 3x
  status:             PaymentStatusEnum | null  // null = "À traiter"
  comment:            string | null
  updated_by:         string | null      // uuid du responsible
  updated_at:         string | null
  /** ⚠️ Divergence : statut local "Traité" mais HelloAsso dit "Refunded" */
  has_status_mismatch: boolean
}

// ---------------------------------------------------------------------------
// Helpers de calcul de dossier_key (à réutiliser côté front et Edge Function)
// ---------------------------------------------------------------------------

/**
 * Calcule la dossier_key pour un paiement donné.
 *
 * @param registrant      L'enregistrement de paiement HelloAsso
 * @param is_installment  Indique si le lien est un paiement fractionné
 * @param groupIds        La liste des IDs de groupes auxquels le lien appartient
 */
export function computeDossierKey(
  registrant: Pick<Registrant, 'helloasso_payment_id' | 'payer_email'>,
  is_installment: boolean,
  groupIds: string[]
): string {
  if (is_installment && groupIds.length > 0) {
    // Paiement 3x : regrouper par payeur + combinaison des groupes associés
    return `${registrant.payer_email}::${[...groupIds].sort().join(',')}`
  }
  // Paiement 1x : clé unique = payment id
  return registrant.helloasso_payment_id
}
