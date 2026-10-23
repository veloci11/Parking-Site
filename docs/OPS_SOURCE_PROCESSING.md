# Sources privées : quarantaine et aperçus

Migration023 est additive. Elle porte les sources à **25 Mio chacune, 10 documents par annonce**. Les nouveaux documents sont `processing` ; aucun appel client ne peut imposer `ready`, ni les joindre à une scène avant traitement. Les anciens documents doivent repasser le traitement. Les comptes actifs autorisés voient les métadonnées, jamais les octets en attente/refusés. Les scènes existantes ne sont pas déclarées vérifiées rétroactivement.

Le worker opérateur `scripts/process-scene-sources.ts` est indépendant de l’application. Il réclame une source avec un bail de deux minutes, au plus trois tentatives, télécharge ses octets privés, vérifie leur SHA256 et lance un processus de rendu. Succès : `ready`, date/version, nombre de pages et au plus trois aperçus PNG privés. Échec : `rejected` avec code générique. Aucun original, secret ou message du parseur n’est journalisé. Les aperçus partiels sont retirés via l’API Storage ; les originaux refusés restent privés pour intervention, sans purge automatique.

Configuration opérateur privée : `GP_SOURCE_SUPABASE_URL`, `GP_SOURCE_SERVICE_ROLE_KEY`, `GP_SOURCE_RASTER_IMAGE`. Les deux premières variables appartiennent seulement au parent opérateur, jamais à l’image ni à l’environnement du processus PDF. Ne pas enregistrer leurs valeurs dans Git. Le mode par défaut affiche seulement les identifiants en attente. Pour traiter au maximum dix identifiants explicitement :

```
node --import tsx scripts/process-scene-sources.ts --execute --ids UUID,UUID --isolated-host-confirmed
```

Le drapeau opérateur est conservé, mais le confinement est maintenant imposé par `source-processing.ts` : chaque rendu passe par Docker. Sans `GP_SOURCE_RASTER_IMAGE` immuable, daemon Linux local via socket Unix, prise en charge cgroups mémoire/swap/PID, profil seccomp et image déjà disponible, le traitement refuse de démarrer. Les endpoints Docker TCP/SSH et les contextes distants sont refusés ; le socket résolu est figé après vérification pour éviter de rediriger les documents si le contexte courant change. Le script opérateur vérifie ces conditions **avant de réclamer un bail**, puis le parent revalide avant chaque rendu. Un tag seul, même versionné, est refusé ; utiliser `sha256:…` (image locale) ou `registre/depot@sha256:…`. Aucun téléchargement d’image n’a lieu pendant le traitement (`--pull=never`).

Le conteneur démarre sans réseau, sans IPC partagé, sous UID/GID65532, sans capacité Linux, sans élévation de privilèges, avec système racine en lecture seule. Seul `/tmp` est inscriptible : tmpfs64Mio, `noexec,nosuid,nodev`. Mémoire totale384Mio, sans swap supplémentaire, un CPU,48PID,64descripteurs et aucun core dump ; tas Node160Mio, délai parent20s et suppression forcée du conteneur sur échec/délai. Le profil seccomp Docker reste actif. Aucun volume, chemin hôte, socket Docker, fichier d’environnement ou secret applicatif n’est monté ni transmis au conteneur. Les journaux Docker du rendu sont désactivés.

Le parent transmet seulement les octets par stdin. La réponse est une trame `GPR1`, longueur d’en-tête sur4octets, JSON de1Kio maximum puis jusqu’à trois PNG de4Mio chacun. Longueurs, nombre de pages/aperçus, absence d’octets supplémentaires et dimensions PNG sont contrôlés. Le parent lit l’en-tête PNG fixe sans invoquer de décodeur natif ; les sorties restent des fichiers raster privés non fiables. Les permissions Node, l’environnement minimal et le refus des appels réseau Node sont complémentaires au confinement OS. Ce traitement ne constitue pas un antivirus.

### Construire et configurer l’image

Utiliser un hôte Docker Linux, ou Docker Desktop déjà initialisé, avec les contrôles cgroups et seccomp actifs. Le parent nécessite l’accès au daemon ; le processus raster n’y a jamais accès. Un hébergement sans Docker doit utiliser un worker opérateur séparé pour vider la file privée. Le serveur web connecté conserve uniquement l’envoi en quarantaine.

Depuis la racine du dépôt, avec Docker prêt :

```sh
docker pull node:24.13.0-bookworm-slim
NODE_BASE_IMAGE="$(docker image inspect node:24.13.0-bookworm-slim --format '{{index .RepoDigests 0}}')"
docker build --build-arg NODE_IMAGE="$NODE_BASE_IMAGE" --file scripts/workers/scene-source.Dockerfile --tag gp-source-raster:1 scripts/workers
export GP_SOURCE_RASTER_IMAGE="$(docker image inspect gp-source-raster:1 --format '{{.Id}}')"
./node_modules/.bin/tsx --test tests/source-processing.test.ts tests/scene.test.ts
```

