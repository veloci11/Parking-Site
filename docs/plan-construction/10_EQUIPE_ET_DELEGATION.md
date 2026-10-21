# 10 — Équipe d’agents spécialisés et plan de délégation

## 1. Organisation retenue

Préparer **18 rôles spécialisés**, coordinateur compris, plutôt que 30 rôles qui se recouvriraient. Chaque rôle a un brief prêt à transmettre dans [agents/](agents/README.md), un propriétaire de fichiers, des dépendances, un livrable et une recette. Un même rôle peut être réutilisé dans plusieurs missions courtes ; ce ne sont pas 18 conversations à ouvrir immédiatement.

**Limite de cette session : quatre agents simultanés au total, donc un coordinateur et trois spécialistes au maximum.** Les 18 rôles sont une organisation du travail à venir. Les effectifs peuvent être inférieurs lorsque les tâches dépendent les unes des autres. Aucun lancement de 30 agents en parallèle n’est promis.

Pour préparer le dossier, le coordinateur a effectivement délégué trois missions : organisation de l’équipe, revue de l’architecture et revue produit/recette. Ces travaux relisent le plan ; ils ne constituent pas le développement du site.

## 2. Règles communes à toutes les missions

Lire le [README](README.md), le [registre de décisions](09_DECISIONS_ET_SOURCES.md), la [charte](02_CHARTE_VISUELLE.md), les [tokens](specs/design-tokens.json) et le brief du rôle. Les références de ville et de parking sont des cibles visuelles ; leurs dimensions et biens sont fictifs.

- V1 gratuite ; les futurs forfaits sont mensuels en V2. Pas de paiement à l’annonce ni d’encaissement du prix immobilier.
- Interface claire, blanc/violet, GP avec G doré initial et P violet validés : forme et couleurs figées ; sélection de place dorée douce et filtres champagne très pâle. Ne pas modifier le logo ni la palette sans nouvelle demande humaine explicite.
- Une police **Inter**, sept tailles **12/14/16/20/24/32/48 px**, tokens et composants communs. Aucun spécialiste n’invente sa propre charte.
- Une annonce V1 peut couvrir plusieurs places et niveaux d’un seul parking/site ; le prix affiché est son prix total. Les ensembles multi-sites sont hors V1. La place physique et l’annonce restent des objets distincts.
- Pour les lots, les surfaces sont décrites par unité (min–max) ; un total distinct n’est affiché que si toutes sont connues. Un filtre `areaMin` actif s’applique à chaque unité et exclut les inconnus.
- Un état inconnu reste inconnu. Les scènes doivent refléter les sources et défauts réels ; pas de parking amélioré artificiellement ou de dimensions inférées comme certaines. Une unité sans preuve propre reste à couverture partielle, pas pleinement documentée/reviewed.
- Aucun prix, statut, rôle ou droit de publication n’est autorisé uniquement par le navigateur. Les accès publics et privés sont séparés jusqu’au stockage et aux assets 3D. En V1, les annonces `area` ne publient ni scène ni IDs canoniques ; les scènes partagées utilisent une projection dédiée réservée aux unités/annonces consenties `exact_opt_in`, sans lien aux annonces `area`.
- Ne modifier que le périmètre explicitement attribué. Préserver les modifications de l’utilisateur et des autres agents ; pas de reset, suppression globale ni `git add .`.
- Aucun compte externe, achat, abonnement, envoi à des tiers ou déploiement public n’est autorisé par un brief de planification. Une mission d’exécution ultérieure doit préciser ses autorisations ; ne pas les redemander lorsqu’elles existent déjà.

## 3. Les 18 rôles

