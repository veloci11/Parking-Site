# A05 — Front public et découverte

**Tâches de référence :** P030, P033.

## Objectif

Réaliser le parcours acheteur fidèle aux références, du catalogue à la fiche et au contact.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [02_CHARTE_VISUELLE.md](../02_CHARTE_VISUELLE.md)
- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/app/(public)/** : routes attribuées`
- `src/features/catalog/ui/**`
- `src/features/catalog/state/**`
- `src/features/favorites/**`
- `src/features/comparison/**`

## Travail à réaliser

- Assembler les primitives A01 pour liste, inspecteur, fiche, favoris et comparaison de trois annonces maximum.
- Partager sélection et filtres avec carte A08 et viewer A10 ; conserver état de retour et URL.
- Afficher prix total, nombre de places, inconnus, dates et état vendu/retiré sans message trompeur.
- Prévoir mobile, chargement, vide, erreur et repli sans WebGL ; appliquer les recommandations A14 sans réinventer les composants.

## Dépendances de départ

- Composants A01, DTO A02 et catalogue API A04 ; contrats d’intégration A08/A10/A12.

## Livrables attendus

- Pages publiques et navigation réellement reliées.
- État de recherche/sélection documenté et réutilisé.
- Captures de comparaison à largeur et état identiques.

## Critères de fin et vérification

- Garder dans l’en-tête un accès visible à Déposer, Connexion ou Mon compte selon la session : les maquettes ont précédé l’ouverture aux autres annonceurs.
- Pour les lots, afficher le min–max par place et un total séparé seulement si toutes les surfaces sont connues ; aucune surface moyenne présentée comme la taille de chaque unité.



- Fiche HTML utile sans la carte, contact cohérent avec l’état serveur.
- Retour conserve filtres et sélection ; comparaison de lots ne laisse pas croire à un prix unitaire.
- 390/768/1024/1440 px utilisables et aucune action seulement au survol.

## Limites propres au rôle

- Ne pas lire les sources privées ou ajouter des champs de localisation absents du DTO public.
- Ne pas simuler un contact envoyé ou une publication indisponible.
- Ne pas changer typo, couleurs, logo ou hiérarchie à sa convenance.

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
