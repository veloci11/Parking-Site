# Registre partagé : interface et vues publiques

## Parcours d’un administrateur

`/admin/parkings` est protégé par le contrôle administrateur et MFA de l’espace compte. Le serveur garde l’autorité sur chaque action. Depuis une annonce à rapprocher, ouvrir `/admin/parkings?listingId=ID_ANNONCE` avant son approbation.

1. Choisir le parking existant ou créer un site distinct : nom public, référence interne et adresse privée. Les coordonnées restent facultatives, mais longitude et latitude se renseignent ensemble.
2. Référencer ses niveaux et places physiques. Les dimensions inconnues restent vides ; la référence privée de lot est séparée du numéro affichable.
3. Charger l’annonce et sa version courante, puis faire correspondre **toutes** ses unités à des places distinctes du même site et du bon niveau. Fournir un motif décrivant les pièces et repères vérifiés et confirmer cette relecture. Le serveur vérifie version, dimensions, cohérence de site et conflits ; un résultat `conflict` ne force pas de rapprochement.
4. Attribuer, si nécessaire, un accès `common_reference` à un compte actif. Cet accès ne donne pas les documents, photos privées, messages ou brouillons des autres vendeurs. Sa révocation est distincte du rattachement d’une annonce.
5. Revenir à la modération pour décider de la publication. L’écran de registre ne publie jamais lui-même une annonce.

Les conflits apparaissent dans le registre avec lien vers l’annonce concernée. La présence d’un conflit ne prouve pas la propriété d’une partie. Le traitement du dossier doit suivre les décisions serveur prévues ; aucun bouton de l’interface ne contourne ce conflit.

`/compte/parkings` présente seulement les références communes déjà autorisées au contributeur, en lecture seule.

## Parking public et modèles

`/parkings/[alias]` lit uniquement le DTO public de `/api/parkings/:alias`. Ses niveaux et places utilisent les alias fournis par cette projection. Les annonces de secteur ne sont ni ajoutées à cette page ni rapprochées côté navigateur. Le contrôle F16 reste une obligation de la projection SQL : deux vendeurs d’un même site, l’un en `area` et l’autre en `exact_opt_in`, ne doivent exposer aucun lien public vers l’annonce masquée. Les fichiers sources privés ne sont jamais chargés par cette page.

Le visiteur choisit un niveau, une place publique puis son annonce. Le prix d’un lot reste son prix total. Les photos et observations restent celles du bien sélectionné. Un modèle approuvé disponible peut être ouvert ; sinon la page propose la fiche et les photos, sans reconstruire une géométrie. Les modèles de plusieurs annonces ne sont pas fusionnés côté client : ils restent des vues distinctes tant qu’un modèle commun avec origine et correspondances approuvées n’est pas fourni par le serveur. Un seul canvas intérieur est monté à la fois.

La migration026 ajoute précisément ce plan commun explicite par niveau, servi dans `commonPlan`. Le viewer de fiche consomme le groupe de toutes les annonces exactes du même parking et utilise un seul repère approuvé ; il ne fusionne pas les anciens modèles individuels. Le contrat, les commandes administrateur et la démonstration fictive −1/−2 sont documentés dans [OPS_COMMON_PARKING_PLANS.md](OPS_COMMON_PARKING_PLANS.md).

La page recharge son DTO public lorsqu’elle est visible, toutes les 30 secondes, afin de retirer les offres devenues indisponibles. Le serveur doit toujours refuser un contact sur une annonce vendue, retirée ou expirée, même entre deux rafraîchissements. Les paramètres de niveau et d’unité publiques sont conservés dans l’URL. Le chargement initial de cette nouvelle page est côté client ; il ne constitue pas un rendu SSR complet du dossier du parking.

## Géolocalisation facultative

Le bouton « Me localiser » est la seule entrée vers `navigator.geolocation.getCurrentPosition` : aucune demande de permission n’est faite au chargement. La position brute n’est pas gardée, et le centre transmis à la carte est arrondi à trois décimales. Il n’existe ni suivi continu ni enregistrement serveur de la position par défaut.

Le mouvement issu de cette localisation est marqué transitoire : l’Explorer peut actualiser son centre de recherche en mémoire sans enregistrer la caméra dans `sessionStorage`. Déplacer ensuite volontairement la carte reprend la persistance habituelle de la caméra. Les tuiles de la carte sont chargées autour du centre choisi ; leur fournisseur reçoit donc les demandes cartographiques correspondantes après ce clic. La recherche d’annonces n’est jamais automatique : le visiteur doit cliquer sur « Rechercher dans cette zone » ou appliquer explicitement un rayon.

Les refus, indisponibilités et délais dépassés affichent une explication avec retour à la recherche manuelle. `Permissions-Policy` doit autoriser la géolocalisation pour `self` et le navigateur exige un contexte sûr (HTTPS, sauf développement local).

## État de validation

Les helpers de géolocalisation sont testés localement : bornes, suppression de précision brute et messages de repli. Les pages et DTO doivent ensuite être exercés après la migration019, avec fixtures transactionnelles ou comptes QA dédiés. Aucun site réel ni rapprochement de place humaine n’a été créé par ce module UI durant son développement. La recette visuelle et le contrôle des permissions navigateur restent à confirmer par le coordinateur.
