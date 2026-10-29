# Export et demande de suppression — V1

Ce module ne déclare pas la conformité complète ni l’effacement final. Les durées de conversations, signalements, dossiers et sauvegardes doivent être justifiées avec l’opérateur avant ouverture. Les données restent privées et les travaux destructifs sont limités aux catégories explicites ci-dessous.

## Migration et API

La migration021 `20261021185055_privacy_commands_jobs.sql` dépend de018 (déclarations CGU) et019 (contributions au registre). Routes autonomes :

- `POST /api/privacy/export` avec mot de passe actuel : nouvelle authentification Auth isolée, puis export de ses données dans une transaction de lecture serveur. La session du navigateur n’est pas remplacée.
- `POST /api/privacy/delete` avec mot de passe et `confirmation: SUPPRIMER` : retrait des publications, désactivation des nouveaux contacts, état `deletion_pending` et demande durable dans la même transaction. Le dernier administrateur actif doit d’abord transmettre son rôle.
- `GET /api/privacy/status` : reçu HttpOnly aléatoire à forte entropie, haché en base et limité à cette demande pendant90jours. Aucune fausse session ni données du compte sont exposées. Sans reçu, aucun état n’est divulgué.

L’export comprend profil/identité sans identifiants secrets, annonces et révisions propres, métadonnées médias, favoris, conversations auxquelles le membre participe, messages qu’il a envoyés, visites, lectures, blocages créés, notifications, déclarations versionnées, signalements propres, scènes et sources propres, contributions et événements d’audit sans contenu sensible. Il exclut les mots de passe, tokens, facteurs MFA, preuves internes figées de modération et fichiers binaires. Ces fichiers ne sont pas déclarés téléchargés par le JSON. Un résultat dépassant32 Mio est refusé explicitement et n’est jamais tronqué silencieusement.

## Travail de suppression borné

`npx tsx scripts/privacy-maintenance.ts` produit uniquement un plan par défaut. Les identifiants sélectionnés sont des références de demandes ; ne pas publier ce plan dans des logs publics.

Configuration opérateur privée : `GP_MAINTENANCE_SUPABASE_URL` et `GP_MAINTENANCE_SERVICE_ROLE_KEY`. Aucun secret `NEXT_PUBLIC` ni clé de service dans l’application cliente.

Après inspection du plan, l’exécution nécessite simultanément `--execute`, `--policy privacy-limited-cleanup-v1` et `--ids` contenant1à100UUID distincts explicitement choisis. Le serveur verrouille ces demandes, vérifie leur ancienneté minimale de7jours et l’état `deletion_pending` ; une demande récente ou un compte réactivé est refusé.

Ce travail efface seulement favoris, notifications, accusés de lecture et entrées outbox pending/failed ; il coupe la préférence email. Les demandes déjà traitées ne sont pas rejouées. Les autorisations de récupération déjà expirées depuis plus d’un jour sont supprimées comme données techniques temporaires.

Le statut devient **manual_review**, avec date de nettoyage limité. Le worker ne supprime ni compte Auth, ni messages, ni historique d’annonces, ni preuve de signalement, ni plans/sources/Storage, ni journal d’audit ou sauvegarde. Il ne marque jamais l’effacement complet, n’envoie pas d’email final et ne contourne aucune pièce potentiellement nécessaire à un tiers. L’interface de suivi distingue la désactivation immédiate et le traitement restant. Une politique de conservation justifiée et sa procédure d’achèvement constituent encore un préalable humain/opérationnel.

Les exports directs ne créent aucun fichier serveur permanent à purger après 7 jours. L’opérateur doit définir la rotation des sauvegardes et l’accès aux données résiduelles ; ce module n’efface pas une sauvegarde distante.

## Vérification

`tests/privacy-commands.test.ts` utilise une base SQLite temporaire : refus de mauvais mot de passe, export des catégories, absence de secrets/tiers, demande durable, désactivation et suivi strictement limité au reçu. `supabase/tests/privacy-commands.sql` crée des fixtures sous transaction annulée et contrôle la réauth récente, les périmètres d’export, le retrait, les privilèges, le refus des reçus forgés, le plan et l’exécution bornée/idempotente du nettoyage limité. Aucun email réel ni suppression de compte humain/Storage n’est effectué par ces tests.

## Archives privées durables (extension021)

L’interface principale utilise `POST /api/privacy/exports` après vérification du mot de passe actuel. Le serveur enregistre un job et un instantané privé, sans produire un succès de téléchargement. `GET /api/privacy/exports` affiche les50 dernières demandes du propriétaire, leurs états et erreurs. Le JSON immédiat reste présenté comme un téléchargement de **métadonnées**, distinct de l’archive.

Le worker `scripts/privacy-export-worker.ts` fonctionne en **dry-run par défaut** et utilise les mêmes variables privées de maintenance. L’exécution nécessite `--execute --policy private-export-v1 --ids <1à20UUID distincts>`. Il prend un bail de30 minutes par job. Une reprise après bail expiré nettoie uniquement l’ancien objet privé dérivé de ce même job/bail. Il lit les médias propres et les sources dont propriétaire **et déposant** correspondent au demandeur ; aucun document déposé par un contributeur tiers n’est ajouté. Les scènes propres sont présentes dans les données JSON.

Les entrées sont copiées séquentiellement par streams sur un répertoire temporaire privé puis le ZIP est écrit en streaming. Bornes :250 fichiers, 25 Mio par fichier,32 Mio de JSON et 512 Mio pour l’entrée cumulée et le ZIP. Une source absente, une borne dépassée ou une erreur d’envoi fait échouer le job ; aucun ZIP partiel n’est marqué prêt. Les fichiers temporaires sont effacés après chaque tentative. Les noms d’archive sont dérivés desUUID internes, jamais des noms de fichiers fournis par un membre. L’archive contient `account.json`, `manifest.json` (périmètre, tailles et empreintes) et les médias/documents propres.

Le ZIP prêt est envoyé au bucket **privé** `private-exports`, sans URL publique. Les instantanés de travail sont alors supprimés du job. Le téléchargement utilise `POST /api/privacy/exports/:id/download` avec nouvelle confirmation du mot de passe, contrôle du propriétaire et de la disponibilité, puis proxy binaire avec `Cache-Control: private, no-store`. L’interface envoie ce formulaire dans un nouvel onglet pour laisser le navigateur télécharger le flux sans charger 512 Mio dans le JavaScript de la page. Les erreurs y restent explicites.

L’archive expire exactement 7 jours après sa préparation et devient immédiatement inaccessible par les règles de lecture et le proxy. La suppression physique est une action opérateur distincte : `--execute --purge --policy private-export-v1 --ids <UUID>`. Le serveur verrouille uniquement les jobs échus, donne leur clé objet exacte et un jeton de purge ; le worker appelle **Storage API remove**, puis confirme l’expiration en base avec ce jeton. Aucun `DELETE storage.objects` n’est utilisé. Un échec Storage laisse le job verrouillé temporairement et expiré, jamais remis en lecture. Le plan dry-run expose les seules références de jobs candidats.

En démo locale, `--local` exige explicitement `GP_FORCE_LOCAL_DEMO=true` et `GP_DATABASE_PATH` ; les archives restent sous `GP_EXPORT_PATH` (ou `.data/private-exports`) et passent par le même proxy réauthentifié. Cela ne teste pas Supabase Storage. `tests/privacy-archive.test.ts` couvre ZIP lisible avec image/PDF inertes, exclusion d’un contributeur tiers, refus d’une source manquante/trop grande, instantané vidé après préparation, téléchargement réauth et expiration/purge bornée.
