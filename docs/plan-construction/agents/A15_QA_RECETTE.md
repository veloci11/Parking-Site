# A15 — QA et recette indépendante

**Tâches de référence :** P002, P060, P061, P064, P074.

## Objectif

Vérifier les résultats réels des tranches livrées et empêcher qu’une apparence réussie masque un parcours faux ou une fuite.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)
- [07_ABONNEMENTS_V2.md](../07_ABONNEMENTS_V2.md)
- [08_PLAN_DEV_RECETTE_EXPLOITATION.md](../08_PLAN_DEV_RECETTE_EXPLOITATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `tests/fixtures/**`
- `tests/e2e/**`
- `Tests d’intégration indépendants dans le périmètre réservé`
- `Rapports de recette et captures comparées`

## Travail à réaliser

- Préparer comptes et fixtures contradictoires, lots, champs inconnus, états et révisions.
- Exécuter tranche complète compte → brouillon → modération → catalogue → contact.
- Tester directement API/RLS/Storage, concurrence, retry, retrait/vendu, area et exact_opt_in.
- Comparer écran et référence à état identique ; V2 tester facturation seulement après mission dédiée et en environnement autorisé.

## Dépendances de départ

- Build et environnement disponibles ; contrat de la tranche défini ; preuves du pilote pour toute validation 3D réelle.

## Livrables attendus

- Tests pertinents, jeux de données et rapport reproductible.
- Verdict par critère : réussi, échoué, non testé, dépendance manquante.
- Liste d’écarts priorisée transmise aux propriétaires, puis contre-vérification ciblée.

## Critères de fin et vérification

- Ajouter les cas de lot à surfaces inconnues avec filtre actif, galerie partagée/couverture partielle, limites d’images distinctes et décisions concurrentes de visite.
- Vérifier que le vendeur accepte/refuse et qu’un participant annule via décision versionnée ; sans horaire confirmé le libellé reste « À organiser ».



- Les tests échouent bien devant la violation qu’ils prétendent couvrir.
- A/B/anonyme et appels directs réellement exécutés.
- Une capture ne vaut pas recette fonctionnelle ; une fixture ne vaut pas validation de parking réel.

## Limites propres au rôle

- Ne pas assouplir un test pour faire passer une régression sans décision motivée.
- Ne pas prétendre avoir testé production, paiement, email ou appareil absent.
- Ne pas réparer silencieusement les features d’autres agents ; transmettre les écarts.

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
