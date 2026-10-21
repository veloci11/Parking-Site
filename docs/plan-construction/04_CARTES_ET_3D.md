# 04 — Carte de ville, parking intérieur et fidélité

## 1. Deux systèmes reliés, deux sources de données

**Ville : MapLibre GL JS + OpenFreeMap.** Les données de voirie et volumes de bâtiments viennent de la cartographie publique. **Intérieur : modèle propre au parking**, construit à partir de plans et mesures, rendu avec Three.js via React Three Fiber. La carte publique ne renseigne pas les places privées en sous-sol.

OpenFreeMap annonce une instance publique gratuite, sans clé ni inscription, avec usage commercial autorisé. Attribution requise et absence de garantie SLA à prendre en compte. Ce sont les conditions consultées le 20 octobre 2026, pas une garantie de gratuité perpétuelle. [Présentation officielle](https://openfreemap.org/). La bibliothèque et les données gratuites ne rendent pas gratuits l’hébergement du site, les photos, les courriels ni le travail de modélisation.

L’aspect de la maquette est une direction visuelle : couleurs, volumes simples, perspective et repères peuvent être approchés. La présence et la précision des bâtiments dépendent des données locales. Ne pas promettre une ville photoréaliste identique à l’image générée. [Exemple de bâtiments extrudés](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/).

## 2. Parcours spatial

```text
Ville / quartier
  → regroupement d’annonces ou parking
    → panneau de résidence autorisé
      → niveau -1 / -2 / extérieur
        → place ou ensemble de places
          → annonce, photos, état et contact
```

Un parking sélectionné affiche les seules annonces publiques qu’on a le droit de présenter. Les autres places peuvent exister sous forme neutre de contexte, sans propriétaire, coordonnées ni statut commercial privé. Dans le manifest public, la liste spaces contient uniquement les unités publiquement autorisées ; le décor des autres places ne porte aucun UUID canonique ou liaison d’annonce, seulement des meshes de contexte assainis. « Pas proposé sur le site » ne veut dire ni vendu ni occupé.

V1 : une annonce `area` reste en secteur et ne publie ni scène intérieure partagée, ni identifiant canonique de parking/niveau/place permettant sa corrélation avec une annonce exacte. Elle conserve photos et plan assaini sans rattachement public exact. La scène partagée publique est réservée aux contextes `exact_opt_in` compatibles, avec projection dédiée excluant tout lien vers les annonces `area` ; les autres unités ne sont que contexte neutre sans identité publique. Aucun consentement d’un vendeur ne dévoile les données d’un autre. Le consentement est lié à chaque annonce/révision et non imposé globalement par le parking.

## 3. Ville : réalisation

- Charger le style et les tuiles OpenFreeMap dans un composant client isolé ; la liste et la fiche restent rendues sans carte.
- Afficher les bâtiments par extrusion aux zooms utiles, avec hauteur fournie ou estimation explicitement cartographique. Aucune hauteur estimée ne devient hauteur mesurée de l’annonce.
- Personnaliser couleurs claires, bâtiments lavande, eau bleue, repères champagne pâle/violet ; conserver labels et attribution lisibles.
- Fournir zoom, rotation, inclinaison, retour nord et bascule 2D. Commandes utilisables au clavier.
- Clustering aux faibles zooms. Un repère de parking avec plusieurs annonces affiche leur nombre ou un prix minimum explicitement « dès », jamais un prix total trompeur.
- Ne pas charger plus de 500 points individuels par réponse ; au-delà utiliser groupes calculés côté serveur. Une liste complète reste paginée séparément.
- Géocodage de l’adresse à la création, puis confirmation du point. Recherche villes en priorité dans un catalogue interne de communes, pas une requête de géocodage à chaque lettre. Fournisseur d’adresses interchangeable, conditions à valider avant sa sélection.
- Charger la carte seulement quand visible ; annuler les anciennes recherches, mettre en cache les réponses publiques sans session ni coordonnées privées.

Si le fournisseur est indisponible : état d’erreur dans la carte, liste intacte, bouton réessayer. Le fournisseur de tuiles est configurable pour migrer sans réécrire l’application.

## 4. Intérieur : niveaux de fidélité distincts

| Niveau | Données disponibles | Présentation autorisée |
|---|---|---|
| `photos_only` | Photos et description | Galerie et caractéristiques ; aucune fausse scène exacte |
| `schematic` | Organisation connue mais mesures insuffisantes | Plan indicatif, mention permanente « Schéma indicatif, non coté » |
| `measured` | Plan à l’échelle et mesures croisées | Modèle proportionné, périmètre et date des mesures visibles |
| `reviewed` | Géométrie et état comparés aux preuves et validés par l’opérateur | Mention limitée « Géométrie et état documentés au [date] » avec détail du contrôle |

Une scène n’obtient pas le niveau supérieur parce que le vendeur a coché une case. Le passage est décidé par le processus de revue. `reviewed` ne signifie pas expertise immobilière, absence de défaut ni conformité juridique/technique du bien.

## 5. Production d’un modèle

1. **Collecter** plans autorisés, numéros, dimensions, photos et état. Versionner les documents privés.
2. **Calibrer** au moins deux distances indépendantes sur le plan ; vérifier l’échelle, l’origine et les niveaux. Un plan ancien ne décrit pas forcément l’état actuel.
3. **Reconstruire** le sol, murs, poteaux, rampe, portes et limites des places. Commencer avec une géométrie paramétrique simple ; Blender sert aux détails nécessaires. Un seul modèle partagé par parking/niveau.
4. **Relier** chaque polygone/objet de sélection à son `space_id` stable. Les numéros affichés sont des labels distincts ; renuméroter ne change pas l’identité.
5. **Reproduire l’état** : matériau du sol, fissures/traces documentées, marquage, éclairage et zones d’ombre représentatifs. Pas de sol rénové fictif. Localiser les observations et leurs photos.
6. **Vérifier** la correspondance plan ↔ scène ↔ photo ↔ unité. Le vendeur relit le rapprochement ; un administrateur approuve la version publiée.
7. **Optimiser** : enlever objets cachés, limiter textures et polygones, compresser. Produire la vue 2D et un aperçu statique de repli.
8. **Publier atomiquement** modèle, manifest et correspondances de places. Garder la précédente version pour retour arrière.

La modélisation paramétrique est une assistance de production interne, pas un éditeur 3D obligatoire pour chaque annonceur en V1. Une automatisation à partir de PDF/scan ne dispense jamais de contrôler l’échelle et les numéros.

## 6. Convention technique

Le contrat complet est `specs/parking-level.schema.json`. Géométrie en mètres, décimaux ; coordonnées locales main droite, plan horizontal X/Z, Y vertical, origine choisie à un repère stable. Transformations glTF conformes à la scène de rendu. Les coordonnées GPS servent au site et sont stockées séparément.

Le manifest déclare : `schema_version`, `scene_version`, `parking_id`, `level_id`, unités, source d’échelle, précision connue, niveau de fidélité, dates de relevé/revue, fichiers, caméra initiale, volumes de clipping, géométrie de sélection et observations. Chaque place référence UUID et nom de mesh unique. Les références de titre/lot non destinées au public ne sont pas incluses dans le manifest.

Asset final : GLB glTF 2.0 pour l’affichage ; manifest JSON séparé pour relations et preuves publiques ; plan 2D JSON assaini, avec aperçu PNG/WebP, généré par le pipeline interne. Les SVG utilisateur ne sont jamais affichés directement. Le modèle peut être seulement paramétrique JSON pour les parkings simples : le contrat des unités et identifiants reste identique.

Les fichiers GLB sont locaux au stockage contrôlé, pas des URL quelconques fournies par le vendeur. Refuser les références externes, scripts, chemins hors dossier, géométries démesurées et textures surdimensionnées. Le téléchargement source privé reste distinct de l’asset public assaini.

## 7. Fidélité à l’état réel

Les défauts visibles sont des observations, pas seulement une texture esthétique. Chaque défaut a une localisation, une catégorie, une description, une date et des preuves. Des fissures peuvent être visibles sans diagnostic de gravité. Une humidité non relevée ne doit pas être classée « absente ».

Les halos violets/dorés de sélection restent fins et désactivables. Leur opacité ne doit pas cacher l’état du sol. Pas de filtre qui blanchit ou nettoie la place sélectionnée. Exposer « Afficher l’état réel » comme mode par défaut ; les annotations peuvent être masquées, les preuves restent dans la fiche.

Voitures de gabarit : option désactivée par défaut, mention « Illustration de gabarit, véhicule non inclus ». Un outil de compatibilité véhicule n’est pas V1 : la largeur d’une place ne suffit pas à garantir une manœuvre ou l’ouverture des portes.

## 8. Comportement interactif

Sélection d’une unité met en surbrillance son contour et ouvre l’annonce ; un lot surligne toutes ses unités. Clic d’une place sans annonce : « Place non proposée à la vente sur la plateforme ». Changement d’étage conserve le contexte du parking ; retour ville conserve les filtres. Une seule source d’état pour sélection dans liste/carte/plan.

Prix et disponibilité sont chargés depuis l’API après les droits, jamais figés dans le GLB. Le degré de documentation est affiché par unité : une scène géométrique mesurée ne prouve pas que l’état de toutes ses places est documenté. Le statut revu précise son périmètre d’unités/champs ; aucune unité sans preuves propres n’obtient une qualité documentée implicite. Vendu ou retiré pendant la visite : mise à jour du panneau et désactivation du contact, même si la géométrie est encore en cache. Liste HTML des unités pour lecteur d’écran, clavier et recherche interne.

## 9. Budgets de performance proposés

Objectifs à mesurer au développement, non résultats acquis : scène initiale GLB ≤ 8 Mo compressés par niveau, total après chargement différé ≤ 20 Mo, textures au plus 2 048 px sans raison documentée, ≤ 200 000 triangles visibles, ≤ 150 draw calls sur le pilote. Ajuster d’après appareils réels plutôt que dégrader la lisibilité ou retirer un obstacle important.

Charger un niveau à la fois, un seul canvas 3D lourd actif ; la mini-carte peut être un aperçu léger lorsque le plan est actif. Repli si WebGL manque, contexte perdu, mémoire faible ou réseau insuffisant : plan 2D + photos. Cibles de fluidité : 30 images/s sur mobile de référence, 50–60 sur ordinateur de référence, sans garantir tous les appareils.

## 10. Kit à demander pour chaque parking pilote

- Adresse et précision publique souhaitée ; attestation de droits de publication des documents/images.
- Plan de chaque niveau, échelle, orientation et repère d’origine ; deux distances de contrôle.
- Numéros des places, références de lot distinctes et annonce/ensemble auquel elles appartiennent.
- Longueur, largeur, hauteur aux points limitants ; murs/poteaux/portes/rampes/allées.
- Photos propres à chaque place, accès, manœuvre et état ; date du relevé.
- Liste des défauts et informations non connues, sans inventer une réponse.
- Relecture du vendeur puis validation administrative ; statut de fidélité final.

## 11. Entretien

Les photos/observations peuvent être actualisées sans changer l’identité physique des places. Un changement structurel impose une nouvelle scène et une nouvelle revue. Un signalement de mauvaise correspondance place/photo masque la scène concernée si nécessaire, sans effacer l’historique. Garder un journal des versions et pouvoir restaurer modèle + manifest + mapping ensemble.
