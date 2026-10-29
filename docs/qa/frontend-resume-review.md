# Revue frontend à la reprise — 22 octobre 2026

Revue de code ciblée après lecture de `docs/REPRISE.md`. Aucun navigateur, serveur, rendu, logo ou CSS mobile modifié. Les captures et recettes antérieures citées dans REPRISE restent des preuves historiques ; cette revue ne constitue pas une nouvelle recette visuelle.

## P2 corrigé — le bouton d’un lot pouvait ouvrir une place indisponible

`ParkingViewer.chooseLot` choisissait la première place du lot à l’étage courant, indépendamment de son statut, alors que le prix résumé du lot exclut les offres indisponibles. Exemple déterministe : place18 vendue au −1, place19 disponible au −2 et place20 disponible au −1 ; le bouton ouvrait18 au lieu de20. Sans place20, il ouvrait encore18 au lieu de19.

Le nouveau helper pur `preferredParkingLotUnit` (`src/lib/parking-lots.ts`) choisit une offre disponible, avec préférence pour l’étage courant, puis conserve un repli consultable sur les places inactives si aucune offre n’est disponible. Le choix reste limité aux unités réellement rattachées au parking canonique et au lot/annonce/transaction concernés. Les clics directs sur une place inactive restent permis ; aucune navigation ou gestion du contact n’a été changée.

Preuve : les cinq tests de `tests/parking-lot-selection.test.ts`, appliqués d’abord à l’algorithme initial extrait sans changement, donnaient trois échecs et deux succès. Après correction : cinq succès. Ils couvrent les deux priorités, le lot entièrement indisponible, la séparation annonce/transaction et l’exclusion d’une unité d’un autre parking.

## P2 transmis au coordinateur — « Voir toutes les offres » resélectionne la place

Dans `ListingDetail.tsx`, les deux boutons utilisent `setSelectedSpaceId(null)` (contact et encart prix). Pour une annonce dotée du viewer, ce changement relance l’effet de restauration de `ParkingViewer` dépendant de `props.selectedSpaceId` : il relit l’unité encore présente dans l’URL puis appelle `onListingSelect`, qui rétablit la sélection dans le détail. Le retour au résumé des offres est ainsi contredit par la restauration. Chemin source : `ListingDetail` boutons → `ParkingViewer.restore` / `restoredUnit` / `nextSelected` → `chooseParkingSpace`.

Correction proposée : distinguer le choix explicite « toutes les offres » de l’initialisation/restauration, ou faire de ces boutons une navigation interne vers le tableau des offres. Le coordinateur garde la main sur `ListingDetail.tsx` ; aucun changement de ce composant dans ce patch. Vérification navigateur à effectuer par le coordinateur.

## Exigences vérifiées dans le code

| Exigence | Preuve et portée |
| --- | --- |
| Numéro peint saisi, sans renumérotation inventée | `PaintedNumberField` lit/écrit `space.number`; nouveau numéro vide si inconnu; contrôle des doublons au même niveau dans `listing-wizard.tsx`. Les cibles de galerie, le récapitulatif et les photos publiques utilisent le même numéro et l’identifiant de place. |
| Plan correspondant au numéro | `RenderedParkingLevel` associe les unités du niveau courant au `number` exporté. Les exports et les peintures proviennent du même manifeste Blender (`render.py`). Les tests figent12/13 au −1 et24 au −2, dimensions, empreintes SHA256 et masques. Les vrais plans restent mesurés, sans rendu fictif ajouté. |
| Lots vente/location lisibles | `parkingListingGroups` sépare annonce+transaction, affiche « Lot à vendre » / « Lot à louer » et les numéros, avec teintes or/violet. Aucune référence A/B inventée. Prix résumé via `listingPrice` et prix sélectionné via l’offre de la place. |
| Clic sans rechargement | `persistSelection` emploie `history.replaceState`; `ListingDetail.chooseParkingSpace` modifie seulement les états de sélection. La clé du rendu dépend parking+niveau, pas de la place sélectionnée. |
| Offre et contact de la bonne annonce | Le panneau utilise `focusedListing` et `selectedSpace`. Une place d’une autre annonce affiche son vendeur et un lien explicite vers cette annonce ; `send` bloque l’envoi vers l’annonce initiale. Une offre inactive bloque la visite. |
| Niveaux animés | Animation de380ms sur le calque, déclenchée au changement de niveau, annulée au nettoyage et évitée avec `prefers-reduced-motion: reduce`. |
| Carte après Photos | Ordre source des boutons : Plan3D, Plan2D/Places, Photos, Carte. La carte reçoit une seule annonce du parking courant. |
| Demande3D facultative et suivi | `ModelRequest` est dans le wizard et la gestion des annonces. Texte de traitement manuel, panneau replié, pas de formulaire imbriqué. Statuts propriétaire et file admin intégrés ; PATCH avec version. « Préparation terminée » ne publie pas un modèle automatiquement. |

## Vérification locale du patch

`tsx --test tests/parking-lot-selection.test.ts tests/parking-render.test.ts tests/listing-offers-ui.test.ts tests/modeling-request-ui.test.ts` : **14/14 succès**.

`tsc --noEmit` : **succès**.

Points laissés à la recette du coordinateur : état DOM réel au clic, rendu desktop/mobile, conservation de la vue après rafraîchissement du groupe et second P2 ci-dessus. Aucun P1 établi par cette revue.
