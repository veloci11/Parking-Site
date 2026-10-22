# Revue visuelle du 22 octobre 2026

**Statut : passed — rendu et interactions vérifiés dans le périmètre ci-dessous.** Ce verdict visuel ne clôt ni la recette CDN ni la mise en ligne publique.

Références fournies : `docs/plan-construction/assets/reference-ville.png` et `reference-parking.png`. Les deux comparaisons `docs/qa/resume-captures/comparison-city.png` et `comparison-parking.png` ont été assemblées pour inspection, puis regardées avec référence et site côte à côte. Les images du produit n’ont pas été retouchées. Les évolutions demandées après la maquette priment : logo GP doré/violet, or doux, Paris/Île-de-France, « Consulter l’annonce », contact et parking dans l’annonce, niveaux −1/−2 sans rotation360 et onglet Carte après Photos.

| Surface de fidélité | Constat |
| --- | --- |
| Structure et hiérarchie | En exploration, recherche au-dessus de la liste, carte dominante et fiche latérale. Le parking intérieur est dans l’annonce, conformément à la demande ultérieure ; les deux lots et leurs numéros restent lisibles. |
| Typographie | Inter et échelle de la charte conservées ; titre dominant, prix fort, informations secondaires plus discrètes. Aucun nouveau jeu de polices. |
| Couleurs et effets | Blanc, violet et champagne doux ; logo original conservé, filtres personnalisés, pas de sélection native bleue ni gros encadrement violet. Ombres et contours discrets. |
| Visuels et données | Vue urbaine réelle OpenFreeMap, bâtiments en volume et rendu intérieur fixe approuvé. La carte réelle comporte plus de libellés que l’illustration et les formes de Paris diffèrent de Lyon ; aucune promesse de reproduction pixel pour pixel. Le niveau −2 utilise son rendu propre, sans image générée sur des données inconnues. |
| Interactions et adaptation | Places et lots sélectionnables, prix/suivi cohérents, niveaux et modes exclusifs. Aucun rechargement lors du changement de lot ou de niveau. Aucun débordement de page observé aux largeurs listées ci-dessous. |

## Preuves navigateur

- Production locale, build `LiFv9DktYLtVHLZRc0FU9`. Captures03/07 : bureau1487×1058 ; les sources frontend correspondent au commit `0a89e7a`. Les outils opérateur ajoutés ensuite ne modifient pas cette interface.
- `resume-mobile-deposit.json` et captures01/02 : dépôt mobile complet390×844, cinq offres mixtes, trois images fictives, aperçu et envoi en modération. Cette première preuve garde son build d2c3266 ; elle n’est pas rebaptisée recette du dernier checkout.
- Dernier build : étape « Photos et description » reçoit réellement le focus au changement d’étape ; Échap ferme le menu mobile et replace le focus sur « Ouvrir le menu ». Capture08. La confirmation finale reçoit un focus par le code ; elle n’a pas été soumise de nouveau pour cette contre-vérification ciblée.
- Dernier build : adresse « Paris75012 » proposée puis choisie en secteur, sans longitude ; affichage Paris ·75012 · position approximative. Vérification directe après correction du résultat communal erroné75001.
- Sélection d’une place réservée dans la fixture publiée : « Voir toutes les offres » met le focus sur « Places, prix et dimensions » et fait défiler le tableau, sans réinitialisation qui reboucle sur la même place. Capture05 ; fixture retirée ensuite.
- Changement de lot12→13 puis niveau−2/place24 : `Performance.NavigationStart` reste840462.818449 dans les trois observations CDP ; pas de nouvelle navigation document. Le niveau et le numéro changent ensemble. Onglet Carte placé après Photos.
- Parking : viewport/document390/375,768/753,1024/1009,1440/1425px. Ces différences viennent de la barre verticale ; aucune largeur de document ne dépasse le viewport. Le tableau garde son défilement interne prévu.

## Limites

Les captures sont des exemples fictifs. Aucune correspondance géométrique avec un vrai parking ou vérification terrain n’est acquise. Zoom200%, lecteur d’écran complet et réseau lent restent distincts de ces contrôles ciblés. La qualité du rendu intérieur a été approuvée par le propriétaire ; les véhicules plus ordinaires et le test avec un vrai plan sont différés.

Un artefact de capture IAB/Retina a été isolé : l’émulation CDP ajoutée au viewport produisait un canevas vide ou un cadrage double. Retirer cette émulation puis utiliser seulement la capacité viewport et la capture native donne bien la carte visible, sans erreur console. Les essais incorrects ont été sortis du dossier de preuves. Cela ne constitue pas un correctif de CityMap.