| ID | Rôle | Responsabilité principale | Brief |
|---|---|---|---|
| A00 | Coordinateur / intégrateur | Arbitrage, contrats, répartition et intégration finale | [Mission](agents/A00_COORDINATEUR.md) |
| A01 | Design system et typographie | Tokens, composants, fidélité et logo d’interface | [Mission](agents/A01_DESIGN_SYSTEM.md) |
| A02 | Architecture, base et contrats | Schéma SQL, DTO, migrations, index et conventions | [Mission](agents/A02_DONNEES_CONTRATS.md) |
| A03 | Identité, autorisations et sécurité | Auth, RLS, Storage, rôles et contrôles d’accès | [Mission](agents/A03_IDENTITE_SECURITE.md) |
| A04 | Backend annonces et catalogue | Révisions, publication atomique, recherche et disponibilité | [Mission](agents/A04_BACKEND_ANNONCES.md) |
| A05 | Front public et découverte | Catalogue, fiche, favoris, comparaison et état de navigation | [Mission](agents/A05_FRONT_PUBLIC.md) |
| A06 | Compte et dépôt vendeur | Formulaires, brouillons, espace annonceur et interface Auth | [Mission](agents/A06_COMPTE_DEPOT.md) |
| A07 | Médias et documents | Upload privé, traitement, variantes, diffusion assainie | [Mission](agents/A07_MEDIAS.md) |
| A08 | Cartographie urbaine | MapLibre/OpenFreeMap, bâtiments et synchronisation carte/liste | [Mission](agents/A08_CARTE_VILLE.md) |
| A09 | Reconstruction des parkings 3D | Plans, mesures, géométrie, unités et modèles versionnés | [Mission](agents/A09_RECONSTRUCTION_3D.md) |
| A10 | Viewer intérieur et interactions 3D | Rendu, niveaux, sélection, repli et performance | [Mission](agents/A10_VIEWER_3D.md) |
| A11 | Qualité réelle et preuves | Grille d’état, provenance, observations et cohérence photo | [Mission](agents/A11_QUALITE_REELLE.md) |
| A12 | Messagerie, visites et notifications | Échanges privés, demandes et outbox | [Mission](agents/A12_MESSAGES_NOTIFICATIONS.md) |
| A13 | Administration et modération | Files, décisions versionnées, signalements et revue de scène | [Mission](agents/A13_ADMIN_MODERATION.md) |
| A14 | SEO et accessibilité | Indexation utile, contenu sémantique, clavier et alternatives | [Mission](agents/A14_SEO_ACCESSIBILITE.md) |
| A15 | QA et recette de bout en bout | Tests indépendants, preuves, régressions et verdict | [Mission](agents/A15_QA_RECETTE.md) |
| A16 | Fondations, DevOps et performance | Environnements, CI, jobs, supervision et restauration | [Mission](agents/A16_DEVOPS_PERFORMANCE.md) |
| A17 | Droits et abonnements | Moteur gratuit V1, quota en DISTINCT listing_id, puis forfaits récurrents V2 | [Mission](agents/A17_DROITS_ABONNEMENTS.md) |

Le juridique de l’opérateur, la disponibilité de marque, le tarif final et la validation des droits sur les plans restent des décisions humaines documentées. A00 rassemble les pièces et prépare les vérifications ; un agent ne s’attribue pas une certification juridique ou immobilière.

## 4. Autorité sur les fichiers et les contrats

Les chemins ci-dessous concernent le **futur code**. Ils ne signifient pas que l’application existe déjà. Une mission déclare ses fichiers exacts au départ ; les globes ci-dessous sont des frontières de responsabilité, pas une autorisation d’écrire tout le dépôt.

| Ressource partagée | Propriétaire / règle |
|---|---|
| Architecture, décisions, manifeste de versions, contrats communs et intégration | A00 arbitre ; A02 prépare les contrats techniques |
| `package.json`, lockfile, configuration Next/TypeScript, variables exemple | A16 prépare une proposition ; A00 intègre, un seul écrivain à la fois |
| Tokens, `src/styles/tokens.css`, primitives `src/components/ui/**` | A01 ; autres rôles demandent une évolution au lieu de copier |
| Tables, FK, index, types générés, migrations de structure | A02 ; numéros de migration réservés dans le registre central |
| Migrations RLS/Storage et helpers d’accès | A03, dans des fichiers de migration distincts réservés par A00 |
| Fonctions SQL métier publication/recherche | A04 les prépare ; A02 relit structure/index ; intégration sous verrou de migration |
| Routes publiques | A05 ; A08/A10 livrent leurs composants ; A14 propose les ajustements sémantiques via A05 |
| Routes compte | A06, sauf `/compte/messages/**` pour A12 et future `/compte/abonnement/**` pour A17 |
| Dossiers de production des scènes | A09, versions immuables ; A10 ne corrige pas une géométrie à la volée dans le viewer |
| Contrôle de publication d’une scène | A13 ; A09 fournit sources et revue, A03 vérifie la diffusion privée/publique |
| Moteur des droits gratuits et payants | A17 ; A03 contrôle identité et suspension, A04 appelle le contrat sans le recopier |
| Recette indépendante | A15 ; ne corrige pas les tests pour masquer une défaillance du produit |

