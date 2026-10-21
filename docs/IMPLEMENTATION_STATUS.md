# État d’implémentation et preuves

État au 21 octobre 2026. Le site dispose de deux prévisualisations locales : démonstration sur `http://127.0.0.1:3000` et application connectée à Supabase sur `http://127.0.0.1:3001`. **Aucun déploiement public n’a été effectué.** Le [plan de construction](plan-construction/README.md) reste le cahier des charges ; ce document décrit les preuves obtenues et les tâches encore ouvertes, sans déclaration de conformité complète.

## Périmètre réalisé et état de recette

| Domaine | Code présent | Vérification et limite |
|---|---|---|
| Charte et logo | Inter locale, sept tailles, interface blanche/violette et champagne, logo GP fourni conservé | Recette visuelle coordonnée séparément ; disponibilité de marque à valider |
| Catalogue public | Liste, filtres, prix total du lot, fiche canonique, favoris indisponibles, comparaison et curseur stable ; retour contextualisé et revalidation toutes les 30 secondes | Tests locaux et recette Supabase ; les résultats enregistrés ne valent pas mesure de charge en production |
| Ville 3D | MapLibre/OpenFreeMap, bâtiments extrudés, repères de prix, regroupements et repli | Dépend des données et des tuiles ; le visuel généré n’est pas une promesse de photoréalisme |
| Parking intérieur | Viewer R3F/Three, niveaux, sélection, photos, plan SVG 2D et liste alternative ; registre de scènes et sources privées, calibration, correspondance des places, revue distincte du créateur | Pipeline connecté testé avec un modèle paramétrique explicitement fictif. Aucun premier parking réel relevé et validé |
| Compte et dépôt | Authentification, préparation locale avant connexion, assistant, sauvegarde versionnée, conflits, dimensions inconnues, qualité commune et par place, dates/provenance déclaratives, occupation et charges ; vente partielle guidée sans prorata | Parcours HTTP locaux et connectés réussis ; confirmation/récupération par email réel non testées |
| Backend local | SQLite persistant, scrypt, sessions opaques hashées, contrôles d’origine/propriété | Démonstration sur loopback uniquement ; ne constitue pas le backend d’une ouverture publique |
| Backend Supabase | Auth/SSR, PostgreSQL, Storage, RLS et RPC | Migrations 001 à 009 appliquées au projet de recette connecté ; appels directs REST/RPC et identités distinctes exercés |
| Publication et modération | Brouillons privés, attestation, révisions gelées, publication atomique, décisions versionnées et suspension motivée d’une publication existante | Ancienne publication conservée jusqu’à approbation ; conflits et accès tiers testés |
| Galeries et médias | Galerie générale de 3 à 20 photos, jusqu’à 6 par place, union de 120 médias distincts ; variantes WebP 480/960/1920 via route autorisée et retrait des EXIF ; composant SafePhoto | Association partagée et isolation entre annonces testées ; clés publiques des places remplacées par des alias. Les illustrations restent fictives |
| Messages et visites | Participants, messages idempotents, lecture, demandes et décisions versionnées ; blocage réversible et historique conservé | Une acceptation sans horaire reste « À organiser » ; aucun email réel envoyé |
| Notifications et signalements | Boîte interne persistante, non-lus, préférences email, traitement des signalements et worker d’outbox | Boîte interne et décisions testées ; worker SMTP en prévisualisation uniquement, livraison extérieure non exercée |
| MFA | Enrôlement TOTP, vérification AAL2, suppression avec réauthentification, interface de sécurité | Cycle réel testé puis facteur QA révoqué. **Obligation globale MFA administrateur désactivée** ; le compte opérateur n’est pas déclaré enrôlé |
| CI | Workflow Node 24 : installation verrouillée, TypeScript, tests, build, parcours HTTP isolé | Workflow livré ; son exécution sur GitHub et le statut de publication de la branche doivent être constatés séparément |
| Exploitation | Procédures d’environnement, sauvegarde, restauration, supervision et incidents ; outil de sauvegarde base + objets, vérification de hashes et préparation de restauration isolée | Aucune restauration complète PostgreSQL + Storage ni exploitation publique réussie revendiquée |
| V2 | Abonnements mensuels prévus au plan | Différés ; aucun forfait facturé, paiement par annonce ou paiement immobilier activé |

