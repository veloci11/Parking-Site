# Revue visuelle — état à la coupure

**Statut : blocked — pause explicitement demandée par le propriétaire avant la dernière recette mobile.**

La référence est la maquette claire fournie dans la conversation : ville3D, parking en perspective fixe, places interactives et panneau d’annonce. Les évolutions approuvées ensuite priment sur les anciens textes et couleurs de la maquette : logoGP doré/violet, or doux, « Consulter l’annonce », contact dans l’annonce, niveaux−1/−2 et absence de rotation360.

## Vérifié

- Le propriétaire a approuvé la qualité actuelle du rendu. Les rendus Blender sont conservés, sans génération supplémentaire.
- En production locale, la sélection12↔13 garde la même image montée et change le prix ; le niveau−2 sélectionne24. Les lots affichent numéros et nombre de places. Carte se trouve après Photos.
- La demande de modélisation et son suivi administrateur/propriétaire ont été parcourus dans IAB. Captures07–10 dans `docs/qa/listing-journey-captures/`.
- Le parking mobile390px est lisible (capture11). Le tableau des dimensions utilise son défilement horizontal interne ; le titre s’inscrit dans la colonne de350px après stabilisation du viewport (capture15).
- Un vrai défaut de largeur a été repéré dans le dépôt mobile (capture14 avant correction). La correction des pistes de grille est codée ; le build de production et Prettier passent.

## À terminer à la reprise

- Observer de nouveau le formulaire à390px après cette correction et remplacer la capture14 par une preuve finale distincte.
- Capturer le rendu final de bureau et la référence ensemble dans une comparaison visuelle, puis conclure la revue complète. La capture13 est transitoire au changement de viewport et ne prouve pas la lisibilité du tableau final.
- Ne pas déduire d’une preuve locale une validation d’un parking réel ou d’une version publiquement déployée.

Voir `docs/REPRISE.md`, `docs/qa/listing-journey-ui.json` et `docs/COMPLETION_MATRIX.md` pour les contrôles acquis et les limites.
