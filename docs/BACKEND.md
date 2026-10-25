# Backend V1 — état exécuté

L’application possède deux adaptateurs. La présence de `NEXT_PUBLIC_SUPABASE_URL` et de `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) active le backend Supabase réel. `GP_FORCE_LOCAL_DEMO=true` sélectionne explicitement la démonstration SQLite. Sans configuration et hors démo locale autorisée, l’application échoue fermée ; elle ne publie pas les fixtures dans une production distante.

## Supabase

Appliquer les migrations de `supabase/migrations/` dans leur ordre, y compris `202610210002_function_grants.sql` qui retire les droits EXECUTE implicites de Supabase. Appliquer `202610210001_v1.sql` à un **projet dédié**. Auth, PostgreSQL, PostGIS et Storage restent dans ce projet. Aucune clé service-role n’est nécessaire pour l’application web. Le worker de notifications, séparé et facultatif, utilise une clé privée dédiée lorsqu’il travaille sur Supabase ; elle ne doit jamais être injectée dans le navigateur. Le SDK SSR utilise la clé publiable, la session de l’utilisateur et les politiques RLS. Aucun mot de passe n’est stocké dans les tables applicatives Supabase.

Renseigner `NEXT_PUBLIC_SITE_URL` avec l’origine canonique exacte (protocole, hôte et port). Les mutations sont limitées à cette origine ; la vérification ne fait pas confiance à `X-Forwarded-Host`. Autoriser dans Supabase Auth les URL de retour `/api/auth/callback` de cet environnement, notamment pour la confirmation et la récupération. Les emails d’identité sont envoyés par Supabase Auth ; le fournisseur SMTP et ses limites doivent être validés avant ouverture.

Toutes les routes de compte utilisent `auth.getUser()`, le statut actif en base et le rôle non éditable par le membre. Les cookies de session sont gérés exclusivement côté serveur dans ce projet : HttpOnly, SameSite=Lax et Secure en HTTPS. La récupération arrive sur `/api/auth/callback?next=/reinitialiser`, échange le code puis permet de choisir un nouveau mot de passe. La suppression désactive les annonces et le compte ; elle requiert une authentification par mot de passe datant de moins de cinq minutes au niveau RPC, en plus de la route.

Les premiers modérateurs doivent être attribués explicitement par l’opérateur dans `app_roles` après création de leur compte. Il n’existe aucun bouton public pour s’accorder ce rôle. L’email confirmé ne prouve ni identité ni propriété immobilière.

### Données et publication

- `listings` garde le brouillon privé et la dernière publication ; `listing_revisions` fige les soumissions ; `published_listings` est une projection publique à liste blanche.
- Les RPC contrôlent elles-mêmes identité, rôles, validation, attestation, versions, quotas et transitions. Le contrôle ne dépend pas des formulaires ni des API Next.
- Une nouvelle révision ne retire pas l’ancienne version approuvée. La vente, la pause et le retrait suppriment immédiatement la projection publique.
- Les uploads bornent le flux multipart à 12 Mo, y compris sans Content-Length, avant toute analyse d’image. La soumission requiert titre de 15–90 caractères, description de 100–5 000 caractères, trois photos, prix total et unités numérotées. Limite de 500 unités et de 20 photos dans la galerie générale. Les galeries propres aux unités sont persistées dans `spacePhotos` : six photos au maximum par unité, vingt dans la galerie générale et cent vingt assets distincts au total. Le validateur vérifie les unités et la propriété des images. Les clés privées sont remappées en alias propres à l’annonce dans la projection publique. Une photo déclarée ne devient pas automatiquement une preuve de qualité ou une mesure vérifiée.
- Le quota gratuit de dix annonces compte des `listing_id` distincts. Réviser une annonce n’en consomme pas deux.
- L’emplacement `area` n’expose ni adresse exacte, ni scène, ni identifiants physiques partagés. Le catalogue utilise la position publique arrondie au secteur. La carte mentionne la précision et cette approximation devra être rapprochée des secteurs réellement validés avant ouverture.
- Aucune scène réelle n’est créée automatiquement. Le module de scènes de la migration 003 gère les sources privées, le manifeste métrique et une revue indépendante. Le catalogue enrichit la disponibilité à partir d’une scène approuvée compatible avec la publication courante ; les annonces de secteur n’en exposent jamais. Voir la documentation du module scènes pour les limites de reconstruction. Le parking de démonstration reste explicitement fictif.

### Médias

`private-uploads` et `public-approved` sont tous deux des buckets **privés**. Les objets assainis de `public-approved` ne deviennent lisibles que si une projection publiée les référence, grâce à la politique Storage. Un échec de transaction ne rend donc pas public un fichier copié avant publication.

Les uploads ont un chemin propriétaire/annonce/UUID.webp et sont réservés au propriétaire du brouillon, avec limite de stockage et limitation de cadence. L’API décode, borne les dimensions et réencode avec Sharp, sans EXIF. L’approbation redécode et réencode une seconde fois avant copie, afin de couvrir aussi un dépôt direct via Storage contournant l’API. Les sources ne sont jamais servies anonymement. Le module de scènes prend en charge des sources PDF/images privées. Les variantes multiples 480/960/1920, l’anonymisation assistée des plaques/visages et la planification de purge restent à compléter ; les formulaires ne doivent pas promettre ces capacités. Les policies DELETE de nettoyage restent réservées au propriétaire des sources non référencées ou au modérateur pour les variantes approuvées non référencées. Les liens des galeries générales et unitaires sont pris en compte.

### Contact

Conversations créées uniquement pour une annonce actuellement publique, acheteur distinct du vendeur. Messages privés aux participants, y compris vis-à-vis d’un modérateur sans dossier spécifique. Idempotence par émetteur/requête. Une visite acceptée sans horaire reste `accepted` (« À organiser ») ; elle devient `confirmed` uniquement quand le vendeur indique un horaire futur. Versions et actions sont contrôlées par RPC, y compris pour les valeurs NULL soumises directement.

`notification_outbox` alimente une inbox privée persistante. Les lectures et les compteurs de conversation sont calculés à partir de vrais reçus par message. Le worker CLI de notification est livré avec aperçu local par défaut ; aucun fournisseur SMTP ni envoi réel n’a été activé dans cette réalisation. Les emails de confirmation/récupération Auth restent indépendants de cette outbox. Voir la section worker ci-dessous.

## Démonstration locale

Node 22.13+ et son module `node:sqlite`. Fichiers `.data/gp-demo.sqlite` et `.data/media/`, ignorés par Git. `GP_DATABASE_PATH` et `GP_MEDIA_PATH` permettent d’isoler une recette. Cette base n’est pas une solution multi-instance de production et n’est pas une migration Supabase.

La démo n’accepte que les hôtes loopback et vérifie Host et Origin, même si Next reconstruit son URL interne avec `localhost`. `GP_LOCAL_DEMO=true` est requis en plus pour lancer cette démo avec `next start` (NODE_ENV=production). Ces variables ne permettent jamais de servir la démo sur un hôte distant.

`POST /api/auth/demo` peut ouvrir l’un des comptes fictifs `buyer`, `seller` ou `moderator` **uniquement dans cet adaptateur local**. Aucun mot de passe de compte réel n’est committé. L’inscription normale utilise scrypt et des sessions opaques stockées sous forme de hash. La boîte locale privée donne les tokens de confirmation/récupération seulement au compte concerné ou au reçu opaque de l’opération. Pas de boite globale anonyme. Aucun email n’est réellement envoyé dans ce mode.

La suppression d’un compte partagé de démonstration est refusée ; un compte créé par inscription peut être désactivé après confirmation du mot de passe. Les données historiques ne sont pas promises supprimées immédiatement.

## Routes

Enveloppe `{data:...}` ; erreur `{error: string, code: string}`. `Cache-Control: no-store` sur les données privées et les médias.

- GET session, health ; POST auth/register, login, logout, forgot, reset ; GET auth/callback en Supabase.
- GET listings (q/city/type/priceMax/areaMin/sort/limit/cursor), listings/:id, me/listings ; POST listings ; PATCH listings/:id ; POST listings/:id/submit, lifecycle.
- GET favorites (IDs), PUT/DELETE favorites/:id.
- GET admin/revisions ; POST admin/revisions/:listingId/decision (approve/changes_requested/reject).
- POST uploads (multipart listingId/file), GET media/:id.
- GET/POST conversations ; GET/POST conversations/:id/messages, conversations/:id/visits ; POST visits/:id/decision.
- PATCH me/profile ; GET/POST me/export ; POST me/delete ; POST reports.

## Vérification

`npm test` vérifie les politiques métier locales, la projection publique, les conflits et l’idempotence. Les tests HTTP avec serveur sont activés par la variable documentée dans le README d’exploitation. `supabase/tests/rls.sql` exécute une recette SQL multi-identités en transaction annulée et utilise des commandes psql `\gset` ; ne pas la coller telle quelle dans un outil qui ne prend pas en charge ces commandes.

Le premier contrôle SQL a utilisé un PostgreSQL 14 isolé avec schémas Auth/Storage simulés et un substitut de colonne géographique, car PostGIS n’était pas installé sur cette instance de test. Cela vérifie syntaxe, logique RPC et RLS, mais ne remplace pas la recette du vrai projet Supabase, de Storage et des emails. Les comptes fictifs de recette n’ont pas vocation à rester dans le projet réel.

La facturation V2 n’est pas activée : aucun paiement à l’annonce, aucun paiement immobilier et aucun endpoint Stripe.

## Notifications, signalements et MFA (migrations 004/005)

- GET `/api/notifications` renvoie les cent dernières notifications et le nombre total non lu ; POST `/api/notifications/read` marque seulement les notifications du compte courant. Lire une conversation marque ses messages reçus et les notices associées ; aucun état de lecture n’est inventé.
- GET/PATCH `/api/me/notification-settings` expose `{emailEnabled:boolean}`. Désactiver l’email ne supprime pas l’inbox de l’application.
- GET `/api/admin/reports`, POST `/api/admin/reports/:id/decision` : décisions `reviewed`/`dismissed`, motif et version obligatoires, historique d’audit conservé. Les signalements ne sont jamais publics.
- GET `/api/mfa` lit les facteurs et le niveau courant de Supabase Auth. Les endpoints enroll/challenge/verify/unenroll utilisent le SDK TOTP réel. Le QR et le secret ne sont fournis qu’au propriétaire actif, avec no-store. Le retrait requiert AAL2 et un mot de passe valide ; la session éphémère de vérification est fermée localement pour ne pas révoquer les autres sessions.
- Les comptes locaux de démonstration affichent que MFA n’est pas disponible ; aucun faux facteur n’est créé.

La migration004 introduit `gp_private.configuration.mfa_required` ; la migration025 installe le défaut obligatoire `true`. Le garde SQL et le garde applicatif conservent les contrôles de rôle, de compte actif et d’email confirmé. La production GP park suit ensuite le choix explicite du propriétaire de supprimer la vérification supplémentaire : le [rapport de livraison du 23 octobre 2026](qa/gallery/RELEASE_2026-10-23.md) consigne `GP_REQUIRE_ADMIN_MFA=false` et `mfa_required=false`. Ne pas confondre le défaut des migrations avec cette configuration d’exploitation ni la réactiver à l’occasion d’un déploiement. Les tests `supabase/tests/moderation-mfa-default.sql` vérifient la politique obligatoire dans leur environnement de recette ; ils ne prouvent pas la valeur courante en production. Le TOTP reste disponible pour les comptes qui l’utilisent.

## Worker de notifications : aperçu avant envoi

Exécution locale sans réseau SMTP :

```sh
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 npx tsx scripts/process-notifications.ts --local
```

Un aperçu `.eml` et son statut `preview_not_sent` sont écrits dans `.data/notification-previews/` (dossier 0700, fichiers 0600, ignorés par Git). Le statut de queue reste pending ; seule la date d’aperçu change. La sortie console affiche des compteurs et un hash de destinataire dans le manifeste privé, jamais email, contenu des échanges, mot de passe ou clé. Une recette avec un événement fictif a exporté un aperçu et affiché `sent:0`. Aucun transport SMTP réel n’a été testé ni utilisé.

Pour lire une queue Supabase depuis ce worker séparé, fournir `GP_WORKER_SUPABASE_URL` et `GP_WORKER_SERVICE_ROLE_KEY` dans son environnement privé. Les RPC de claim/ack sont réservées au service-role ; les utilisateurs normaux ne peuvent ni lister la queue ni marquer un email comme envoyé. L’application web conserve sa seule clé publiable.

L’envoi exige à la fois `--send`, `GP_EMAIL_DELIVERY=enabled`, une origine HTTPS et `GP_SMTP_HOST`, `GP_SMTP_PORT` (465 ou 587), `GP_SMTP_USER`, `GP_SMTP_PASSWORD`, `GP_SMTP_FROM`. Les identifiants et le domaine d’envoi restent à configurer et vérifier par l’opérateur (SPF/DKIM/DMARC, limites fournisseur et gestion des rebonds). Aucun envoi n’est autorisé par le simple lancement sans option. Les comptes inactifs, emails non vérifiés, préférences désactivées et domaines fictifs sont exclus.

Le mail est transactionnel en texte clair, générique, avec un lien vers le compte ; aucun corps de message privé, adresse de parking ou pièce jointe n’est recopié. Accès fichier et URL Nodemailer désactivés, TLS exigé avec validation du certificat. Chaque événement possède un Message-ID déterministe.

Les claims sont atomiques avec lease et SKIP LOCKED sur Supabase. Les erreurs SMTP explicitement temporaires sont reprogrammées avec backoff, au maximum cinq tentatives. Une acceptation incertaine, un crash avec lease expiré ou un échec d’ack après acceptation passe en `uncertain` et requiert une revue ; il n’est pas réémis automatiquement. SMTP ne garantit pas l’exactement-une-fois : le Message-ID facilite le rapprochement mais ne certifie pas la déduplication du fournisseur. `sent` signifie accepté par le serveur SMTP, pas livré en boîte de réception. La planification du worker, la collecte des rebonds et les alertes de queue restent des tâches d’exploitation à configurer avant activation réelle.

## Pagination publique stable (migration 006)

`gp_catalog_page` utilise une clé de continuation et conserve `gp_catalog` pour compatibilité. Le serveur valide et encode le curseur en base64url : version, borne temporelle de création des publications, dernière clé et empreinte des filtres. Un curseur d’un autre tri/filtre, modifié ou âgé de plus de vingt-quatre heures est refusé avec `INVALID_CURSOR` ; les anciens offsets numériques doivent être remplacés par une nouvelle recherche.

Le tri récent utilise publication `created_at DESC, id ASC`. Le tri au prix utilise prix total `ASC` ou `DESC`, puis `id ASC`. Le prédicat de continuation s’applique avant LIMIT et le filtre de disponibilité de scène s’applique avant pagination. La version locale utilise les mêmes règles avec un `published_at` privé, sans modifier les dates commerciales affichées.

Les tests insèrent une nouvelle publication entre deux pages et vérifient qu’aucune annonce préexistante n’est dupliquée ou perdue. La borne `asOf` limite les publications créées après le début du parcours. Cela ne constitue pas un snapshot commercial figé : les prix et disponibilités courants restent autoritaires ; une modification de prix, une pause ou une vente peut modifier les résultats et doit conduire à actualiser la recherche. Aucun ancien prix n’est conservé seulement pour stabiliser l’interface.

La recette Postgres isolée de pagination utilisait un lecteur de scène nul ; les tests du vrai module de scènes et le contrôle de `scene=1` s’effectuent séparément sur Supabase. Les tests de frontières de JSON (128 Kio) et de multipart (12 Mio) incluent les requêtes sans Content-Length. Les cookies Secure et les callbacks d’identité utilisent l’origine canonique configurée, y compris derrière un proxy HTTPS.

### Compléments V1 : suspension, observations par unité, blocage et médias

- `GET /api/admin/publications` fournit les dossiers disposant encore d’une publication/snapshot, avec leur version courante. `POST /api/admin/listings/:id/suspend` exige rôle de modération et AAL2 en mode connecté après025, version et motif de 15–2000 caractères. La transaction retire publication, droits publics des images et claims, invalide le snapshot reprenable et inscrit audit/notification. Les conversations et révisions historiques restent privées et lisibles. Seule une correction soumise puis approuvée republie ; pause/reprise ne contourne pas la suspension.
- `unitQuality` associe des observations indépendantes aux identifiants d’unités du brouillon. Les clés deviennent des alias publics et les six champs sont explicitement projetés. Chaque qualité commune ou unitaire accepte `observedAt` ISO et `basis` (`seller_observation`, `provided_document`, `unknown`). Une provenance est une déclaration, pas une vérification de document. Une unité sans fiche n’hérite d’aucune observation commune ; sa qualité reste inconnue.
- `GET/PUT/DELETE /api/conversations/:id/block` retourne `{data:{blockedByMe,blocked}}`. Le blocage porte sur l’interlocuteur dans tous les fils et toutes les annonces de cette paire, y compris lorsque les rôles acheteur/vendeur sont inversés. Il empêche aussi les nouveaux contacts sur une autre annonce. Chacun gère uniquement son propre blocage ; DELETE retire tous les blocages qu’il a créés pour cette paire, et un blocage maintenu par l’autre participant garde l’interdiction. `GET /api/conversations` inclut ces deux indicateurs. L’historique et l’annulation de visite sont conservés. Les RPC de mutation utilisent un verrou transactionnel commun à la paire avant le verrou de conversation pour sérialiser blocage, nouveau contact et nouvel envoi ; aucun accès de modérateur au contenu privé n’est ajouté.
- `GET /api/media/:id?w=480|960|1920` réévalue les permissions avant toute transformation. Les variantes WebP sont produites à la demande sans agrandissement, sans cache et sans binaire supplémentaire stocké. Téléversement et copie approuvée bornés à 1920×1440. Les URL restent révocables au prochain accès après retrait/suspension ; aucun proxy optimiseur public ne doit conserver ces médias privés.

Validation complémentaire : tests SQLite/HTTP directs dans `tests/backend-suspension-quality.test.ts` ; SQL transactionnel rollback dans `supabase/tests/suspension-unit-quality.sql` et `supabase/tests/conversation-blocks.sql`, sans variables psql et utilisable via MCP. Ces suites ont passé sur PostgreSQL 14 isolé avec stubs Auth/Storage, sans prétendre remplacer la recette Supabase réelle. Migrations 008/009/010 additives ; migrations 001–009 conservées. La portée interlocuteur est vérifiée dans `supabase/tests/interlocutor-blocks.sql` (transaction rollback, deux annonces/fils, rôles inversés, nouveau contact bloqué, tiers refusé, annulation et historique conservés).

### Recherche V1 et curseur v2 (migration 011)

Le catalogue API appelle `gp_catalog_page_v2(p_filters jsonb,p_cursor jsonb,p_limit integer)`. Les RPC précédentes restent disponibles pour compatibilité, tandis que les nouveaux curseurs API ont `version:2` et incluent `areaM2` nullable et `spaceCount` dans leur position. Un ancien curseur v1 doit être remplacé par une nouvelle recherche.

Tous les filtres sont appliqués avant le total, le tri et LIMIT : `priceMin`/`priceMax` en centimes ; `covered=1|0` (couvert et box / extérieur) ; `closed=1|0` (box / autres) ; `occupancy=vacant|occupied|unknown` (absence de donnée = inconnue) ; `level=-20..50` (au moins une place de ce niveau) ; `ids=UUID,UUID` (1–100 identifiants de favoris, triés et dédupliqués). Les filtres existants `q`, `type`, `areaMin`, `scene` restent actifs.

`bbox=ouest,sud,est,nord` accepte le franchissement de l’antiméridien lorsque ouest > est. `center=longitude,latitude` et `radiusKm=0.1..200` sont obligatoires ensemble. Le calcul Haversine utilise exclusivement les coordonnées du payload public assaini, y compris l’arrondi de secteur ; ni la localisation exacte privée, ni `public_location`, ni une source de scène ne sont consultées. La même règle s’applique au filtre bbox.

`sort=area_asc` compare la plus petite surface des places ; dès qu’une surface du lot est inconnue, le lot se classe parmi les surfaces inconnues, en dernier. `sort=spaces_desc` compare le nombre de places décroissant. Les égalités sont départagées par UUID. Ces tris et l’ensemble des filtres, y compris favoris et géométrie, entrent dans l’empreinte du curseur. Les tests `backend-search-v2.test.ts` et `supabase/tests/catalog-v2.sql` vérifient les filtres avant limite, les égalités et surfaces inconnues, le parcours page par page, l’insertion entre pages et la confidentialité du rayon. SQL vérifié en transaction rollback sur PostgreSQL 14 isolé (lecteur de scène nul pour cette suite) ; validation Supabase réelle rapportée séparément par l’intégrateur.

### Profils vendeurs, administration et historique (migration 012)

`sellerType` est une déclaration nullable (`private` / `professional` / `null`) du profil, modifiable lors de l’inscription ou via `PATCH /api/me/profile`. Les profils existants restent non renseignés. Une déclaration de type n’attribue aucun rôle ni privilège ; les rôles restent dans `app_roles`. À chaque soumission, le serveur copie le type actuel dans `sellerTypeSnapshot` du dossier et de la révision. La projection publiée conserve ce snapshot : changer le profil ne modifie pas une ancienne publication et le client ne peut pas imposer le snapshot.

`GET /api/admin/users` est réservé à un administrateur actif et retourne au maximum 100 profils sans email, avec rôle, statut et version. `POST /api/admin/users/:id/decision` exige version et motif (15–2000 caractères), refuse toute modification de son propre compte et protège le dernier administrateur actif. Après025, la politique de modération impose AAL2 en mode connecté. Les décisions concurrentes sont sérialisées et les droits sont revérifiés après le verrou. Suspendre un compte retire atomiquement ses publications et snapshots reprenables, leurs scènes et l’accès public aux médias ; les conversations et révisions restent conservées. Réactiver un compte ne republie aucune annonce. L’approbation d’annonce et la suspension prennent le même verrou de compte avant leurs verrous d’annonce pour éviter une publication concurrente à la suspension.

`GET /api/admin/audit?limit=1..100&cursor=...` fournit uniquement id, acteur, action, cible et date, sans détail libre, corps de message ni secret. `GET /api/conversations/:id/messages?limit=1..100&cursor=...` est réservé aux participants et retourne les derniers messages dans l’ordre chronologique ; `nextCursor` permet de charger la page antérieure, à préfixer dans l’interface. Les deux historiques utilisent `(created_at,id)` comme clé stable et un curseur strict lié à leur périmètre ; un curseur invalide donne 400. Le serveur lit au plus une ligne supplémentaire pour déterminer s’il existe une page suivante.

Tests : `tests/backend-admin-history.test.ts` et `supabase/tests/profiles-admin-history.sql` (rollback, compatible MCP). Profils nulls, snapshot serveur, droits d’administration, refus d’autochangement, conflits de version, suspension/réactivation, journal assaini et pagination de 105 messages avec dates égales ont été vérifiés sur backend local et PostgreSQL isolé ; la recette Supabase réelle est rapportée séparément par l’intégrateur.

### Observations structurées et preuves (migration 014)

`conditionObservations` est une liste de rubriques communes ou propres à une place : identifiant, périmètre, catégorie, description (1000 caractères), commentaire (2000), provenance déclarée, date éventuellement inconnue, photos liées et éventuels plans privés. Une rubrique est unique par catégorie et périmètre ; le serveur refuse toute place étrangère à l’annonce. Les photos doivent appartenir au vendeur et à l’annonce, et être liées à la galerie de la place concernée pour une observation unitaire. Les sources de plan doivent appartenir au même vendeur et à la même annonce.

Le navigateur transmet seulement les champs éditables. `observerId` et `confidenceScope` sont attribués par le serveur ; une attribution inchangée est conservée. Un brouillon peut contenir une provenance encore incomplète, mais la soumission exige une photo pour `photo_documented` et un document pour `plan_derived` dès qu’une observation est renseignée. Toute référence présente est contrôlée, même en brouillon. Une mesure ou une lecture de plan reste une déclaration du vendeur : aucun statut d’expertise ou de certification n’est inventé.

La projection publique utilise des alias pour observations et places, conserve seulement les photos approuvées liées et ne divulgue ni auteur, ni identifiant de plan privé. Les révisions privées conservent leur preuve. Le plan de maintenance inclut des candidats de sources orphelines uniquement à titre de simulation ; toute source mentionnée dans une observation de brouillon, publication ou révision est exclue. Aucune purge supplémentaire n’est activée.

Les formulaires `POST /api/listings` et `PATCH /api/listings/:id` utilisent une limite JSON de 16 Mio, bornée sur le flux réellement reçu ; toutes les autres routes restent à 128 Kio. Tests dédiés : `backend-conditions.test.ts`, y compris un flux de 16 Mio + 1 octet sans Content-Length, et `supabase/tests/condition-observations.sql` (rollback compatible MCP). Compilation et suite SQL vérifiées sur PostgreSQL isolé avec Auth/Storage et lecteur de scène de test ; validation Supabase réelle rapportée par l’intégrateur.

### Détails commerciaux, localisation et aperçu (migration 016)

`commercialDetails` documente code postal, références et type de chaque unité, niveau, provenance et date des dimensions, point limitant, moyens d’accès (inconnus/présents/absents), provenance/année/périmètre des charges et taxes, revenu locatif éventuellement inconnu, légendes et dates de photos. Les documents doivent appartenir au vendeur et à l’annonce, et les métadonnées photo doivent concerner une photo réellement liée. Les preuves encore manquantes peuvent être enregistrées en brouillon ; une provenance de plan ou de document doit être justifiée à la soumission. Les dimensions sont limitées au millimètre de précision.

Un lot `mixed` exige au moins deux places et un type renseigné pour chacune avant soumission. La recherche par type inclut un lot mixte possédant une unité de ce type. `covered=true` exige que toutes les unités soient couvertes ou en box ; `closed=true` exige qu’elles soient toutes en box. `false` exprime l’inverse de ces propriétés de lot complet.

Le point public choisi est conservé dans `publicCoordinates`. En mode secteur, les coordonnées du DTO public et des filtres spatiaux proviennent exclusivement de ce point approuvé ; l’ancien arrondi reste le repli des publications historiques sans point choisi. Aucune coordonnée exacte privée ni adresse de secteur n’est ajoutée au DTO. Une confirmation de localisation est stockée côté serveur avec un hash privé couvrant ville, quartier, adresse, précision et points. Modifier effectivement l’un de ces éléments efface la confirmation, même si une ancienne date de checkbox est renvoyée. Un deuxième PATCH au point inchangé enregistre l’intention avec l’heure serveur. Les sauvegardes ordinaires ne rafraîchissent pas artificiellement cette date. Toute nouvelle soumission exige que le hash corresponde encore ; les anciennes publications restent consultables.

`GET /api/listings/:id/preview` est réservé au propriétaire actif et produit la même projection publique que la publication : alias des unités, point public, observations et photos liées, sans références privées de lot, identifiants de document ni attribution privée. L’aperçu ne rend pas un brouillon public et ne remplace aucune approbation.

Tests : `tests/backend-commercial.test.ts` et `supabase/tests/commercial-details-preview.sql` (rollback compatible MCP). Le parcours de modération local inclut désormais une confirmation explicite séparée de l’édition du point. Tests locaux et PostgreSQL isolé vérifient la confirmation serveur, l’invalidation après changement, les dimensions, le lot mixte, la confidentialité de l’aperçu, les sources et les filtres spatiaux ; la recette Supabase réelle est rapportée séparément par l’intégrateur.
