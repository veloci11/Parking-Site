# A16 — Fondations, DevOps et performance

**Tâches de référence :** P010, P063, P064.

## Objectif

Fournir un environnement reproductible, observable et restaurable, avec des budgets de ressources vérifiés.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)
- [08_PLAN_DEV_RECETTE_EXPLOITATION.md](../08_PLAN_DEV_RECETTE_EXPLOITATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `Configurations racine et lockfile, sous verrou A00`
- `Configuration CI et scripts d’exploitation`
- `Infrastructure worker/planificateur, hors logique des jobs propriétaires`
- `src/lib/observability/**`
- `Procédures de sauvegarde et restauration`

## Travail à réaliser

- Initialiser le socle demandé avec versions compatibles verrouillées, environnements isolés et secrets hors git.
- Préparer CI, files de jobs, logs minimisés, alertes et déploiement staging si autorisé.
- Sauvegarder base ET objets/manifestes, tester restauration sur environnement isolé.
- Mesurer chargements, poids, egress et canvas lourds ; proposer corrections aux propriétaires plutôt que modifier les features à l’aveugle.

## Dépendances de départ

- Architecture et région/offre décidées ; autorisations de provisionnement explicites pour services externes.

## Livrables attendus

- Configuration reproductible, documentation des variables sans secrets.
- Plan de déploiement/rollback et preuve de restauration de test.
- Rapport de performance mesurée et coûts unitaires datés si fournisseurs choisis.

## Critères de fin et vérification

- Local/staging/production ne partagent ni données réelles ni secrets par erreur.
- Restauration retrouve annonce, photos et bonne scène, pas seulement les lignes SQL.
- Échec job/email/carte observable ; logs sans message privé ou token.

## Limites propres au rôle

- Ne pas créer de compte fournisseur, abonnement ou déploiement public sur la seule base de ce brief.
- Ne pas affaiblir TLS, RLS, MFA ou CSP pour faire passer une démo.
- Ne pas changer simultanément les fichiers racine avec un autre agent.

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
