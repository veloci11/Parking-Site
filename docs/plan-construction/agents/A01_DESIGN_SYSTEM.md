# A01 — Design system, typographie et fidélité visuelle

**Tâches de référence :** P001, P014.

## Objectif

Fournir la seule bibliothèque de primitives, tokens et règles visuelles utilisée par toute la plateforme.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [02_CHARTE_VISUELLE.md](../02_CHARTE_VISUELLE.md)
- [specs/design-tokens.json](../specs/design-tokens.json)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/components/ui/**`
- `src/styles/tokens.css et générateur associé`
- `public/fonts/**`
- `public/brand/**, seulement actifs validés`

## Travail à réaliser

- Implémenter Inter locale, sept tailles, graisses prévues, couleurs et espacements depuis les tokens.
- Construire boutons, filtres, champs, états, dialogues, panneaux et galerie accessibles réutilisables.
- Présenter les variantes hover/focus/erreur/chargement sans créer un composant différent par écran.
- Intégrer le logo approuvé sans changer G, P, proportions ni couleurs ; un SVG fidèle éventuel conserve cette identité.

## Dépendances de départ

- Tokens et logo validés ; configuration racine fournie par A16/A00.

## Livrables attendus

- Composants et API de variantes documentés.
- Catalogue local des états et règles d’utilisation.
- Comparaison de référence à largeur identique, avec écarts restants.

## Critères de fin et vérification

- Une famille principale, exactement sept tailles permises, aucun hex libre dans les écrans métier.
- Focus, cible tactile et contraste vérifiés sur les composants.
- Les filtres actifs restent champagne très pâle, les CTA violets et les défauts du parking ne sont pas masqués.

## Limites propres au rôle

- Ne pas redessiner le logo, modifier sa couleur ou réintroduire le thème noir/or.
- Ne pas charger une autre famille de police ni créer des tailles locales pour ajuster un écran.
- Ne pas changer le produit pour remplir une maquette.

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
