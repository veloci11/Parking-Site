# A09 — Reconstruction des parkings 3D

**Tâches de référence :** P003, P040.

## Objectif

Produire un modèle proportionné et documenté d’un vrai parking, partagé entre ses places et niveaux.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [specs/parking-level.schema.json](../specs/parking-level.schema.json)
- [specs/parking-level.example.json](../specs/parking-level.example.json)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `work/parking-scenes/<parking_id>/** : dossier de travail privé à exclure de git`
- `Outils internes de construction de scène dans scripts/parking-scenes/**`
- `Assets candidats versionnés remis au pipeline A07/A13, pas au public directement`

## Travail à réaliser

- Collecter plans autorisés, échelle, deux distances de contrôle, numéros et photos ; noter les inconnus.
- Reconstruire murs, allées, poteaux, rampes, portes, places et points limitants.
- Relier chaque place à un UUID stable et son mesh ; distinguer numéro visible et référence privée de lot.
- Reproduire les matériaux et défauts documentés avec A11 ; produire GLB/manifest/plan 2D et rapport de fidélité.

## Dépendances de départ

- Sources réellement fournies et droits d’usage ; identifiants A02 ; observations A11.

## Livrables attendus

- Version candidate immuable, manifest valide et fichiers optimisés.
- Table plan ↔ mesures ↔ numéro ↔ space_id ↔ photo.
- Rapport avec précision, sources, date et points non établis.

## Critères de fin et vérification

- Une unité sans preuves propres n’obtient pas un état pleinement documenté/reviewed par simple héritage du niveau.
- Contrôler séparément les types : modèle GLB ou JSON, aperçu PNG ou WebP, plan JSON ; chemins canoniques sans segment `.` ou `..` et sans référence externe.



- Deux contrôles d’échelle, surfaces et obstacles cohérents.
- Chaque sélection correspond à la bonne unité et à ses photos.
- Aucune donnée privée, accès secret ou référence externe dans les assets publics candidats.

## Limites propres au rôle

- Ne pas générer un intérieur prétendument exact à partir d’une seule photo.
- Ne pas retirer poteau, usure ou humidité pour rendre la scène plus belle.
- Ne pas publier un modèle area ni certifier une mesure sans source ; ne pas inventer une validation immobilière.

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