## Preuves de recette enregistrées

| Preuve | Résultat | Périmètre et limites |
|---|---|---|
| [Intégration Supabase](qa/supabase-integration.json) | **128/128 assertions réussies** | Connexion GoTrue et session, isolation vendeur/tiers, brouillons, versions, attestation, modération, publication, médias privés/publics, EXIF, prix/surfaces, confidentialité, favoris, messages, visites et retrait. Appels directs REST/RPC compris |
| [Fonctions de compte](qa/account-features.json) | **74/74 assertions réussies** | TOTP réel sur identité QA, galeries par place, aliases publics, notifications/non-lus/préférences, signalements et conflits. Aucun changement de politique MFA globale ni email extérieur |
| [Scènes connectées](qa/scenes-integration.json) | **88/88 assertions réussies**, puis retrait/nettoyage | Sources PDF/PNG privées, RLS, préparation/calibration, interdiction d’auto-approbation, revue, sélection publique, aliases, filtre avant pagination et invalidation d’une scène après modification de correspondance/localisation. Fixture fictive retirée et nettoyée après QA visuelle ; pas de validation terrain |
| Suite unitaire locale | **40 tests réussis** | Dernière passe communiquée par le coordinateur ; tests de variantes, sauvegarde, préparation et nouveaux droits compris. Distincte des parcours HTTP et de la recette distante |
| [Compléments V1 Supabase](qa/supabase-v1-complements.json) | **Assertions SQL 008/009 réussies** | Fonctions/RLS exécutées sur PostgreSQL réel sous rôles/claims de test, transactions annulées ; ne remplace pas l’authentification HTTP GoTrue |
| `tests/account-flow.test.ts` | **2 parcours HTTP locaux réussis** | Serveur isolé, cookies, comptes de test, dépôt, médias, publication, messages/visites et contrôles d’accès ; distinct des essais Supabase |
| `tests/catalog.test.ts` | **7/7 réussis après correction** | Un premier passage à 6/7 a révélé une projection publique trop permissive ; remplacement par une liste explicite de champs autorisés. Historique conservé, sans assimiler ce test SQLite à une policy distante |
| [Redirections Auth](qa/auth-redirects.json) | Origine et callback observés | Jeton volontairement invalide ; aucune preuve de livraison ou d’utilisation d’un email de confirmation/récupération |
| [Audit des dépendances de production](qa/dependency-audit.json) | **0 vulnérabilité connue signalée** dans le rapport | Un audit de dépendances n’est pas une certification de sécurité applicative |

Les tests connectés utilisent quatre identités de recette créées et confirmées par le coordinateur, sans expédition d’email. Les rapports publics ne contiennent ni mots de passe ni secret TOTP. Les identifiants de nettoyage sont conservés hors Git. Le nettoyage Supabase a été confirmé par le coordinateur : **0 utilisateur QA, 0 annonce QA et 0 fichier QA restant** dans les périmètres inventoriés. Les identités et données humaines n’étaient pas ciblées. Les fixtures locales de démonstration restent fictives et séparées.

Les refus des paramètres `NULL` dans les RPC de modération et de décision de visite ainsi que l’interdiction d’appeler directement `gp_limit` comme visiteur ou membre ont été exercés sur Supabase. Cette preuve ciblée complète la relecture SQL, sans remplacer un audit exhaustif de tous les accès et de toutes les configurations.

La recette visuelle est ciblée : elle ne constitue pas une validation lecteur d’écran, zoom 200 % ou performances terrain. L’absence de scène pour une annonce ou un mode catalogue sans 3D n’est pas, à elle seule, un échec du catalogue ; le repli liste/photos reste un parcours prévu.

