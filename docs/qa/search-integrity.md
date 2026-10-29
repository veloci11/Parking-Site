# Mission 6 — intégrité de la recherche

Revue du 22 octobre 2026 sur `codex/build-parking-platform`. Périmètre : filtres vente/location, offres par place et lots, prix contextuels, tri, curseurs et concordance des résumés. Aucun build, serveur, navigateur ni requête de base de données exécuté par cette mission.

## Défaut reproduit puis corrigé

Une annonce par place réunissait cinq unités : vente disponible de 8 m², location réservée de 12 m², locations disponibles de 18 et 20 m², puis une location de surface inconnue. La recherche location entre 150 et 200 €/mois avec surface minimale de 16 m² retient correctement la seule unité de 18 m² à 190 €/mois.

Avant correction, `ListingCard` affichait pourtant : `190 € / mois / place`, `1 place correspondante`, puis `8–20 m² / place · 4/5 surfaces renseignées`. `ListingInspector` utilisait également toutes les unités pour sa surface. Les surfaces d'une vente, d'une location réservée et d'offres exclues par le budget étaient donc mêlées au résumé de l'offre trouvée.

`src/lib/search-offers.ts` sélectionne désormais les unités disponibles du mode recherché, puis les alias publics de `catalogMatch` lorsque ce contexte correspond au mode. Les deux composants utilisent cette sélection uniquement pour leur surface. En l'absence de contexte, ils utilisent les offres disponibles du mode demandé. Un lot indivisible conserve toutes ses places et son prix global. Aucun changement de palette, police, disposition, rendu de parking, donnée d'annonce ou texte approuvé.

Les fichiers des deux composants, initialement propres, ont été attribués explicitement à cette mission par le coordinateur avant édition. Les fichiers déjà modifiés par les autres missions n'ont pas été touchés.

## Preuves exécutées

1. Rouge, avant changement : `node_modules/.bin/tsx --test tests/search-integrity.test.ts` — 3 tests, 1 réussi, 2 échoués. Les échecs montraient la surface globale `8–20 m²` à la place des 18 m² recherchés et des 8 m² de l'unique vente disponible.
2. Vert, après changement : `node_modules/.bin/tsx --test tests/search-integrity.test.ts tests/search-client.test.ts tests/listing-offers-ui.test.ts` — **12 tests réussis, aucun échec ni test ignoré**.
3. `node_modules/.bin/prettier --check src/lib/search-offers.ts src/components/ListingCard.tsx src/components/ListingInspector.tsx tests/search-integrity.test.ts` — format valide.

Les trois nouveaux cas relient les couches réelles : URL partageable en euros → requête API en centimes → parseur de filtres → matcher d'offres → rendu React statique des deux composants ; vente/location et lot entier ; encodage/décodage de position de tri avec refus du même curseur lorsque le mode ou le budget change. Ils utilisent uniquement une annonce fictive en mémoire. L'import du parseur charge `node:sqlite` et produit son avertissement expérimental, mais aucune fonction `db()` n'est appelée par ces tests.

## Constat de la revue source

- `Explorer` propose un seul mode à la fois et efface les budgets lors du changement vente/location. `searchParams(..., true)` envoie toujours ce mode explicitement ; `parsePageQuery` refuse une valeur inconnue ou des paramètres de mode répétés.
- `catalogOfferMatch` croise statut disponible, mode, prix, surface, type, couverture, fermeture et niveau sur la même unité en mode par place. Le prix historique d'un lot est comparé intégralement au budget ; aucune division par le nombre de places.
- `localCatalogPage` applique les filtres avant le total et la limite ; prix, surface et nombre de places des clés de tri proviennent du même ensemble d'offres correspondantes. L'ID départage les égalités ; les surfaces inconnues passent après les surfaces connues pour le tri croissant. Le curseur inclut la date de publication limite et le hash canonique des filtres.
- La route connectée transmet ces filtres au RPC `gp_catalog_page_v2` et réencode sa position. La migration des offres par place remplace ses critères et métriques unitaires par `gp_catalog_offer_match` ; elle conserve le filtrage régional, la disponibilité des plans, la pagination et les contrôles existants.
- Les prix de la carte géographique et des cartes d'annonces utilisent le même `listingPrice(listing, transactionType)` et le contexte serveur `catalogMatch`.

## Limites

La pagination complète sur SQLite et le RPC PostgreSQL n'ont pas été rejoués dans cette mission : le coordinateur en conserve l'exécution, avec les recettes `tests/backend-pagination.test.ts`, `tests/backend-search-v2.test.ts`, `tests/per-space-offers.test.ts`, `tests/transactions.test.ts`, `supabase/tests/catalog-v2.sql`, `supabase/tests/catalog-cursor.sql` et `supabase/tests/per-space-offers.sql`. Les constats de tri SQL et de géolocalisation ci-dessus sont une revue des sources, pas une nouvelle preuve distante.

Le rendu statique vérifie les données textuelles effectivement rendues ; il ne prouve ni une interaction dans le navigateur, ni les marqueurs MapLibre, ni un déploiement public. Le build/typecheck global et l'intégration visuelle restent au coordinateur. Les abonnements V2 restent différés.
