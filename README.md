# FJD Inscriptions — CAF La Roche-Bonneville

Mini-site interne de gestion des inscriptions aux cours d'escalade.
Permet à Patrick C. et Stéphane M. de suivre et valider les paiements HelloAsso
en les croisant avec un statut de traitement local, en vue split-screen.

📄 [PRD complet](./PRD-v2-mini-site-inscriptions.md)

---

## Prérequis

- **Node.js 20+**
- Compte **Supabase** (projet créé, URL + anon key disponibles)
- Compte **HelloAsso** (Client ID + Secret pour l'API)

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local et renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
```

## Commandes

```bash
# Démarrer le serveur de développement (http://localhost:5173)
npm run dev

# Build de production
npm run build

# Prévisualiser le build
npm run preview
```

## Stack technique

| Couche | Techno |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL, Auth, RLS, Realtime, Edge Functions) |
| Hébergement | Vercel (CI/CD via GitHub) |
| API externe | HelloAsso (OAuth2, polling) |

## Variables d'environnement

Copier `.env.example` → `.env.local` et renseigner :

| Variable | Où la trouver |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `HELLOASSO_CLIENT_ID` | Edge Functions uniquement — jamais navigateur |
| `HELLOASSO_CLIENT_SECRET` | Edge Functions uniquement — jamais navigateur |
