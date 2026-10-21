# A08 — Cartographie urbaine

**Tâches de référence :** P032.

## Objectif

Afficher une vraie carte de ville personnalisée et reliée au catalogue, avec un repli utile.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [02_CHARTE_VISUELLE.md](../02_CHARTE_VISUELLE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/map/**`
- `public/maps/** : styles approuvés`
- `tests/integration/map/**`

## Travail à réaliser

- Intégrer MapLibre et le fournisseur OpenFreeMap configurable avec attribution.
- Implémenter volumes de bâtiments, contrôles 2D/3D, clustering et recherche de zone.
- Synchroniser sélection et prix avec le DTO public ; ne jamais récupérer un point exact privé pour le cacher après.
- Pour area, conserver le secteur sans scène, IDs canoniques ou navigation vers le bâtiment réel ; exact_opt_in suit le contrat autorisé.

## Dépendances de départ

- Catalogue public et /catalog/map A04, état de sélection A05, tokens A01.

## Livrables attendus

- Composant carte avec API de sélection publiée.
- Style versionné et stratégie de chargement/annulation/cache.
- Repli en cas de tuiles, réseau ou WebGL indisponibles.

## Critères de fin et vérification

- Les résultats de la carte correspondent aux filtres de la liste.
- Attribution visible, navigation clavier et commandes utilisables.
- Aucune fuite d’adresse précise via pin, clustering, métadonnée ou sélection de bâtiment.

## Limites propres au rôle

- Ne pas promettre le rendu photoréaliste de la maquette pour toute adresse.
- Ne pas confondre hauteur cartographique d’un bâtiment et hauteur libre d’une place.
- Ne pas bloquer le catalogue si la carte ne charge pas.

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
