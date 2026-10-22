# Mission 14 — chargement de la carte à la demande

Le 22 octobre 2026, le constat de montage mobile sous un panneau masqué est corrigé dans `Explorer.tsx`. Cet addendum remplace la proposition de simple report formulée dans `performance-seo-resume.md` pour ce seul point.

Avant : `initialized` montait CityMap sur toute largeur, même en vue mobile Liste. Après : un effet client observe exactement la media query CSS `(max-width: 767px)` et demande le montage lorsque le panneau est visible — immédiatement sur desktop, au choix Carte sur mobile, ou lors d’un passage au breakpoint desktop. Le rendu serveur et le premier rendu client gardent la demande à faux ; ils ne consultent pas `window`. Le composant dynamique `ssr:false` n’est rendu qu’après cette demande.

La demande reste vraie après le premier montage. Les bascules Liste/Carte ne démontent donc pas la carte ; caméra et filtres gardent leur état existant. La restauration de caméra et une sélection `?listing=` suivent les chemins existants. Aucun rendu, token, asset, contrôle CityMap, filtre, URL ou comportement de navigation n’est modifié. Le SDK MapLibre installé dispose d’un `ResizeObserver` avec `trackResize:true` par défaut pour les changements de taille du conteneur.

Guide Next embarqué relu : `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, section « Importing Client Components » — un Client Component dynamique rendu sous condition est chargé lorsque cette condition est satisfaite.

Validation locale : cinq tests purs d’observation (`tests/map-demand.test.ts`) couvrent Liste mobile sans demande, Carte, desktop, franchissement du breakpoint et nettoyage d’un ancien observateur. Avec les deux tests existants de normalisation caméra, **7 tests ciblés passent**. `tsc --noEmit --incremental false` et le contrôle Prettier des quatre fichiers passent également. L’état permanent de demande dans Explorer évite tout démontage lors des bascules.

Les tests de source/lifecycle ne prouvent pas les requêtes réseau du bundle final. Le coordinateur conserve la baseline de l’ancien build et réalise le build puis la contrepreuve Network/CDP après intégration : aucun chargement du module/worker/style/tuiles MapLibre avant Carte sur mobile Liste ; chargement après demande et carte desktop visible. Aucun serveur, UI, build ou accès DB n’a été utilisé par cette mission.

## Correction visuelle mobile après contrepreuve

La capture `resume-captures/09-mobile-map-demand.png`, examinée après la contrepreuve réseau du coordinateur, montre un chevauchement réel : « Rechercher dans cette zone » à `top:76px` couvre « Me localiser » à `top:82px`. Le correctif est limité à `src/styles/maps.css` : à `max-width:767px`, le bouton de recherche passe à `top:132px`, sous la localisation, avec une largeur maximale laissant 16 px de chaque côté et retour à la ligne possible sur écran étroit. Les styles desktop, couleurs, libellés et actions restent ceux existants.

Contrôle de formatage CSS et Markdown effectué ; aucun test lourd, serveur ou build relancé. La vérification de la nouvelle géométrie à l’écran appartient au coordinateur, qui possède la recette UI.

## Contre-vérification finale du coordinateur

`map-demand-browser.json` consigne la baseline et le nouveau build : liste mobile stabilisée avec0canvas et0requête de style/worker ; chargement au clic Carte ; même backendNodeId de canvas après Liste↔Carte, aucune nouvelle requête de style ; desktop automatique. Cette observation ne revendique pas un audit de tous les bundles ni des Web Vitals. Le correctif CSS est finalement étendu à≤1023px, après chevauchement réellement reproduit à768px ; largeur intrinsèque bornée pour conserver un bouton lisible. Géométrie sans intersection aux390/768/1024/1440px. Capture11 finale,09 avant ce correctif. Le build final pcMqwObi9XdoC2NB2C0vG réussit. Serveurs fermés, runtime jetable supprimé, onglet fermé et viewport restauré.
