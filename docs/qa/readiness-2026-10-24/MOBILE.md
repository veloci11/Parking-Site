# Recette acheteur mobile — 24 octobre 2026

## Portée

Recette dans un onglet navigateur indépendant, avec fenêtres CSS de 320 × 568,
375 × 667, 390 × 844 et 430 × 932. Il ne s'agit pas d'un test sur un iPhone physique.
Inspection de la version publique avant correction, puis validation locale sur
`http://127.0.0.1:3002` avec les annonces de démonstration isolées. Aucun bien réel
n'a été modifié et aucun message n'a été envoyé.

## Corrections

- À la première ouverture, la carte cadre les annonces réelles disponibles. Le
  centrage précédent ne concernait que deux anciens exemples : les vraies annonces
  de banlieue restaient hors du cadre initial très rapproché sur Paris.
  Le nouveau cadrage n'écrase ni une caméra enregistrée, ni une sélection, ni un
  déplacement manuel, ni une recherche de ville. Il ne se répète pas au rafraîchissement.
- Sur téléphone en mode carte, une recherche vide ou interrompue propose maintenant
  une action de reprise. Auparavant cet état se trouvait uniquement dans la liste masquée.
- La fermeture d'une erreur de favoris efface effectivement la notification, sans
  modifier les favoris confirmés ni masquer une nouvelle erreur ultérieure.
- Un stockage de session bloqué ne peut plus empêcher l'installation des contrôles
  périodiques de disponibilité d'une annonce.

## Vérifications

- Carte et liste à 320 px : largeur égale au viewport, aucun défilement global de la
  page ; barre de recherche stable à y=74, hauteur 44 px.
- Filtres à 320 px : panneau borné dans l'écran, fermeture et action de résultats accessibles.
- Favori anonyme sur la version publique : ajout puis retrait immédiats confirmés,
  valeur initiale restaurée. Aucun changement du compte utilisateur.
- Les prix apparaissent dès le premier chargement local sans caméra préexistante.
- Budget maximum de 1 € : état vide visible sur la carte ; « Élargir la recherche »
  restaure les annonces.
- Groupe de six annonces : sélection du groupe, ouverture du lot, puis lien vers
  l'annonce complète opérationnels.
- Panneau inférieur mesuré aux quatre dimensions : largeur bornée, pied prix/cœur/CTA
  au bas exact du viewport, contenu à défilement propre. Données dans
  `mobile-measurements.json`.
- Poignée « Agrandir l'aperçu » : panneau étendu à 668 px sur 390 × 844, pied toujours
  à y=844. Réduction disponible.
- Démonstration 3D : vue d'ensemble des niveaux visible ; sélection du niveau −2 et
  de sa place met à jour la sélection et l'URL sans navigation de page.
- 17 tests ciblés cartes/favoris réussis ; TypeScript et `git diff --check` réussis.

## Preuves et limites

- `mobile-preview-390.png` : panneau inférieur local, grand visuel et actions fixes.
- `mobile-empty-map-390.png` : retour explicite de recherche vide sur la carte.
- La publication de ces corrections et la recette finale publique restent du ressort
  du coordinateur de la livraison.
- Les vrais parkings n'ont pas encore de plans 3D ; la navigation 3D a donc été
  contrôlée sur les données de démonstration, pas sur une reconstitution réelle.
- La connexion, le dépôt vendeur, les emails et l'administration sont couverts par
  les autres membres de la recette ; ce rapport ne les certifie pas.
