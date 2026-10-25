# Revue comptes, échanges et exploitation — 24 octobre 2026

## Périmètre et statut

Revue du code local et corrections des parcours de connexion, messagerie et rendez-vous. Les fichiers font partie de la livraison coordonnée ; ce rapport ne prouve ni un déploiement ni une recette de messagerie entre vrais comptes. Aucune donnée de production modifiée, aucun email ou message réel envoyé. Les tests backend utilisent des bases SQLite temporaires supprimées et le test Supabase Auth un transport réseau isolé.

## Défauts corrigés

- **Destination après connexion** : le menu Messages passait `/compte/messages`, mais la liste des retours autorisés ne contenait pas cette route ; l’utilisateur arrivait sur Mon compte. Les destinations compte/admin existantes sont désormais admises explicitement. Les chemins inconnus, API et URLs externes restent refusés et les paramètres non autorisés sont retirés.
- **Contexte de la place** : le retour de connexion retirait `unit` et `floor`, pourtant présents dans le lien de contact d’une place. Les identifiants UUID, les alias publics de place liés à la même annonce (`listingUUID:unit:N`) et les niveaux bornés sont maintenant conservés. Le serveur et la page continuent de vérifier la sélection dans l’annonce. Le mode carte/liste autorisé est aussi conservé au retour vers l’exploration.
- **Réponses tardives** : les requêtes de blocage et de visite pouvaient mettre à jour une autre conversation après navigation, y compris A → B → A. Elles sont désormais bornées à la génération de la conversation ; succès, erreurs et fins de chargement périmés sont ignorés. Les requêtes d’historique et de rafraîchissement suivent la même règle ; le résultat d’un ancien rafraîchissement n’écrase plus le plus récent. Les formulaires de visite sont remis à zéro au changement de conversation.
- **Nouveaux échanges invisibles** : la liste des conversations était chargée uniquement à l’ouverture. Elle est actualisée toutes les dix secondes quand l’onglet est visible et lors du retour au premier plan. Les événements focus et visibilité ne lancent pas deux chargements simultanés. Les nouvelles conversations apparaissent sans rechargement ; le nombre de messages non lus s’affiche. Un résultat de liste commencé avant lecture ne rétablit pas un ancien badge non lu. Un résultat de liste antérieur au blocage ne remplace pas le résultat demandé après la décision.
- **Prix dans les CGU** : le texte affirmait que tout prix était le total de l’annonce. Il distingue désormais place, lot et loyer mensuel, conformément aux offres réellement prises en charge. Le statut de préparation juridique reste explicite.

## Vérifications réalisées

- Tests ciblés Auth, Auth connecté simulé, administration, messagerie, historique et confirmation de modération : **29 tests réussis**, zéro échec.
- Après ajout de la réconciliation des lectures : **3 tests de concurrence réussis**, dont le nouveau cas liste reçue après lecture et cas ultérieur de véritables nouveaux messages. Les deux autres tests de ce fichier faisaient déjà partie des 29 ci-dessus.
- TypeScript sans émission : réussi après les dernières modifications produit.
- Prettier appliqué aux fichiers modifiés ; `git diff --check` sans erreur à la vérification.
- Aucun test réel de délivrabilité des emails, de navigateur de messagerie ou de charge concurrente de production n’est déduit de ces tests.

## Revue critique des modifications parallèles

Le transport partagé conserve la distinction entre `api()` retournant `data` et le wrapper de compte retournant l’enveloppe. Il ne rejoue pas une mutation après une panne réseau et précise que le résultat serveur peut être incertain. La combinaison des signaux d’annulation utilise désormais un `AbortController` et des écouteurs, sans dépendre de `AbortSignal.any` sur les anciens Safari. La sérialisation des sauvegardes vendeur garde les nouvelles éditions pendant une requête ; le retour aux annonces attend la sauvegarde. Les limites de capacité et prérequis ci-dessous restent distincts de ces correctifs.

## Limites vérifiables avant ouverture commerciale générale

1. **Emails** : le SMTP propre à GP park reste différé par le propriétaire. La confirmation de compte et la récupération doivent encore être validées de bout en bout dans une vraie boîte avec le fournisseur retenu. La simulation SDK ne prouve pas la délivrabilité.
2. **Identité et documents de l’exploitant** : mentions légales, conditions et confidentialité sont encore des documents de préparation. Renseigner et valider l’exploitant réel et les documents fait partie de l’ouverture commerciale ; ne pas inventer ces données.
3. **Capacité de l’administration** : la limite de sélection des 100 premiers comptes a été corrigée dans une seconde passe décrite ci-dessous. La recette PostgreSQL et le déploiement du nouveau RPC doivent être confirmés par le coordinateur ; ils ne sont pas déduits du test SQLite.
4. **Médias** : la recette de purge CDN dépend encore du secret opérateur que le propriétaire fournira plus tard ; cette revue ne la déclare pas achevée.
5. **Plans 3D réels** : les plans/dimensions sources des biens ne sont pas encore fournis. Une annonce sans 3D reste prise en charge ; aucun plan fictif ne remplace une source manquante.

