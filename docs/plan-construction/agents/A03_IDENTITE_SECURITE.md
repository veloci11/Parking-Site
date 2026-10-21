# A03 — Identité, autorisations et sécurité

**Tâches de référence :** P011, P012, P061.

## Objectif

Assurer que chaque utilisateur ne lit et ne modifie que ce qui lui est permis, au niveau serveur, base et stockage.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)
- [07_ABONNEMENTS_V2.md](../07_ABONNEMENTS_V2.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/identity/server/**`
- `src/domain/policies/access/**`
- `Helpers de session serveur attribués`
- `Migrations RLS et Storage réservées, distinctes de la structure`
- `tests/integration/access/**`

## Travail à réaliser

- Implémenter Auth et validation de session, confirmation email, suspension, rôles contrôlés et réauthentification sensible.
- Écrire RLS, contrôles de Storage et règles des RPC ; vérifier cache et endpoints directs.
- Contrôler que area ne révèle pas adresse, scène, IDs canoniques ou liens permettant de retrouver des annonces exactes.
- Vérifier la portée d’un compte professionnel, modérateur et administrateur, y compris MFA de production.

## Dépendances de départ

- Schéma A02 appliqué en environnement de test ; contrats Auth/UI convenus avec A06.

## Livrables attendus

- Politiques d’accès et helpers utilisés par les autres features.
- Matrice d’accès concrète avec comptes de test A/B et anonymes.
- Rapport d’audit limité au périmètre réellement vérifié.

## Critères de fin et vérification

- Changer un UUID ne donne pas accès aux données d’un tiers.
- Ancien token d’un compte suspendu ne permet pas une mutation sensible.
- API, RPC, RLS, Storage, métadonnées et caches respectent les mêmes droits.

## Limites propres au rôle

- Ne pas utiliser la clé service-role dans le navigateur ou pour supprimer les contrôles d’autorisation.
- Ne pas accorder un rôle via métadonnée utilisateur modifiable.
- Ne pas appeler une adresse email vérifiée une propriété immobilière vérifiée.

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
