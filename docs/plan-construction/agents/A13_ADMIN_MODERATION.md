# A13 — Administration et modération

**Tâches de référence :** P023, P042, P053.

## Objectif

Fournir aux personnes habilitées une file de décision traçable, pour annonces, signalements et scènes.

## Cadre imposé

Tu exécutes uniquement la mission concrète attribuée par le coordinateur, avec ses fichiers et autorisations. Ce brief prépare un rôle ; il ne déclenche pas à lui seul tout le développement ni une mise en production. Si aucune tâche précise n’est fournie, préparer les contrats et les dépendances utiles, sans initialiser une application ou un service externe.

Lire d’abord [README](../README.md), [décisions](../09_DECISIONS_ET_SOURCES.md), [charte](../02_CHARTE_VISUELLE.md), [tokens](../specs/design-tokens.json) et [organisation de l’équipe](../10_EQUIPE_ET_DELEGATION.md). La version des contrats fournie avec la mission fait foi.

Règles communes : une police Inter, sept tailles 12/14/16/20/24/32/48 ; interface blanche/violette, G doré initial et P violet **validés et figés**, sélection de place dorée douce, filtre champagne très pâle. Ne pas modifier le logo. V1 gratuite, forfaits mensuels V2, pas de paiement à l’annonce ni du prix immobilier. Une annonce V1 porte sur **un seul parking/site**, éventuellement plusieurs places/niveaux. Prix total explicite. Inconnus conservés, état réel documenté. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; seules les unités autorisées `exact_opt_in` alimentent une projection de scène dédiée sans lien aux annonces `area`.

Maximum de cette session : coordinateur + trois spécialistes. Un seul écrivain par fichier. Toute modification de contrat, migration, token ou configuration partagée passe par A00 et le propriétaire. Aucune suppression globale, réinitialisation, installation de service, création de compte externe, message à un tiers ou déploiement public n’est autorisé par cette fiche de rôle. Respecter les autorisations explicites d’une mission ultérieure sans les redemander inutilement.

## Lectures propres à cette mission

- [01_PRODUIT_ET_PARCOURS.md](../01_PRODUIT_ET_PARCOURS.md)
- [03_ANNONCES_ET_QUALITE.md](../03_ANNONCES_ET_QUALITE.md)
- [04_CARTES_ET_3D.md](../04_CARTES_ET_3D.md)
- [05_ARCHITECTURE_DONNEES_API.md](../05_ARCHITECTURE_DONNEES_API.md)
- [06_COMPTES_SECURITE_MODERATION.md](../06_COMPTES_SECURITE_MODERATION.md)

## Périmètre du futur code

Ces chemins sont à créer lors de l’exécution autorisée ; ils ne désignent pas une application déjà construite. Le coordinateur affine la liste des fichiers avant de démarrer.

- `src/app/(admin)/**`
- `src/features/admin/**`
- `src/features/moderation/**`
- `src/app/api/v1/admin/** : handlers de décision réservés`

## Travail à réaliser

- Présenter une version et ses changements, preuves, risques et données privées au périmètre utile.
- Demander correction, approuver ou rejeter via les commandes transactionnelles A04.
- Traiter signalements avec motif, acteur, date et historique ; suspension explicite d’une publication existante.
- Revoir et activer une scène avec mapping complet, consentements exact_opt_in et projection dédiée sans liens area.

## Dépendances de départ

- Publication A04, Auth/habilitations A03, sources/observations A07/A09/A11.

## Livrables attendus

- Files de modération et rapports de décisions versionnés.
- Revue de modèle avec preuves et contrôles techniques.
- Procédure de retrait et restauration d’une version conforme.

## Critères de fin et vérification

- La décision vise la bonne révision ; une vieille décision échoue proprement.
- Aucun membre simple n’obtient les sources ou pouvoirs de l’admin.
- Annonce refusée et ancienne publication restent distinctes ; retrait d’une scène partagée ne détruit pas les autres biens.

## Limites propres au rôle

- Ne pas publier en contournant la commande métier ou la revue de sources.
- Ne pas appeler un paiement une validation de qualité ou de propriété.
- Ne pas explorer toutes les conversations sans dossier et habilitation.

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