## Politique MFA choisie

Les documents `AUTH_SECURITY.md`, `BACKEND.md` et `OPERATIONS.md` distinguent maintenant le défaut de la migration025 (MFA obligatoire) du choix de production documenté le 23 octobre (`GP_REQUIRE_ADMIN_MFA=false` et configuration privée correspondante). Connexion et rôles restent requis. Ce changement documentaire ne réactive pas la vérification supplémentaire et ne constitue pas une nouvelle lecture de la configuration distante.


## Seconde passe — recherche et pagination administrateur

Le défaut des 100 comptes est corrigé dans les deux interfaces qui utilisaient ce roster : **Comptes et accès** et **Limites des comptes**. La recherche porte sur le nom public ou l’identifiant, sans exposer d’email. Chaque page contient 50 comptes dans l’interface (limite serveur de 1 à 100) ; le bouton « Afficher les comptes suivants » charge la suite. Une recherche différente recommence au début, une requête périmée ne remplace pas la plus récente, et les décisions existantes restent versionnées et protégées. Le sélecteur de limites conserve le compte choisi lorsqu’une nouvelle recherche est lancée.

- API existante `/api/admin/users` sans paramètres inchangée pour compatibilité. Mode paginé activé par `q`, `limit` ou `cursor`, avec `data` et `nextCursor` dans l’enveloppe.
- Pagination par identifiant stable. Curseur borné et lié à la recherche ; un curseur employé pour un autre terme est refusé. Recherche littérale : `%` n’est pas un joker.
- Migration additive créée par `supabase migration new` : `20261025051618_admin_accounts_pagination.sql`. Le nom horodaté provient de l’horloge de l’outil CLI, et non de la date affichée à l’utilisateur. Elle ajoute uniquement `gp_admin_users_page(text,uuid,integer)` ; ni données, ni politique MFA, ni décisions de rôle/suspension ne changent.
- Le RPC exige `gp_admin_allowed()` avant lecture, révoque `PUBLIC`/`anon`, accorde l’exécution à `authenticated` avec garde administrative interne, fixe son `search_path`, borne les arguments et retourne au plus une ligne supplémentaire pour détecter la page suivante. Aucun nouveau droit de lecture de table n’est accordé.
- Retour arrière : revenir d’abord à l’ancienne application, puis retirer le seul nouveau RPC avec `drop function public.gp_admin_users_page(text,uuid,integer);`. L’ancien `gp_admin_users()` reste disponible ; aucune restauration de données n’est nécessaire.
- `tests/admin-users-pagination.test.ts` : parcours API local réel avec 135 identités synthétiques, pages 100+35 sans perte/doublon, recherche par UUID, caractère `%` littéral, absence email/mot de passe, curseur périmé et paramètres invalides, refus membre/modérateur/anonyme, maintien du contrat historique. **1 test complet réussi**, plus **3 tests historiques d’administration réussis**.
- Recette `supabase/tests/admin-users-pagination.sql` : 135 comptes synthétiques et trois rôles, transaction annulée, garde de collision des fixtures, assertions de bornes, ordre, recherche, confidentialité et refus de rôles. **Non exécutée par cet agent** : Docker local n’était pas disponible. Le coordinateur doit l’exécuter dans le projet SQL jetable avant l’application distante et contrôler ensuite les advisors.
- TypeScript et `git diff --check` réussis après la seconde passe. Aucun appel SQL distant ni compte réel modifié par cet agent.

Documentation consultée : [fonctions et droits d’exécution Supabase](https://supabase.com/docs/guides/database/functions), changelog courant et changement TLS du 12 octobre 2026. Aucun changement de protocole requis pour ce RPC et le runtime actuel ; l’exigence de droits d’exécution explicites et de garde interne est appliquée.

## Préparation Google et Apple

Parcours SSR/PKCE implémentés, avec activation des boutons conditionnée aux paramètres réels du fournisseur, consentement explicite signé et vérifié, vérification du compte actif, retours stricts et délai réseau borné. Les fournisseurs restent désactivés en production ; le propriétaire n’a pas encore les comptes externes requis. Le guide [OAUTH_SETUP.md](../OAUTH_SETUP.md) distingue les deux callbacks, les prérequis et les limites restantes des comptes purement sociaux. Aucune migration SQL, activation fournisseur ni création de compte externe par cet agent.

**21 tests Auth ciblés réussis**, dont **10 tests OAuth** (SDK réel avec transport HTTP isolé). Le test de concurrence utilise deux vrais vérificateurs SDK et confirme que l’échange sélectionne le `flowId` de l’intention signée, et non le vérificateur le plus récent. Les tests préexistants d’inscription et de récupération continuent de réussir. TypeScript réussi. Ceci ne remplace pas l’inscription/reconnexion réelle auprès de Google ou d’Apple après leur configuration.
