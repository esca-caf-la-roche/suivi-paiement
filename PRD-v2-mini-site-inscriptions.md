# 📋 PRD v2 — Mini-site Gestion des Inscriptions
## Club d'Escalade CAF La Roche-Bonneville

---

## 1. Objectif

Application web interne ultra-légère permettant à Patrick C. et Stéphane M. de suivre et valider les inscriptions aux cours d'escalade. L'application croise les paiements HelloAsso avec un statut de traitement local, en vue "split view" (côte à côte avec le listing du club).

## 2. Stack Technique

- **Frontend** : Vite + React + Tailwind CSS
- **Backend & DB** : Supabase (PostgreSQL, Auth, RLS, Realtime, Edge Functions)
- **Hébergement** : Vercel (CI/CD via GitHub)
- **API externe** : HelloAsso (OAuth2, polling)

## 3. Architecture des Données

### Vue d'ensemble

```
[auth.users] ─(1:1)─> [responsibles]
                         │ (1)
                         ▼
                  [helloasso_links] ─(self-ref optionnelle)─> parent_link_id
                         │ (1:N)
                         ├──────────> [groups]
                         │ (1:N)
                         ▼
                  [registrants] (synchronisée depuis HelloAsso, upsert)
                         │ (1:1 par payment_id)
                         ▼
                  [payments_status] (local, créé seulement à la 1ʳᵉ action)
                         │ (1:N)
                         ▼
                  [payments_status_history] (audit)
```

### Tables SQL

#### `responsibles`
| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | = `auth.users.id` |
| `name` | text | "Patrick C" ou "Stéphane M" |

#### `helloasso_links`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `url` | text UNIQUE | URL HelloAsso |
| `label` | text | Libellé interne (ex: "Tarif 280€") |
| `responsible_id` | uuid FK | → `responsibles.id` |
| `parent_link_id` | uuid FK NULLABLE | → `helloasso_links.id` (lien 1x du dossier). NULL = lien principal. Non-NULL = lien 3x rattaché à un parent |
| `is_installment` | bool | true si lien de paiement fractionné |
| `created_at` | timestamptz | |

#### `groups`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | "5-6 ans", "Primaires (débutants)", etc. |
| `link_id` | uuid FK | → `helloasso_links.id` (lien principal, jamais un lien 3x) |

#### `registrants` (cache local synchronisé)
| Colonne | Type | Notes |
|---|---|---|
| `helloasso_payment_id` | text PK | Identifiant unique HelloAsso |
| `helloasso_link_id` | uuid FK | → `helloasso_links.id` |
| `first_name` | text | Inscrit |
| `last_name` | text | Inscrit |
| `email` | text | Inscrit |
| `phone` | text NULL | |
| `payer_first_name` | text | Payeur (parent souvent) |
| `payer_last_name` | text | |
| `payer_email` | text | **Clé de regroupement pour les paiements 3x** |
| `payment_date` | timestamptz | |
| `amount` | numeric(10,2) | |
| `helloasso_status` | text | `Authorized`, `Refunded`, `Refused`, etc. |
| `synced_at` | timestamptz | Dernière sync API |

#### `payments_status` (statut local — créé seulement si action)
| Colonne | Type | Notes |
|---|---|---|
| `helloasso_payment_id` | text PK FK | → `registrants.helloasso_payment_id` |
| `dossier_key` | text | Clé de regroupement : `payer_email + parent_link_id` (pour les 3x) ou `helloasso_payment_id` (pour les 1x). Voir §4.4 |
| `status` | text | `Traité`, `En attente`, `Remboursé`, `Problème` |
| `comment` | text NULL | |
| `updated_by` | uuid FK | → `responsibles.id` |
| `updated_at` | timestamptz | |

> ⚠️ **Pattern absence = à traiter** : pas de ligne `payments_status` ⇒ statut implicite "À traiter". Une ligne n'est créée que lors de la première action de l'encadrant.

