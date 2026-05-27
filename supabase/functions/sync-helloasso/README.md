# Edge Function : `sync-helloasso`

Synchronise les paiements HelloAsso vers la table `registrants`.

## Variables d'environnement requises

À configurer dans **Supabase Dashboard → Settings → Edge Functions → Secrets** :

| Variable               | Description                                 |
|------------------------|---------------------------------------------|
| `HELLOASSO_CLIENT_ID`  | Client ID de l'application HelloAsso OAuth2 |
| `HELLOASSO_CLIENT_SECRET` | Client Secret HelloAsso                 |

> `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par Supabase.

## Déploiement

```bash
# Depuis la racine du projet
supabase functions deploy sync-helloasso --no-verify-jwt
```

> `--no-verify-jwt` : la fonction est appelée par le frontend avec le JWT anon key Supabase.
> Elle vérifie elle-même les droits via service_role en interne.

## Comportement

1. **Cache 60s** : si la même instance warm reçoit un appel dans la fenêtre, renvoie le résultat précédent.
2. **OAuth2** : récupère un token client_credentials HelloAsso.
3. **Pagination** : 100 paiements/page, toutes les pages récupérées.
4. **Upsert** : `ON CONFLICT (helloasso_payment_id)` — met à jour `synced_at` et `helloasso_status` à chaque sync.
5. **Erreurs par lien** : une erreur sur un formulaire ne bloque pas les autres.

## Réponse

```json
{
  "synced_count": 42,
  "errors": [],
  "cached": false
}
```

## Format URL HelloAsso attendu

```
https://www.helloasso.com/associations/{org-slug}/{type}/{form-slug}
```

Types supportés : `evenements`, `adhesions`, `collectes`, `boutiques`, `paiements`

## Mapping champs HelloAsso → `registrants`

| registrants          | Source HelloAsso                                      |
|----------------------|-------------------------------------------------------|
| `helloasso_payment_id` | `payment.id` (converti en string)                  |
| `first_name`         | `items[0].user.firstName` ou `payer.firstName`        |
| `last_name`          | `items[0].user.lastName` ou `payer.lastName`          |
| `email`              | `items[0].user.email`                                 |
| `phone`              | customField contenant "téléphone"/"phone"/"mobile"     |
| `payer_first_name`   | `payer.firstName`                                     |
| `payer_last_name`    | `payer.lastName`                                      |
| `payer_email`        | `payer.email`                                         |
| `payment_date`       | `payment.date`                                        |
| `amount`             | `payment.amount / 100` (centimes → euros)             |
| `helloasso_status`   | `payment.state`                                       |
