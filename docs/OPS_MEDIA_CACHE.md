# Invalidation manuelle du cache CDN des photos retirées

Outil opérateur **local et privé**, livré le 22 octobre 2026. Aucun appel distant, purge, nouveau média ou fixture n’a été exécuté pour cette livraison. Il n’ajoute aucune route d’application et ne change ni le retrait des publications ni le contrat de cache existant.

La [documentation Supabase sur la purge CDN](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache) exige une **secret key** et une offre **Pro ou supérieure**. L’API accepte un chemin exact et met l’invalidation en file ; la propagation peut prendre jusqu’à 60 secondes. Les caches des navigateurs ne sont pas invalidés. Le SDK installé expose `StorageFileApi.purgeCache(path)` ; aucune mise à jour de dépendance n’est nécessaire à cet outil.

## Périmètre accepté

Le script ne prend qu’une annonce par opération. Il lit `listings`, `published_listings` et ses lignes `media_assets`. L’annonce doit exister, se trouver dans un état `withdrawn`, `sold`, `paused`, `suspended` ou `expired`, et être **absente** de `published_listings`, y compris en lecture avec la clé privée. Un état `published`, une projection encore présente, une lecture refusée ou un identifiant inconnu bloque le plan.

Chaque média doit posséder un UUID valide, appartenir au vendeur et à l’annonce sélectionnés, être déclaré `image/webp`, et avoir exactement la clé privée de métadonnées `owner_uuid/listing_uuid/media_uuid.webp`. L’unique cible CDN dérivée est **`public-approved/media_uuid.webp`**. La clé privée source n’est jamais passée à Storage. La limite d’opération est **120 médias**, correspondant à la limite agrégée en vigueur (`media_assets` et galeries par place ; la galerie principale reste limitée à 20). Au-delà, avec doublons ou sans média, le plan est refusé.

Aucun nom de bucket ou chemin n’est fourni par les arguments. L’outil ne purge pas un bucket entier, ne parcourt pas Storage, ne crée pas d’URL signée et ne supprime aucun objet. Les originaux `private-uploads`, plans `scene-sources` et archives `private-exports` ne sont pas des cibles. Aucune écriture SQL ou modification de schéma n’est exécutée. Un SDK/endpoint sans prise en charge renvoie un refus explicite ; aucun effacement de fichier ne sert de repli.

## Préparation locale

Utiliser le runtime Node du projet et un contexte opérateur privé. Injecter uniquement dans ce processus :

| Variable                         | Contenu                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GP_MEDIA_OPERATOR_SUPABASE_URL` | Origine HTTPS du projet prévu, sans identifiant, chemin, paramètre ni fragment.                                                                   |
| `GP_MEDIA_OPERATOR_SECRET_KEY`   | Secret key opérateur commençant par `sb_secret_`. Aucune clé `NEXT_PUBLIC_*`, JWT utilisateur, ancienne anon key ou clé implicite n’est acceptée. |

Ne pas inscrire la clé dans un argument, un journal, un document partagé ou une variable de navigateur. Le script ne lit pas automatiquement un `.env`, ne reprend aucune autre variable Supabase et ne journalise ni origine, clé, réponse brute SDK ni URL de média.

Depuis la racine du dépôt, préparer le plan en remplaçant le seul identifiant :

```sh
./node_modules/.bin/tsx scripts/purge-public-media-cache.ts --listing-id UUID_ANNONCE
```

**Par défaut, aucune demande de purge n’est envoyée.** Les lectures produisent un plan local dans `.data/media-cache-purge/`, déjà ignoré par Git. Le dossier est privé (`0700`) et le fichier plan (`0600`). Il contient des métadonnées de média et doit rester privé. La sortie indique identifiant d’annonce, nombre d’objets, chemin du plan et `planHash`, sans secret ni URL. Chaque simulation crée un nonce différent, donc un nouveau hash.

Relire le plan, l’annonce, l’état de retrait et les identifiants des médias avant l’action. L’exécution explicite reprend le fichier et son hash exacts, avec une raison de 15 à 500 caractères :

```sh
./node_modules/.bin/tsx scripts/purge-public-media-cache.ts --execute \
  --plan-file /chemin/prive/du-plan.plan.json \
  --expected-hash HASH_SHA256_DU_PLAN \
  --reason 'Retrait vérifié et résidu CDN de cette annonce contrôlé.'
```

Le plan est lié à l’empreinte du projet. Le script vérifie son intégrité et ses permissions, compare le snapshot courant, puis écrit un reçu exclusif `<hash>.consumed.json` avant la première purge. Le répertoire des reçus est rattaché au script du dépôt, indépendamment du répertoire courant. Ne pas déplacer ou supprimer un reçu pour rejouer un plan.

Avant **chaque** chemin, il relit l’annonce, sa version/date, l’absence de projection et l’ensemble des médias ; un changement arrête la suite. Ces lectures HTTP et la purge ne constituent pas une transaction atomique : une publication concurrente après le contrôle reste possible. L’opération ne détruit pas les objets et une purge n’empêche pas le CDN de se repeupler depuis une origine toujours accessible.

## Résultat et reprise

`status: invalidation_queued` signifie uniquement que les demandes individuelles ont été acquittées. `queuedCount` compte ces acquittements ; `globallyRevoked` et `browserCachesInvalidated` restent faux. Il ne s’agit ni d’une mesure des nœuds CDN, ni d’une révocation globale ou instantanée des anciens liens et copies.

En cas de refus ou d’interruption, la sortie contient un code borné et le nombre d’acquittements déjà reçus. `CDN_PURGE_FORBIDDEN_CHECK_SECRET_AND_PLAN` demande de vérifier le secret, les droits et l’offre ; `CDN_PURGE_UNSUPPORTED` indique l’absence de capacité reconnue. Une erreur de transport peut survenir après mise en file : `remoteOutcomeUncertain:true` interdit de déduire que zéro acquittement signifie zéro demande distante.

Toute tentative consommée, même partielle, exige **une nouvelle simulation, son nouveau hash et une raison d’exécution** avant reprise. Vérifier l’état distant et conserver le compte rendu privé ; ne pas rejouer à l’aveugle le plan précédent. Aucune reprise automatique ni planification n’est fournie. Une vérification distante ultérieure doit établir le comportement des accès concernés ; les tests locaux ne prouvent pas l’éligibilité Pro ni une invalidation CDN effective.

## Validation livrée

`tests/media-cache-purge.test.ts` : **12 tests purs réussis**, avec adaptateur factice : simulation sans purge, cibles exactes, raison/hash/projet requis, annonces publiées ou inconnues, changement avant et pendant la boucle, identifiants/chemins/buckets refusés, limite 120, refus SDK/offre, reprise avec nouveau plan, erreurs expurgées et classification du statut HTTP SDK. `tsc --noEmit --incremental false` réussi. Aucun serveur ou build supplémentaire lancé, aucune clé opérateur réelle utilisée.