#### `payments_status_history` (audit)
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `helloasso_payment_id` | text | (pas de FK : on conserve l'historique même après suppression) |
| `old_status` | text NULL | NULL = première action |
| `new_status` | text | |
| `comment` | text NULL | |
| `updated_by` | uuid | |
| `updated_at` | timestamptz | |

Alimentée par un **trigger Postgres** `AFTER INSERT OR UPDATE` sur `payments_status`.

---

## 4. Spécifications Fonctionnelles

### 4.1 Authentification

- Inscriptions publiques **désactivées** dans Supabase
- Connexion par **OTP email** (code 6 chiffres ou magic link)
- Patrick et Stéphane ajoutés manuellement via la console Supabase
- Une ligne `responsibles` est créée pour chacun

### 4.2 Page de Configuration (`/config`)

Accessible aux deux encadrants. Permet de gérer la structure entre saisons.

**Section Liens HelloAsso**
- Liste des liens existants (label, URL, responsable, type 1x/3x)
- Bouton "Ajouter un lien" → formulaire (URL, label, responsable, type, parent si 3x)
- Bouton "Modifier" / "Supprimer" sur chaque ligne
- Validation : un lien 3x doit obligatoirement avoir un `parent_link_id` qui pointe vers un lien 1x

**Section Groupes**
- Liste des groupes avec leur lien rattaché
- Bouton "Ajouter un groupe" → formulaire (nom, lien associé)
- Modification / suppression

**Section Réinitialisation Saison**
- Bouton rouge "Réinitialiser la saison" avec **double confirmation** (modale + saisie du mot "RESET")
- Action : vide `registrants`, `payments_status`, `payments_status_history`
- Conserve : `helloasso_links`, `groups`, `responsibles`
- Loggue la date de reset (table `season_resets` optionnelle avec `reset_at` + `reset_by`)

### 4.3 Page de Validation (`/`) — Split View

**Contraintes UI**
- Largeur max stricte : `max-w-md` (≈ 448px)
- Design "app mobile" intégrable en panneau latéral
- Police lisible à 80% de zoom navigateur

**Header (fixe)**
- Sélecteur d'encadrant : Patrick / Stéphane / Tous
- Sélecteur de vue : **À traiter** (défaut) / **Traités** / **Tous**
- Barre de recherche par nom (inscrit OU payeur, casse insensible)
- Compteur : "X dossiers à traiter"
- Bouton refresh manuel (force resync)

**Liste de dossiers**
- Cartes triées **chronologiquement** (ancien → récent par défaut, toggle possible)
- Affichage d'une carte :
  - Nom + prénom inscrit (gros)
  - Nom + prénom payeur si différent (petit)
  - Date du premier paiement
  - Montant total
  - Groupe(s) théorique(s) rattaché(s) au lien
  - **Si 3x** : badge "3x" + 3 lignes d'échéances avec statut HelloAsso individuel (Authorized / Refunded / En attente)
  - Statut local actuel (badge couleur)
  - Zone commentaire (textarea, sauvegarde au blur)
  - Boutons d'action : "✓ Traité" (vert), "⏸ En attente", "↩ Remboursé", "⚠ Problème"

**Comportement dynamique**
- En vue "À traiter" : dès qu'un statut est posé sur un dossier → la carte **disparaît** instantanément
- En vue "Traités" : possibilité de cliquer "Ré-ouvrir" → supprime la ligne `payments_status` (le dossier revient en "À traiter")
- **Realtime Supabase** : abonnement à la table `payments_status`. Si Stéphane traite un dossier pendant que Patrick a la page ouverte, la carte disparaît côté Patrick automatiquement.

### 4.4 Logique de regroupement 3x

Pour chaque paiement remonté de HelloAsso :

```
SI registrant.helloasso_link.parent_link_id IS NOT NULL:
  dossier_key = payer_email + "::" + parent_link_id
SINON:
  dossier_key = helloasso_payment_id
```

Côté affichage :
- `GROUP BY dossier_key`
- 1 dossier = 1 carte, peu importe le nombre d'échéances
- Le statut local s'applique au dossier entier (la ligne `payments_status` est posée sur le `helloasso_payment_id` de la **première échéance**, mais la `dossier_key` permet de retrouver toutes les échéances liées)

> ⚠️ Edge case : si le payeur a fait deux inscriptions 3x distinctes avec le même email vers le même lien parent (peu probable mais possible : deux enfants), la clé fusionne. Documenter, et prévoir un bouton "scinder" en v2 si le cas remonte.

### 4.5 Synchronisation HelloAsso

**Edge Function `sync-helloasso`**
- Trigger : appel depuis le frontend au chargement de la page de validation
- Cache mémoire de **60 secondes** (clé : "all-payments") pour absorber les F5
- Auth : OAuth2 client credentials (Client ID / Secret stockés en variables d'env Supabase)
- Pagination : récupère tous les paiements de la saison (500 attendus, max 500/page selon API HelloAsso, prévoir paginer si nécessaire)
- Filtre API : seuls les paiements avec statut HelloAsso `Authorized`, `Refunded`, ou autres statuts pertinents (à confirmer dans la doc HelloAsso)
- **Upsert** dans `registrants` avec `synced_at = NOW()`
- Retourne au frontend : `{ synced_count, errors }`

**Stratégie polling pure**
- Pas de webhook
- Resync à chaque chargement de page (cache 60s)
- Bouton refresh manuel pour forcer

**Différenciation statuts**
- `registrants.helloasso_status` = vérité HelloAsso (peut bouger : un paiement validé peut devenir remboursé)
- `payments_status.status` = vérité locale (décision de l'encadrant)
- L'UI doit afficher les deux et alerter si divergence (ex: statut local "Traité" + statut HelloAsso "Refunded" → badge ⚠️ rouge "Remboursement détecté, à vérifier")

## 5. Sécurité & RLS

- **Patrick et Stéphane = admins équivalents** : peuvent tout voir et tout modifier
- Politiques RLS sur toutes les tables : `auth.uid() IN (SELECT id FROM responsibles)`
- Les Edge Functions tournent en service_role (bypass RLS pour la sync)
- Client Secret HelloAsso : **uniquement** en variable d'env Supabase, jamais côté navigateur

## 6. Realtime

- Plan Free Supabase suffisant (largement sous les limites pour 2 utilisateurs)
- Abonnement frontend sur `payments_status` (INSERT / UPDATE / DELETE)
- Update local du state React à la réception d'événement

## 7. Hors scope (v1)

- ❌ Mapping groupe par paiement (on identifie le payeur, pas le groupe)
- ❌ Capacité par groupe
- ❌ Export CSV
- ❌ Multi-saison (vidage manuel)
- ❌ RGPD (à traiter avant mise en prod réelle)
- ❌ Notifications email / Telegram
- ❌ Statistiques / dashboard

## 8. Roadmap technique suggérée

1. **Setup** : projet Vite + Supabase + Vercel + GitHub
2. **Auth** : OTP email + table `responsibles` + RLS
3. **Schéma DB** : migration SQL avec toutes les tables + trigger historique
4. **Edge Function sync** : OAuth HelloAsso + pagination + upsert (testable en isolation)
5. **Page Config** : CRUD liens et groupes
6. **Page Validation** : liste + filtres + recherche (sans Realtime)
7. **Actions** : pose de statut + commentaire + ré-ouverture
8. **Realtime** : abonnement live
9. **Reset saison** : bouton + double confirm
10. **Polish UI** : split view, badges, edge cases (3x, divergence statut)

## 9. Variables d'environnement

```
# Supabase (auto-injectées par Vercel)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Edge Functions (Supabase Dashboard)
HELLOASSO_CLIENT_ID=
HELLOASSO_CLIENT_SECRET=
HELLOASSO_ORG_SLUG=caf-la-roche-bonneville  # à confirmer
```