**Contrats à figer avant travail parallèle :** DTO public d’annonce et de carte ; commande de soumission et schéma des erreurs ; manifest d’un niveau ; sélection commune `listingId/parkingId/levelId/spaceId` ; règles de révision et publication ; résultat du moteur de droits ; contrat d’événement/outbox.

Un changement de contrat est une proposition avec : problème, avant/après, impacts, migration, compatibilité et tests. A00 l’accepte puis avertit tous les consommateurs. Pas de renommage local d’un identifiant partagé ou d’ajout furtif d’un champ privé à une réponse publique.

## 5. Vagues de travail

Chaque ligne décrit une vague logique. Les spécialistes ne démarrent que lorsque leurs entrées sont disponibles. Les sous-étapes dépendantes restent séquentielles ; il n’est pas nécessaire de remplir les trois places à tout instant.

| Vague | Spécialistes possibles, trois au maximum | Condition et résultat |
|---|---|---|
| W0 — Cadrage | A01 design, A02 contrats, A09 collecte pilote | Tokens et interfaces figés ; liste des sources réelles manquantes |
| W1 — Socle | A16 fondations, puis A02 structure ; A15 fixtures indépendantes | Projet local, migrations réservées et jeux de test ; schéma appliqué avant politiques |
| W2 — Accès et fichiers | A03 Auth/RLS, A07 médias, A17 droits gratuits | Clients et contrats d’accès convenus ; mutations et stockage testés A/B |
| W3 — Offre vendeur | A04 backend, A06 dépôt, A11 qualité réelle | Contrats partagés ; brouillon, sources et révisions prêts pour revue |
| W4 — Publication | A13 modération, A15 recette transactionnelle, A09 modèle pilote | Backend stabilisé ; approbation/publication et correspondance des unités validées |
| W5 — Découverte et contact | A05 front public, A08 carte, A12 messagerie | Projection publique et accès établis ; catalogue et contact complet |
| W6 — Intérieur et sens | A10 viewer, A09 ajustements du modèle, A14 SEO/accessibilité | Viewer sur version immuable ; changements de modèle livrés en nouvelle version |
| W7 — Recette finale | A14 revue finale, A15 bout en bout, A16 staging/restauration | Toutes les tranches intégrées ; écarts visibles et fonctionnels résolus |
| W8 — Forfaits futurs | A17 V2, A03 revue d’accès, A15 recette facturation | Offre et conditions décidées ; Stripe en test, aucun tarif inventé |
| W9 — Livraison V2 | A16 livraison, A15 vérification, A00 coordination | Activation seulement dans le périmètre effectivement autorisé |

A00 est présent dans chaque vague et compte dans les quatre places. Il intègre et maintient les verrous. Ces rôles ne remplacent ni les plans réels du parking ni la validation de l’opérateur.

## 6. Attribution des 35 tâches existantes

