# A14 — SEO et accessibilité

**Tâches de référence :** P060.

## Objectif

Rendre le catalogue compréhensible, accessible et indexable sans rendre publiques les pages ou données privées.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [02_CHARTE_VISUELLE.md](../02_CHARTE_VISUELLE.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)
- [08_PLAN_DEV_RECETTE_EXPLOITATION.md](../08_PLAN_DEV_RECETTE_EXPLOITATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/lib/seo/**`
- `src/features/accessibility/**`
- `tests/accessibility/**`
- `Propositions ciblées aux propriétaires des routes/composants ; pas d’édition concurrente`

## Travail à réaliser

- Définir titres, canonicals, sitemap utile, robots/noindex et contenu sémantique de la fiche.
- Vérifier clavier, focus, erreurs annoncées, lecteurs d’écran, zoom et réduction des mouvements.
- Assurer alternatives HTML à carte/3D et compréhension du prix/lot sans canvas.
- Relire contrastes, filtres, panneaux mobile et navigation ; transmettre corrections à A01/A05/A06/A10.

## Dépendances de départ

- Routes et composants intégrés ; contrats publics et états métier stabilisés.

## Livrables attendus

- Métadonnées et politiques d’indexation réutilisables.
- Rapport d’accessibilité avec reproductions, portée et limites.
- Cas de tests automatiques pertinents et liste de vérifications humaines.

## Critères de fin et vérification

- Compte, admin, brouillons et staging non indexés ; aucune fuite par données structurées.
- Parcours acheteur et dépôt utilisables sans souris, à 200% et avec erreurs.
- Sélection annoncée autrement que par la couleur ; photos et prix accessibles sans WebGL.

## Limites propres au rôle

- Ne pas indexer des filtres arbitraires ou inventer avis/étoiles/données structurées.
- Ne pas déclarer conformité globale sur la base d’un score automatique.
- Ne pas modifier la charte ou les routes d’un autre écrivain sans verrou.

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
