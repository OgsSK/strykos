# STRYKOS — PRD

## Problème / Vision
Plateforme e-commerce football premium, multimarque indépendante. Marché de lancement : Mali. Bilingue FR/EN, multidevise EUR/USD/XOF. Mobile-first. Backend Supabase (PostgreSQL), paiement Stripe en v1, architecture prête pour CinetPay/PawaPay.

## Architecture (implémentée)
- Frontend : React 19 + Tailwind + shadcn/ui. Contexte unique `StoreProvider` (i18n, devises, auth, panier, favoris).
- Backend : FastAPI + SQLAlchemy async → Supabase PostgreSQL (Transaction Pooler). Migrations Alembic.
- Auth : JWT custom (Bearer token), rôles vérifiés serveur (customer/admin).
- Paiement : Stripe (sandbox claimable, mode test). XOF réglé en EUR avec notice explicite. Statut "payé" confirmé serveur (polling + webhook idempotent).
- Devises : référence EUR, taux administrables, prix manuels par devise prioritaires, arrondis par devise (XOF entier).

## Personas
- Joueur/supporter au Mali commandant sur mobile.
- Club/académie achetant en volume.
- Administrateur STRYKOS (catalogue, commandes, stock, paramètres).

## Implémenté (2026-06)
- Accueil (hero/barre info/catégories/sections dynamiques), catalogue + filtres (marque, prix, taille, stock, promo) + tri, fiche produit (galerie, variantes liées au stock, personnalisation maillot nom/numéro, produits liés), recherche + suggestions.
- Favoris (serveur, par utilisateur), panier (localStorage, revérifié serveur), tunnel 3 étapes → Stripe, confirmation avec paiement confirmé serveur.
- Compte client (dashboard, commandes, adresses, profil). Isolation des données par client.
- Admin : dashboard KPIs (CA par devise, ruptures, best-sellers), CRUD produits + variantes + images, ajustement stock, gestion commandes + statuts, paramètres (taux de change, barre info, providers paiement).
- 18 produits de démo, 6 marques (dont 2 locales africaines), 5 catégories.
- Pages légales/statiques FR/EN (à propos, livraison, retours, FAQ, contact, CGV, confidentialité, cookies), 404.
- SEO de base (title/description, slugs stables, i18n contenu produit).

## Non implémenté / à activer (clairement désactivé)
- Emails transactionnels Resend : clé stockée dans backend/.env (EMAILS_ENABLED=false), envoi NON câblé — à activer.
- CinetPay / PawaPay : architecture providers présente, désactivés (non sélectionnables).
- URLs préfixées /fr /en (langue gérée par contexte + localStorage en v1).
- Réservation de stock temporisée pendant le paiement (stock décrémenté à la confirmation de paiement, idempotent).
- RLS Supabase (accès uniquement via backend service ; sécurité appliquée côté API).

## Backlog priorisé
- P0 : Emails transactionnels (Resend) confirmation commande/paiement.
- P1 : CinetPay + PawaPay (mobile money Mali), réservation stock temporisée, tri tenant compte du prix promo.
- P2 : URLs /fr /en, import/export CSV catalogue, suivi transporteur, partenaires locaux (commissions), marketplace.

## Identifiants de test
Voir /app/memory/test_credentials.md (admin@strykos.com / Strykos2026!).
