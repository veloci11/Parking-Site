# A11 — Qualité réelle et preuves

**Tâches de référence :** P022.

## Objectif

Décrire l’état du parking et de chaque place de façon factuelle, datée et reliée aux preuves.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/quality/**`
- `Schémas métier de qualité réservés avec A02`
- `tests/unit/quality/**`
- `Dossiers de revue du pilote sans documents privés dans git`

## Travail à réaliser

- Construire les rubriques sol, murs, humidité, éclairage, marquage, manœuvres et accès.
- Distinguer état commun, état de la place, déclaration, photo, plan et mesure.
- Relier observation, date, provenance et médias ; exposer les inconnus sans score arbitraire.
- Fournir les champs réutilisables à A06 et la présentation des preuves à A05/A10 ; relire la fidélité avec A09.

## Dépendances de départ

- Contrats A02 et médias A07 ; sources du pilote A09 pour toute conclusion réelle.

## Livrables attendus

- Modèle d’observation et composants de saisie/lecture.
- Grille de revue et rapport de correspondance preuves/scène.
- Cas d’exemple déclarés, inconnus, datés et contradictoires.

## Critères de fin et vérification

- Une photo de groupe utilise `media_space_links`, sans affirmer une preuve propre sur chaque unité. Toute absence de preuve propre est une couverture partielle visible et interdit la qualité pleinement documentée/reviewed de cette unité.



- Inconnu n’est jamais converti en non ou zéro.
- Une photo commune ne prétend pas décrire toutes les places.
- La sélection dorée et l’éclairage de rendu ne cachent ni ne nettoient un défaut.

## Limites propres au rôle

- Ne pas produire de diagnostic structurel ou de garantie de sécurité à partir d’une photo.
- Ne pas calculer une note 9/10 ou un rendement non demandé.
- Ne pas transformer déclaration du vendeur en certification.

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