Le contexte de construction est **`scripts/workers`**, avec `.dockerignore` en liste d’autorisation. Le Dockerfile copie uniquement le worker et son manifeste/verrou de dépendances (`pdfjs-dist6.4.299`, `@napi-rs/canvas1.0.13` et binaire natif correspondant), installés par `npm ci --ignore-scripts`. Aucun fichier projet, `.env`, `.data`, original ou compte n’entre dans le contexte ni dans l’image. L’installation des dépendances utilise le réseau à la construction, jamais au rendu. La base par défaut du Dockerfile est également épinglée au digest du manifeste officiel Node24.13.0-bookworm-slim, vérifié avec `docker buildx imagetools inspect`. Le manifeste/verrou du worker est indépendant du paquet de l’application ; mettre les deux à jour ensemble lors d’une mise à jour PDF/canvas.

Conserver la valeur complète de `GP_SOURCE_RASTER_IMAGE` dans la configuration privée du worker. En cas de transfert vers un autre hôte, charger la même image et vérifier son ID, ou publier l’image dans un registre autorisé puis configurer son digest. Garder les variables Storage dans le seul parent. Exemple de lancement avec un fichier local ignoré par Git :

```sh
node --env-file=.env.source-worker.local --import tsx scripts/process-scene-sources.ts --execute --ids UUID,UUID --isolated-host-confirmed
```

La démonstration locale requiert elle aussi cette image pour accepter les documents. **Ne jamais configurer `GP_SOURCE_INERT_TEST_WORKER=1` pour l’application ou le worker opérateur.** Ce mode exige le contexte du runner `node --test`, reste interdit sous `NODE_ENV=production` et sert seulement aux fixtures générées des tests ; il n’est pas un confinement OS.

PDF.js reçoit uniquement un tableau d’octets : évaluation JavaScript, XFA, polices système, chargements worker/WASM, annotations, requêtes de plage et préchargements désactivés. Les actions JavaScript, pièces jointes et formulaires sont refusés après analyse du document et des pages. Les liens ne sont pas activés. Maximum30 pages analysées, trois premières pages rendues,1800px de côté,16M pixels source et4 Mio par aperçu. Les images sont décodées puis rasterisées en PNG. Cela ne constitue pas un antivirus ni une garantie d’absence de contenu malveillant.

L’API authentifiée `/api/scenes/sources?id=UUID&preview=1` sert les PNG prêts avec `nosniff`. L’original nécessite `&download=acknowledged`, est servi en pièce jointe avec CSPsandbox et le gestionnaire affiche un avertissement explicite. Une URL directe Supabase reste privée et exige les mêmes droits RLS et l’état prêt. Aucune source n’est insérée dans le manifeste public.

Les exports021 sont refusés tant qu’une source propre de l’utilisateur n’est pas prête. Ils ajoutent les aperçus des mêmes sources, jamais ceux d’un tiers. Le worker d’export revalide l’état/droit de chaque source avant lecture, y compris pour une ancienne tâche en file. Les historiques et sources ne sont pas purgés par021.

Validation : `tests/source-processing.test.ts` exécute le vrai moteur sur un PDF inerte, une image, des octets invalides, une taille excessive et un délai forcé. Il vérifie aussi le refus d’une image mutable/absente, l’interdiction du mode de test en production et les réponses de rendu malformées, trop grandes ou contenant des octets supplémentaires. Avec une image épinglée et un daemon prêt, le test Docker inspecte la politique réellement créée par le daemon puis exécute rendu, refus de contenu actif/corrompu et délai ; sans image ou daemon, il est **explicitement ignoré**, jamais compté comme une réussite de confinement. `supabase/tests/scene-source-processing.sql` est une recette transactionnelle avec rollback : reset de métadonnées forgées, refus de preuve non prête, privilèges, baux et clés d’aperçus. Elle ne crée aucun fichier Storage physique.

État de recette au21octobre2026 : **13tests source/scène réussis, aucun ignoré**, dont le vrai conteneur sur Docker29.9.2/Linux arm64 après initialisation locale de Docker Desktop par l’opérateur. Image construite depuis le contexte autorisé et dépendances verrouillées ; politique effective inspectée via le daemon. Rendu du PDF inerte réussi ; PDF actif, octets corrompus et délai forcé refusés ; aucun conteneur de recette restant après nettoyage. Image locale vérifiée : `sha256:27c79edfe5116ab39c2c15c5e4f46d6c13d56a3434c5618a08f32647c99f82ef`. Cette recette locale n’atteste ni un worker distant déployé/planifié ni le traitement d’un document humain.

Références opérateur : [options et limites Docker](https://docs.docker.com/engine/containers/run/), [limites du modèle de permissions Node](https://nodejs.org/api/permissions.html).
