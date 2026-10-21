# A10 — Viewer intérieur et interactions 3D

**Tâches de référence :** P041, P043.

## Objectif

Rendre le modèle validé sélectionnable et utile pour l’acheteur, sans remplacer les preuves ni les accès serveur.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [02_CHARTE_VISUELLE.md](../02_CHARTE_VISUELLE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [specs/parking-level.schema.json](../specs/parking-level.schema.json)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/parking3d/**`
- `tests/integration/parking3d/**`
- `Adaptateur de sélection propre au viewer, sur contrat partagé`

## Travail à réaliser

- Charger une version de niveau assainie autorisée, gérer caméra, clipping, niveaux et sélection.
- Surligner une place ou les unités d’un lot, puis afficher l’annonce courante fournie par API.
- Afficher le statut de fidélité et les preuves/observations avec A11 ; laisser visible la texture réelle sous le voile doré.
- Prévoir contexte perdu, réseau faible, réduction des mouvements et repli plan 2D/photos/liste HTML.

## Dépendances de départ

- Manifest/asset A09, publication de scène A13, DTO public A04 et sélection A05.

## Livrables attendus

- Viewer relié au catalogue et au retour carte, pas une scène isolée.
- Liste HTML des unités et comportement clavier.
- Mesures de ressources et performances sur appareils de référence.

## Critères de fin et vérification

- Afficher une couverture documentaire partielle pour les unités sans preuves propres ; ne pas étendre abusivement le statut reviewed à l’ensemble des places.
- Consommer uniquement les assets autorisés par type et par chemin canonique : modèle GLB/JSON, aperçu PNG/WebP, plan JSON, aucun `.` ou `..`.



- Prix/disponibilité ne viennent pas du GLB ; vendu/retiré désactive le contact.
- Un lot surligne les bonnes unités, y compris niveaux distincts d’un même site.
- Pas de scène pour area en V1 ; pas de fuite via GLB ou URL ; un seul canvas lourd actif.

## Limites propres au rôle

- Ne pas modifier la géométrie dans le viewer pour masquer une erreur de modèle.
- Ne pas intégrer secrets ou prix commerciaux dans les assets.
- Ne pas appeler reviewed un modèle seulement agréable à regarder.

## Format du rapport de sortie

```text
Rôle / tâche :
Résultat obtenu :
Fichiers modifiés :
Contrats consommés / changements proposés :
Contrôles exécutés et résultats :
Non testé / limites :
Dépendance ou décision encore attendue :
État exact : spécifié | local | intégré | staging vérifié | production vérifiée
Transmission suivante : [rôle, livrable et version prêts]
```

Ne pas transformer une proposition, fixture ou capture en preuve de fonctionnement réel. Remonter une incertitude avec le travail indépendant déjà réalisé ; ne pas inventer une donnée pour débloquer une scène.
