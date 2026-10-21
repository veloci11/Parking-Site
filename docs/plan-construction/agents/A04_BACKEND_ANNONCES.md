# A04 — Backend des annonces et du catalogue

**Tâches de référence :** P024, P031.

## Objectif

Faire fonctionner les brouillons, révisions, décisions de publication, recherches et disponibilités comme une seule chaîne transactionnelle.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [07_ABONNEMENTS_V2.md](../07_ABONNEMENTS_V2.md)
- [specs/listing-submission.schema.json](../specs/listing-submission.schema.json)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/listings/server/**`
- `src/features/catalog/server/**`
- `src/app/api/v1/listings/**`
- `src/app/api/v1/catalog/**`
- `Fonctions SQL métier dans migrations réservées par A00`

## Travail à réaliser

- Implémenter sauvegarde avec row_version, soumission, publication atomique et nouvelle révision sans écraser la version approuvée.
- Contrôler seller_id dérivé de session, un seul site par annonce V1, claims d’unités, médias approuvés et prix total.
- Interroger le moteur de droits A17 ; compter DISTINCT listing_id pour ne pas doubler une publication avec sa révision en attente.
- Implémenter filtres avant pagination, curseurs stables, prix total et projection de carte conforme à la confidentialité.

## Dépendances de départ

- Schéma et contrats A02 ; Auth A03 ; médias A07 ; droits gratuits A17.

## Livrables attendus

- Commandes métier et API conformes aux contrats.
- Fonctions transactionnelles, événements outbox et invalidation des projections.
- Jeux de réponses publics/privés et cas d’erreur stables.

## Critères de fin et vérification

- Pour un lot, surface publique = intervalle min–max par unité ; total distinct seulement si toutes les surfaces sont connues. Un filtre `areaMin` actif s’applique à chaque unité et exclut les inconnus.



- Rollback complet si publication échoue ; aucun claim ou quota orphelin.
- Double soumission, décision sur vieille version et ventes partielles contrôlées.
- Liste/carte/fiche/plan obtiennent les mêmes prix et états courants.

## Limites propres au rôle

- Ne pas exposer les tables privées puis masquer les champs dans l’UI.
- Ne pas recalculer un prix au prorata d’un lot vendu partiellement.
- Ne pas recopier localement les règles d’abonnement ou faire payer une annonce en V1.

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
