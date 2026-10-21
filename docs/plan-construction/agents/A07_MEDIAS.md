# A07 — Médias et documents

**Tâches de référence :** P021.

## Objectif

Transformer les fichiers vendeurs en ressources maîtrisées sans diffuser les sources privées ou les métadonnées sensibles.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/features/media/**`
- `src/app/api/v1/uploads/**`
- `workers/media/**`
- `tests/integration/media/**`

## Travail à réaliser

- Créer intents de dépôt courts, contrôle du propriétaire et du dossier, quotas de type/taille/volume.
- Vérifier contenu réel, décoder/réencoder les images, retirer EXIF et produire variantes.
- Garder plans et originaux privés ; promouvoir seulement les versions approuvées et assainies.
- Gérer déduplication, reprise de traitement, échecs et objets orphelins avec les jobs A16.

## Dépendances de départ

- Schéma A02, accès Storage A03 et contrat de publication A04.

## Livrables attendus

- Pipeline privé → traité → approuvé → public.
- Variantes et métadonnées de provenance reliées à l’annonce/place.
- Procédure de retrait des sources, dérivés et caches.

## Critères de fin et vérification

- Appliquer les bornes V1 : 20 images de galerie annonce, 6 de galerie propre par place et 120 images au total par annonce. Utiliser `media_space_links` pour les images couvrant un groupe de places.
- Une unité sans preuve propre conserve une couverture explicitement partielle ; une galerie commune ne permet pas de présenter toutes les unités comme pleinement documentées.



- Faux MIME, fichier trop grand, EXIF GPS, mauvais propriétaire et retry contrôlés.
- Un document privé ne devient jamais un lien public de secours.
- Un retrait de bien ne supprime pas les ressources partagées d’un autre vendeur.

## Limites propres au rôle

- Ne pas embellir une photo par génération IA ni supprimer un défaut.
- Ne pas télécharger une URL arbitraire d’un vendeur ni afficher son SVG brut.
- Ne pas considérer le succès de l’upload comme une approbation de publication.

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
