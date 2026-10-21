# A02 — Architecture, données et contrats

**Tâches de référence :** P011.

## Objectif

Mettre en place le modèle relationnel et les contrats qui empêchent les erreurs de prix, de place, de révision et de confidentialité.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [specs/listing-submission.schema.json](../specs/listing-submission.schema.json)
- [specs/parking-level.schema.json](../specs/parking-level.schema.json)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `supabase/migrations/** : seuls fichiers de structure réservés pour cette mission`
- `src/domain/types/**`
- `src/domain/schemas/** : contrats communs réservés`
- `Types générés de base et fixtures structurelles`

## Travail à réaliser

- Définir les tables, FK, uniques, index et types monétaires/géométriques selon les contrats verrouillés.
- Distinguer annonce, révision, site unique, niveau, place, observations et projection publique.
- Réserver et documenter les migrations sans modifier les politiques détenues par A03 ni les RPC métier détenues par A04.
- Définir la projection de scène distincte, sans liens ni IDs canoniques publics pour les annonces area en V1.

## Dépendances de départ

- Structure Next et outils de migration disponibles ; décisions et DTO figés par A00.

## Livrables attendus

- Migrations additives relues, dictionnaire et types générés.
- Fixtures avec single, bundle même site sur plusieurs niveaux, champs inconnus et états concurrents.
- Note de migration/retour arrière et contrats des consommateurs.

## Critères de fin et vérification

- FK et unicités empêchent incohérences et doublons.
- Aucune annonce V1 ne couvre plusieurs sites ; le prix total et les unités sont cohérents.
- La projection publique ne transporte aucun champ privé ; les accès sont revus avec A03.

## Limites propres au rôle

- Ne pas appliquer de migration en production sans mission qui l’autorise.
- Ne pas figer un prix, un droit ou une disponibilité dans un GLB ou du code UI.
- Ne pas renommer un contrat commun sans arbitrage et migration des consommateurs.

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
