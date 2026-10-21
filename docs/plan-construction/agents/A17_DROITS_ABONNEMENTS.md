# A17 — Droits gratuits puis abonnements mensuels

**Tâches de référence :** P013, P071, P072, P073, P074.

## Objectif

Centraliser les droits de publication gratuits dès la V1 et préparer une V2 d’abonnements sans recoder les comptes.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)
- [07_ABONNEMENTS_V2.md](../07_ABONNEMENTS_V2.md)
- [08_PLAN_DEV_RECETTE_EXPLOITATION.md](../08_PLAN_DEV_RECETTE_EXPLOITATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/domain/policies/entitlements/**`
- `src/features/billing/** pour mission V2 seulement`
- `src/app/api/v1/billing/** pour mission V2 seulement`
- `src/app/(account)/compte/abonnement/** pour mission V2 seulement`
- `Workers de réconciliation et tests billing réservés`

## Travail à réaliser

- V1 : implémenter getEffectiveEntitlements et limites transactionnelles du profil gratuit, sans appel Stripe.
- Compter DISTINCT listing_id pour les publications et révisions en attente, sans double consommation du même bien.
- V2 autorisée : Checkout subscription, portail, webhooks signés, état canonique et réconciliation idempotente.
- Traiter renouvellement, résiliation, tolérance, dépassement et anciens comptes sans suppression ni prélèvement automatique.

## Dépendances de départ

- Droits d’accès A03 ; schéma A02 ; commandes A04 ; offre commerciale humaine validée avant V2.

## Livrables attendus

- Contrat unique des droits consommé par publication et UI.
- V1 gratuite testée ; configuration de facturation inactive.
- V2 seulement : intégration de test, politique de statut, recette complète et plan de transition.

## Critères de fin et vérification

- Éditions/révisions ne doublent pas le quota ; concurrence ne le dépasse pas.
- Paiement non confirmé n’accorde aucun droit ; compte suspendu reste bloqué même payé.
- Doublons et événements hors ordre n’accordent pas deux périodes ni ne doublent une notification.

## Limites propres au rôle

- Ne pas facturer par annonce ni encaisser le prix immobilier.
- Ne pas considérer 5 €/mois, quotas ou périodes de grâce comme commercialement approuvés.
- Ne pas activer Stripe, créer des secrets réels ou prélever des membres pendant la V1.

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