| Backlog | Responsable | Relecteur / soutien |
|---|---|---|
| P001 références/tokens | A01 | A00 |
| P002 données de démonstration | A15 | A02, A11 |
| P003 collecte pilote | A09 | A11, propriétaire du parking |
| P010 application/environnements | A16 | A00 |
| P011 schéma et RLS | A02 structure ; A03 policies | A15, intégration séquentielle |
| P012 comptes et récupération | A03 serveur, A06 interface | A15 |
| P013 droits gratuits | A17 | A03, A04 |
| P014 composants | A01 | A14 |
| P020 dépôt | A06 | A04, A15 |
| P021 médias privés/publics | A07 | A03 |
| P022 qualité/provenance | A11 | A09, A06 |
| P023 modération/révisions | A13 | A04, A03 |
| P024 publication atomique | A04 | A02, A03, A15 |
| P030 fiche indexable | A05 | A14 |
| P031 recherche/pagination | A04 serveur, A05 interface | A15 |
| P032 carte ville | A08 | A05, A03 |
| P033 favoris/comparaison | A05 | A04, A15 |
| P040 modèle/manifest pilote | A09 | A11, A13 |
| P041 viewer/niveaux/sélection | A10 | A09, A05 |
| P042 revue des scènes | A13 | A09, A03 |
| P043 repli/performance 3D | A10 | A14, A16 |
| P050 messagerie | A12 | A03, A15 |
| P051 visites | A12 | A05, A15 |
| P052 notifications/outbox | A12 | A16 |
| P053 signalements | A13 | A12, A03 |
| P060 responsive/accessibilité | A14 | A01, A05, A06, A10, A15 |
| P061 audit des accès/fichiers | A03 | A15, relecture indépendante |
| P062 opérateur/marque/textes | A00 prépare | Validation humaine adaptée, A14 pour affichage |
| P063 sauvegarde/restauration | A16 | A15 |
| P064 staging/lancement V1 | A00 coordonne, A16 exécute si autorisé | A15 verdict |
| P070 validation de l’offre | A00 prépare avec A17 | Décision commerciale humaine |
| P071 Billing/Checkout/portail | A17 | A03 |
| P072 webhooks/réconciliation | A17 | A16, A15 |
| P073 droits/cycle de vie | A17 | A03, A04 |
| P074 anciens comptes/recette V2 | A17 | A15, A00 |

## 7. Une mission concrète à la fois

Le coordinateur transmet le brief du rôle accompagné du bloc suivant, rempli pour la tâche réelle :

```text
Mission : [ID de backlog, résultat observable]
Version des contrats/tokens : [références verrouillées]
Entrées disponibles : [API, fixtures, plans autorisés]
Périmètre exact d’écriture : [fichiers/dossiers attribués]
Fichiers réservés à d’autres agents : [liste]
Dépendances terminées : [preuves ou versions]
Critères de fin : [parcours et contrôles attendus]
Autorisations d’exécution : [local uniquement, staging explicite, etc.]
Rapport demandé : format commun de la section 9
```

Un agent ne reçoit pas « fais toute l’auth et le design comme tu veux ». Il reçoit une tâche et un contrat. Si une dépendance manque, il avance sur une partie indépendante ou une fixture explicitement fictive et le signale ; il ne prétend pas avoir intégré une API ou vérifié un parking inexistant.

## 8. Registre des verrous et intégration

A00 maintient un registre contenant rôle, tâche, fichiers exacts, contrat consommé, état, prochaine dépendance, référence du résultat et responsable de relecture. Le fichier est attribué à un seul écrivain à la fois. Deux agents peuvent lire et proposer, mais ne modifient pas simultanément le même contrat, migration, token ou route.

Après chaque mission : diff ciblé → contrôles adaptés → revue du contrat et des données → intégration centrale → recette de la tranche réelle. Une branche ou un worktree peut isoler une mission lorsque le contexte le justifie ; ce n’est pas une autorisation de déplacer, réinitialiser ou écraser le travail existant.

Les livraisons sont nommées précisément : spécification, code local, intégré, testé sur staging, déployé et vérifié. Le résultat d’une simulation ou d’un test local n’est pas présenté comme une preuve de production.

## 9. Rapport obligatoire des agents

```text
Rôle et tâche :
Résultat obtenu :
Fichiers modifiés :
Contrats consommés / proposés :
Contrôles exécutés et résultats :
Non testé / limites :
Dépendance ou décision encore attendue :
État exact : spécifié | local | intégré | staging vérifié | production vérifiée
Prochaine transmission : [rôle + entrée prête]
```

Un contrôle qui échoue reste visible. Pas de « tout est prêt » sans préciser quoi. A15 peut refuser une recette ; A00 réaffecte la correction au propriétaire de la feature, puis demande une nouvelle vérification ciblée.

## 10. Quand ajouter un rôle

Ajouter un spécialiste uniquement s’il a un livrable indépendant, une expertise utile et un périmètre sans recouvrement : par exemple scan terrain d’un gros parking, import volumineux de données réelles, localisation d’un nouveau pays ou expertise réglementaire qualifiée. Il reçoit le même type de brief et passe par les mêmes contrats.

Trente rôles restent possibles dans une organisation élargie, mais le nombre n’est pas un critère de qualité. Pour le périmètre V1/V2 présent, les 18 rôles couvrent les responsabilités ; la qualité dépend de leurs interfaces, des preuves et de l’intégration.
