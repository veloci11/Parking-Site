# Recette visuelle et interactive

Références conservées : `docs/plan-construction/assets/reference-ville.png` et `reference-parking.png`. Comparaison visuelle effectuée entre la référence parking et la capture d’application dans le même appel d’inspection ; contrôles navigateur sur les pages réellement rendues, pas sur une capture intégrée en fond.

## Constat

Interface blanche, violet #6D28FF, filtre champagne #F3ECD9, sélection dorée #C9A558 et contour violet. Inter locale effectivement chargée. Échelle CSS vérifiée : 12/14/16/20/24/32/48 px. Le logo original sélectionné est conservé octet pour octet ; seul son affichage est dimensionné dans l’en-tête.

La grille reprend liste à gauche, carte/parking au centre et aperçu à droite sur grand écran. Le dépôt et le compte ont été ajoutés pour les vrais parcours de marketplace. La navigation remplace le bouton purement illustratif de contact par des actions compte/dépôt. Six exemples permettent d’éprouver lots, données inconnues et filtres.

La ville est une vraie carte vectorielle avec bâtiments extrudés. Les données et étiquettes diffèrent nécessairement de la ville générée de la référence. Le parking de démonstration est une géométrie interactive schématique : il n’atteint pas le photoréalisme du visuel généré. Le viewer métrique connecté a été affiché avec une fixture explicitement fictive, puis cette fixture a été retirée. Aucune géométrie ou qualité d’un vrai bien n’a été inventée pour remplir l’interface.

## Contrôles réalisés

- 1440×1000 : sélection sur carte, aperçu, passage parking, retour ville, photos et commandes. Dimensions CSS observées dans le DOM, pas seulement taille demandée au navigateur.
- 1024 et 768 px : absence de débordement horizontal ; le parking utilise le panneau disponible et la fiche complète reste accessible sans recouvrir le modèle.
- 390×844 : recherche, liste, comparaison de deux biens et accès à la table, bascule carte/plan, CTA compact et dépôt/état réel. Corps du document sans débordement horizontal ; la table comparative dispose de son propre défilement.
- Retour fiche → exploration : sélection et vue parking retrouvées, paramètres conservés ; position de liste stockée par session.
- Clavier : focus sur recherche, lien de retour et alternatives sémantiques ; focus visible de recherche corrigé. SVG métrique avec boutons de places et commandes Entrée/Espace/flèches.
- Carte indisponible : état de repli réellement observé lors du défaut de worker ; accès aux annonces conservé. Worker MapLibre servi depuis la même origine corrigé puis carte 3D revérifiée.
- Ouverture/fermeture du canvas métrique : absence de nouvelle erreur après remplacement des racines Html séparées par un overlay DOM React.

## Corrections de la revue

Chevauchement fil d’Ariane/tabs, hauteur de bulle, espace réservé à l’inspecteur, comparaison mobile inaccessible, bouton 3D mobile caché, carte MapLibre 6 sans worker, éclairage démo trop plat, variante de filtre, logo sous-dimensionné, retours de contexte et médias publics conservés dans le cache d’optimisation : corrigés dans le code intégré. Les photographies de vraies annonces utilisent les variantes de l’API avec autorisation revérifiée et cache privé/no-store.

## Preuves et limites

Captures dans `docs/qa/` : `desktop-city.png`, `desktop-parking.png`, `mobile-explorer.png`, `mobile-parking.png`, `tablet-parking.png`, `desktop-wizard.png`, `mobile-wizard.png`, `connected-scene.png`.

Cette recette ciblée n’est pas un audit WCAG exhaustif, un essai lecteur d’écran complet, une mesure terrain Web Vitals, une validation de zoom navigateur 200 % ou une validation géométrique d’un parking réel. Les règles de réduction des mouvements, les replis et la sémantique sont présents ; leur présence ne vaut pas preuve de recette sur tous les appareils. Ces points restent des critères de lancement à vérifier sur l’environnement et les biens réels.
