# STRYKOS — PRD

## Problème / Vision
Plateforme e-commerce football premium, multimarque indépendante. Marché de lancement : Mali. Bilingue FR/EN, multidevise EUR/USD/XOF. Mobile-first. Backend Supabase (PostgreSQL), paiement Stripe en v1, architecture prête pour CinetPay/PawaPay.

## Architecture (implémentée)
- Frontend : React 19 + Tailwind + shadcn/ui. Contexte unique `StoreProvider` (i18n, devises, auth, panier, favoris).
- Backend : FastAPI + SQLAlchemy async → Supabase PostgreSQL (Transaction Pooler). Migrations Alembic (`9a7cf7064fba` initial, `bb8f9672b439` tracking/promo/media/emails).
- Auth : JWT custom (Bearer token), rôles vérifiés serveur (customer/admin). Seed admin idempotent (ne réécrit plus le mot de passe à chaque démarrage).
- Paiement : Stripe (mode test). XOF réglé en EUR avec notice explicite. Statut "payé" confirmé serveur (polling + webhook idempotent). Remise promo transmise à Stripe via coupon `duration=once`.
- E-mails : proxy e-mail Emergent (`emails.py`), expéditeur affiché "STRYKOS", Reply-To contact@actoos.com, notification admin → contact@actoos.com. Journal en table `email_logs`. (La clé Resend fournie par l'utilisateur n'est pas utilisée : l'adresse expéditeur est gérée par la plateforme.)
- Médias : Emergent Object Storage (`storage.py`), upload admin simple ou par morceaux (4 Mo), servi publiquement via `GET /api/media/{path}` (cache mémoire + Cache-Control immutable). URLs stockées en relatif `/api/media/...` et résolues avec `PUBLIC_BASE_URL`.
- Devises : référence EUR, taux administrables, prix manuels par devise prioritaires, arrondis par devise (XOF entier).

## Personas
- Joueur/supporter au Mali commandant sur mobile.
- Club/académie achetant en volume.
- Administrateur STRYKOS (cockpit : catalogue, commandes, suivi, promos, clients, e-mails, paramètres).

## Implémenté
### V1 (2026-06, itération 1)
- Accueil, catalogue + filtres + tri, fiche produit (galerie, variantes/stock, personnalisation), recherche + suggestions.
- Favoris, panier, tunnel 3 étapes → Stripe, confirmation serveur.
- Compte client (dashboard, commandes, adresses, profil).
- 18 produits de démo, 6 marques, 5 catégories. Pages légales FR/EN, 404, SEO de base.

### Itération 2 (2026-06) — testée (iteration_2.json : backend 46/46 après correctif, frontend 100 %)
- **E-mails transactionnels FR/EN** : confirmation de paiement (client + copie admin), expédition (avec transporteur/n°/lien), livraison, annulation/remboursement. Déclenchés par `_finalize_paid` (webhook/polling) et par les changements de statut admin. Renvoi manuel depuis le détail commande. Journal `/admin/emails`.
- **Suivi transporteur** : champs `tracking_carrier/number/url`, `status_history`, `shipped_at/delivered_at`. Page publique `/suivi` (n° + e-mail), timeline dans le compte client et sur la confirmation. Lien de suivi dans les e-mails.
- **Codes promo** : table `promo_codes` (percent/fixed, min, dates, limite, actif, livraison offerte, 1ère commande). `POST /api/promo/check`, application dans `/checkout/validate|create`, `used_count` incrémenté au paiement. UI checkout (promo-box) + admin CRUD. Code démo `BIENVENUE10` (10 %, min 20 €).
- **Cockpit admin complet** : dashboard (KPIs, graphe 14 j, CA par devise, dernières commandes, alertes stock/e-mails), commandes (filtres, recherche, détail, statut + note, suivi, notes internes, renvoi e-mail, remboursement Stripe total/partiel avec restock, suppression), produits (CRUD complet, upload images drag&drop/réordonnancement, vidéo, prix manuels USD/XOF, presets tailles, dupliquer, publier/dépublier, suppression définitive), marques (CRUD + logo), catégories (CRUD), clients (liste, fiche, rôle, suppression), codes promo, e-mails, paramètres (coordonnées, hero + upload, barre info, modes de livraison, taux, fournisseurs).
- Coordonnées : contact@actoos.com / +32 465743001 (défauts + migration auto de l'ancienne valeur en base), page contact dynamique (WhatsApp, horaires), footer.
- Warnings React Hooks corrigés (Catalog, OrderConfirmation).

### Itération 3 (2026-06) — testée (iteration_3.json : backend 25/25, frontend 100 %)
- **Accueil vidéo style Nike** : hero = carrousel de slides vidéo (poster image de secours, défilement auto configurable, flèches, points de progression, swipe, pause). Chaque section de l'accueil (catégories, nouveautés, promos, meilleures ventes, sélection) démarre par une bannière vidéo/image plein écran avec accroche FR/EN. Tout éditable dans `/admin/settings` → « Accueil & videos » (upload vidéo/image, textes, ordre, durée). Vidéos de démo : Mixkit (libres de droits), posters Unsplash.
- **Identifiants admin** : contact@actoos.com (mot de passe dans test_credentials.md). Migration auto de l'ancien compte au démarrage.
- **Mot de passe oublié** : `/forgot-password` → e-mail (FR/EN) avec lien 1 h usage unique → `/reset-password?token=`. Table `password_reset_tokens` (hash SHA-256), anti-spam 2 min, pas d'énumération de comptes.
- **Avis clients** : table `reviews` (note 1-5, titre, texte, jusqu'à 4 photos via upload client, « achat vérifié » auto). Un avis par client et par produit (ré-envoi = mise à jour). Note moyenne + nombre sur cartes produits, fiche produit et section avis avec distribution. Modération admin `/admin/reviews` (masquer/supprimer).
- **Export CSV** : `/admin/export/orders.csv` (filtres statut/paiement) et `/admin/export/stock.csv` (une ligne par variante), boutons dans Commandes et Produits.

### Itération 4 (2026-06) — testée (iteration_4.json : backend 19/19, frontend 100 %)
- **Réponse aux avis** : réponse publique STRYKOS depuis `/admin/reviews` (publier/modifier/supprimer), affichée sous l'avis sur la fiche produit.
- **Vidéo produit au survol** : dans les grilles catalogue/accueil, les produits avec `video_url` lisent leur vidéo au survol (badge « Vidéo », poster = image). 2 produits de démo équipés.
- **Newsletter** : tables `newsletter_subscribers` (token de désabonnement) et `newsletter_campaigns`. Box d'inscription sur toutes les pages (au-dessus du footer), préférence dans le compte client (Profil), page `/newsletter/unsubscribe?token=` (lien dans chaque e-mail), e-mail de bienvenue FR/EN. Admin `/admin/newsletter` : abonnés (recherche, ajout, activer/désactiver, suppression, CSV) + campagnes (brouillon FR/EN, jusqu'à 6 produits mis en avant, bouton CTA, e-mail test vers contact@actoos.com, envoi en tâche de fond avec compteurs envoyés/échecs).
- **Performance** : cache localStorage stale-while-revalidate (`lib/cache.js`) pour settings, accueil, marques, listes et fiches produits ; utilisateur et favoris mis en cache pour un rendu instantané ; en-têtes `Cache-Control` publics côté API (le proxy preview les écrase, effectifs en production) ; bannière d'information stockage local (consentement mémorisé).
- Correctif agent de test : eager-load `Product.variants` dans `_campaign_products` (MissingGreenlet). Retry automatique sur 429 du proxy e-mail.

## Non implémenté / à activer (clairement désactivé)
- CinetPay / PawaPay : architecture providers présente, désactivés (non sélectionnables).
- URLs préfixées /fr /en (langue gérée par contexte + localStorage).
- Réservation de stock temporisée pendant le paiement (stock décrémenté à la confirmation, idempotent).
- RLS Supabase (accès uniquement via backend ; sécurité côté API).

## Backlog priorisé
- P1 : CinetPay + PawaPay (mobile money Mali), réservation stock temporisée, tri tenant compte du prix promo.
- P2 : URLs /fr /en, import CSV catalogue, partenaires locaux (commissions), double opt-in newsletter, segmentation campagnes (langue/pays).

## Données de test
- Commandes de test présentes en base (test@example.com, delivered@resend.dev) — à supprimer depuis le cockpit avant production.
- Identifiants : voir /app/memory/test_credentials.md.