## Migrations appliquées au projet de recette

Les dix migrations suivantes ont été appliquées par le coordinateur. Elles ne sont pas une preuve d’un déploiement public et ne doivent pas être réappliquées aveuglément.

| Repère | Fichier dans `supabase/migrations/` | Objet |
|---|---|---|
| 001 | `202610210001_v1.sql` | Schéma V1, publication, RLS et RPC |
| 002 | `202610210002_function_grants.sql` | Privilèges explicites des fonctions |
| 003 | `202610210003_scenes.sql` | Sources privées, modèles, calibration, correspondances et revue des scènes |
| 004 | `20261021164715_notifications_inbox_reports.sql` | Notifications, lecture, outbox, signalements et politique MFA |
| 005 | `20261021170236_unit_photo_galleries.sql` | Galeries par place, limites et projection publique |
| 006 | `20261021171040_stable_catalog_cursor.sql` | Curseur stable du catalogue |
| 007 | `20261021172000_scene_source_cleanup.sql` | Nettoyage borné des sources de scènes |
| 008 | `20261021172918_publication_suspension_unit_quality.sql` | Suspension de publication, état par place et provenance déclarée |
| 009 | `20261021173420_private_conversation_blocks.sql` | Blocage privé des échanges |

| 010 | `20261021174334_interlocutor_block_scope.sql` | Blocage de l’interlocuteur dans tous les fils et nouvelles prises de contact |

## Tâches du plan restant à terminer ou à valider

| Référence du backlog | Travail restant |
|---|---|
| P003, P040, P022 | Fournir un parking pilote réel : plans autorisés, mesures croisées, photos datées, numéros et obstacles ; construire puis faire approuver sa scène en confrontant le rendu au terrain. La qualité d’un bien ne se déduit pas d’une illustration |
| P012, P052 | Tester confirmation/récupération Auth avec boîtes contrôlées ; configurer puis recetter la livraison SMTP, les reprises et les échecs. La boîte interne fonctionne, le transport email reste en prévisualisation |
| P060, P043 | Compléter la recette ciblée déjà effectuée : lecteur d’écran, zoom 200 %, parcours clavier/mouvement réduit et mesures terrain sur appareils cibles. Les captures et vérifications de pages ne prouvent pas l’ensemble de ces contrôles |
| P061 | Consolider la revue finale des accès/API/Storage et de la configuration réellement retenue. Enrôler les opérateurs et décider de l’activation obligatoire MFA avant ouverture, puis tester cette politique ; elle est actuellement désactivée |
| P062 | Compléter l’identité de l’opérateur et les textes légaux, vérifier nom/marque et droits sur photos/plans ; validation humaine adaptée requise |
| P063 | Exécuter une sauvegarde puis une restauration isolée PostgreSQL **et** Storage, mesurer les objectifs, configurer la supervision et attribuer les responsabilités opérationnelles |
| P064 | Terminer la recette sur l’environnement de lancement et décider de l’ouverture ; les fixtures Supabase de cette recette ont été nettoyées. Aucun site public déployé à ce stade |
| P070 à P074 | V2 différée : offre commerciale, abonnements mensuels, Checkout/portail, webhooks, réconciliation et cycle de vie des droits |

L’export, la désactivation et les demandes de suppression ne prouvent pas une purge de tous les historiques et sauvegardes. La conservation et les tâches de nettoyage doivent être exploitées selon la politique de l’opérateur.

Pour les commandes et procédures, suivre [OPERATIONS.md](OPERATIONS.md) et [OPS_BACKUP.md](OPS_BACKUP.md). Les compléments de la revue V1 sont suivis dans [V1_GAP_REVIEW.md](V1_GAP_REVIEW.md). Le coordinateur conserve les preuves de navigateur et les résultats finaux des contrôles de livraison ; aucune mention ci-dessus ne signifie « production vérifiée » ou « conformité complète ».
