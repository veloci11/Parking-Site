# Exploitation de GP Parking

## Hébergement courant — 22 octobre 2026

Le site a été déployé à la demande du propriétaire sur Ubuntu avec Cloudflare : **https://parking.gilmathis.com**. Voir la [procédure Ubuntu](../deploy/ubuntu/README.md) et la [recette de déploiement](qa/UBUNTU_DEPLOYMENT_2026-10-22.md). Le service `gp-park` utilise Supabase, avec un catalogue réel encore vide et une indexation désactivée. Deux [exemples publics en lecture seule](PUBLIC_SHOWCASE.md) au Raincy sont activés par `GP_PUBLIC_SHOWCASE=true`, sans créer de données ni d’utilisateurs Supabase. La carte et la sélection ont été simplifiées ; voir la [recette actuelle](qa/PUBLIC_SHOWCASE_2026-10-22.md). Les paragraphes suivants décrivent la préparation et les prévisualisations antérieures, pas une absence actuelle d’hébergement. Les opérations humaines et workers non validés restent ouverts.

État au 21 octobre 2026 : prévisualisations locales sur les ports3000(démo) et3001(connecté), migrations Supabase001–027 appliquées au projet de recette et342assertions HTTP connectées réussies dans leur périmètre explicite. Aucun déploiement public ni email réel envoyé. Les preuves, le nettoyage et les limites figurent dans [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Une procédure décrite n’est pas une opération exécutée.

## Deux environnements distincts

**Démonstration locale — port 3000** : Node 24, SQLite persistant dans `.data/gp-demo.sqlite` et fichiers dans `.data`. Les annonces, profils de démonstration et photographies générées sont fictifs. Le serveur de développement écoute `127.0.0.1` ; le backend local refuse les hôtes non locaux. Les boutons de personnages acheteur/vendeur/modération sont des outils de démonstration locale. Ils n’existent pas en environnement Supabase.

**Application connectée — port 3001** : l’URL de projet et une clé publiable configurées ensemble activent l’adaptateur Supabase. L’identité vient de Supabase Auth, les données de PostgreSQL, les fichiers de Storage. La migration ne crée ni comptes de démonstration ni fausses annonces. Aucun nom de rôle ne doit provenir de métadonnées éditables par l’utilisateur. Un déploiement public ne doit jamais exposer le backend SQLite ou les personnages de démonstration.

Les variables de démarrage sont décrites dans `.env.example`, détenu par le coordinateur ; les réglages avancés ci-dessous sont utilisés par les processus concernés :

| Variable                               | Fonction                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL du projet prévu pour cet environnement                                                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publiable Supabase ; l’alternative ancienne est `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                      |
| `GP_FORCE_LOCAL_DEMO`                  | Force la démonstration isolée sur loopback ; ne jamais activer sur une ouverture publique                                                |
| `GP_LOCAL_DEMO`                        | Autorisation supplémentaire pour `next start` en mode production sur loopback uniquement ; pas nécessaire au serveur de développement CI |
| `NEXT_PUBLIC_SITE_URL`                 | Origine canonique de l’application pour les liens et callbacks Auth                                                                      |
| `GP_PUBLIC_LAUNCH`                     | Garde l’ouverture publique désactivée tant que les critères de lancement ne sont pas remplis                                             |
| `GP_DATABASE_PATH`                     | Emplacement du fichier SQLite local                                                                                                      |
| `GP_MEDIA_PATH`                        | Emplacement des médias de démonstration locale                                                                                           |
| `GP_DIST_DIR`                          | Dossier de sortie Next distinct pour les serveurs simultanés                                                                             |
| `GP_REQUIRE_ADMIN_MFA`                 | Contrôle MFA complémentaire côté application ; exemple à `true`. La migration025 impose AAL2 aux modérateurs/administrateurs en base     |
| `NEXT_PUBLIC_MAP_STYLE`                | Style MapLibre ; défaut OpenFreeMap Liberty                                                                                              |

Les clés publiables ne remplacent pas les policies RLS. Les clés administratives, credentials GitHub, secrets SMTP et éventuels secrets de facturation ne doivent pas être placés dans le navigateur, les logs, les fixtures ou Git.

## Démarrage local

Depuis la racine du dépôt, utiliser Node 24 et `npm ci`. Configurer les variables via un fichier `.env.local` ignoré par Git, en reprenant `.env.example`.

Pour garantir la démonstration même si des clés Supabase sont présentes :

```sh
GP_FORCE_LOCAL_DEMO=true npm run dev
```

Ouvrir `http://127.0.0.1:3000`. Un simple `npm run dev` ne force pas SQLite si les variables Supabase sont configurées.

Pour la prévisualisation connectée :

```sh
npm run dev:connected
```

Ouvrir `http://127.0.0.1:3001`. Ce script désactive le forçage démo, fixe cette origine canonique et utilise `.next-connected` pour séparer les sorties Next. Il exige les deux variables Supabase. Ces deux serveurs écoutent sur loopback ; ils ne constituent pas un hébergement public. Vérifier `/api/health` et `/api/session` pour constater le mode effectif, sans imprimer les cookies.

Pour vérifier une livraison : `npm run typecheck`, `npm test`, puis `npm run build`. La CI livre ces mêmes contrôles sous Node 24. La CI démarre ensuite son propre serveur de production sur loopback via `scripts/verify-local-http.ts`, avec une base et des médias temporaires propres au runner, puis exécute les deux parcours HTTP sans les ignorer. Elle arrête seulement ce processus possédé. Le workflow ne contient ni déploiement ni secret ; un build réussi ne prouve ni une migration appliquée, ni la livraison de mails, ni la sécurité d’un environnement distant.

## Préparation d’un environnement Supabase

Utiliser un projet dédié au bon environnement et inventorier son contenu avant mutation. Sur le projet de recette actuel, le coordinateur a appliqué les migrations001–027, du schéma V1 aux plans communs par niveau. La liste exacte figure dans [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). La portée du blocage entre interlocuteurs a été testée sur PostgreSQL réel en transaction annulée après application de 010. Pour un autre environnement, appliquer les fichiers versionnés de `supabase/migrations/` dans leur ordre, après inventaire et relecture. Ne pas réappliquer aveuglément une migration déjà enregistrée et ne pas remplacer une base existante par le schéma de test.

Configurer Supabase Auth : origine du site, URL de redirection de confirmation et récupération, confirmation email, paramètres de mot de passe et anti-abus, SMTP de l’opérateur si nécessaire. En test, employer des identités et boîtes contrôlées. Une boîte locale de démonstration n’est pas un service d’email réel.

Après création légitime d’un premier compte opérateur, attribuer le rôle modérateur/admin depuis une intervention serveur autorisée et auditée. Aucun rôle privilégié ne se crée depuis l’écran de profil. Garder les credentials d’administration hors de l’application publique.

Le TOTP réel est disponible dans `/compte/securite` ; son cycle d’enrôlement/vérification/suppression a été testé sur une identité QA, puis le facteur a été révoqué. **La migration025 définit `gp_private.configuration.mfa_required=true`** : les accès de modération et d’administration connectés exigent AAL2, y compris via RPC/RLS directs. `GP_REQUIRE_ADMIN_MFA=true` dans la configuration d’exemple ajoute le contrôle applicatif. L’ancien constat `false` précède cette migration ; vérifier sa présence et sa valeur dans l’environnement cible après application. Enrôler et vérifier chaque opérateur et organiser la récupération d’accès ; aucun opérateur humain n’est déclaré enrôlé par la migration. La recette `supabase/tests/moderation-mfa-default.sql` vérifie refus AAL1 et droits AAL2 sous transaction annulée. L’exception de démonstration SQLite reste limitée à la boucle locale et ne simule pas de facteur TOTP.

Vérifier séparément les deux types de Storage : originaux/variantes privées et fichiers approuvés. Les fichiers publiables doivent être des variantes assainies ; le traitement enlève les métadonnées EXIF et borne le format et la taille. Les plans sources et les fichiers d’un autre vendeur ne sont jamais publics par simple connaissance de leur URL.

## Vérifications avant ouverture publique

Les rapports actuels [Supabase](qa/supabase-integration.json)(155assertions), [fonctions de compte](qa/account-features.json)(110), [file d’export](qa/privacy-export-integration.json)(11) et [quarantaine des scènes](qa/scenes-integration.json)(66) sont consolidés dans [completion-connected-latest.json](qa/completion-connected-latest.json). Ils ne prouvent ni un worker distant d’archive/rasterisation, ni une livraison email, ni un parking réel. Les fixtures et leur facteur TOTP ont été retirés puis leur absence vérifiée ; voir [nettoyage](qa/completion-cleanup.json).

L’ouverture n’est considérée prête qu’après une recette sur l’environnement réellement retenu :

1. Inscrire deux comptes vendeurs distincts et un acheteur de test ; confirmer leurs emails.
2. Déposer un brouillon avec une photo réelle de recette autorisée ; vérifier qu’un tiers ne peut lire ni brouillon, média privé, adresse exacte masquée ou conversation.
3. Soumettre, demander une correction, soumettre la nouvelle version puis approuver. Une modification d’une annonce déjà publiée doit préserver l’ancienne publication jusqu’à approbation.
4. Vérifier les appels directs aux RPC, REST et Storage, en plus des parcours à l’écran. Tenter un rôle arbitraire et un identifiant d’une autre identité doit échouer.
5. Chercher, filtrer et comparer une place et un lot : le prix est le total du lot ; une surface inconnue ne devient jamais zéro et n’est pas admise par un filtre minimal actif.
6. Créer une conversation et une demande de visite. Sans horaire validé, une visite acceptée reste « À organiser ». Un double envoi avec même identifiant ne duplique pas le message.
7. Marquer un bien vendu : sa recherche/contact actif cesse immédiatement et les conversations existantes restent consultables par leurs participants.
8. Tester sans WebGL, en cas de tuiles indisponibles, sur mobile et au clavier. La liste, la fiche, les photos et le plan SVG 2D sont les replis livrés ; une annonce sans scène reste un cas catalogue normal. Compléter les vérifications ciblées par lecteur d’écran, zoom 200 % et mesures de performance terrain.
9. Vérifier qu’aucune fixture n’est présentée comme offre réelle et qu’aucun paiement n’est actif.
10. Vérifier les documents d’opérateur, disponibilités de marque, droits sur les photos/plans, sauvegarde restaurable et supervision.

Les annonces en localisation de secteur ne publient pas une scène intérieure ou une identité canonique partagée. Le registre connecté accepte des sources privées, une calibration, une correspondance des places et une revue par une autre identité que le créateur. Sa recette actuelle porte sur un modèle fictif ; elle ne valide pas la fidélité d’un parking réel. Un premier parking réel demande plan autorisé, mesures croisées, photos datées, correspondance des numéros et revue documentée. Aucun rendu 3D généré ne constitue une preuve de l’état du bien.

## Compléments fonctionnels V1

Avant connexion, `/deposer` permet une préparation explicite dans `sessionStorage` : titre, ville, type et quantité uniquement. Aucun compte/session n’est simulé et aucun média ou adresse précise n’est conservé. Le transfert vers un nouveau brouillon privé est demandé après authentification ; la copie locale est effacée après réponse serveur. La vente partielle conduit à corriger les places restantes et le prix total, puis à une nouvelle modération, sans prorata automatique.

La qualité commune et celle de chaque place sont distinctes, avec date et origine déclarée ; aucune preuve certifiée n’est déduite d’un document déclaré ou d’une photo. Les modérateurs peuvent suspendre une publication avec motif/version. Les échanges peuvent être bloqués/débloqués ; historique et annulation restent accessibles. Vérifier ces droits après toute modification des migrations.

Les favoris retirés affichent une indisponibilité, le retour conserve le contexte et les pages publiques revalident leur état toutes les 30 secondes. Les variantes `?w=` passent par la route média autorisée, utilisée par `SafePhoto`, pour préserver les droits lors d’un retrait ; ne pas placer un cache d’images public durable devant une URL média privée ou révocable.

## Notifications et tâches de fond

La boîte interne `/compte/notifications`, les non-lus et les préférences sont persistés et testés. Les événements email sont conservés dans une outbox. Le worker `scripts/process-notifications.ts` est livré, avec prévisualisation par défaut : **aucun email réel n’a été envoyé dans cette recette**. Les emails de confirmation/récupération relèvent séparément de Supabase Auth.

Pour une prévisualisation locale, charger uniquement les variables de cet environnement puis exécuter :

```sh
npx tsx scripts/process-notifications.ts --local
```

Pour une prévisualisation Supabase, retirer `--local` et fournir au processus serveur `GP_WORKER_SUPABASE_URL` (ou l’URL publique du projet) et `GP_WORKER_SERVICE_ROLE_KEY`. Cette clé privilégiée appartient uniquement au worker, jamais au navigateur ni à Git. Le script n’est pas un service automatiquement planifié.

La prévisualisation écrit des fichiers privés `.eml` et des résumés dans `.data/notification-previews`, et renseigne `previewed_at` ; elle n’est donc pas une opération sans écriture. Son résultat `preview_not_sent` ne signifie pas « envoyé ». Les `.eml` contiennent le destinataire et le contenu : ne pas les publier ni les inclure dans des rapports publics.

Un envoi nécessite simultanément l’option `--send`, `GP_EMAIL_DELIVERY=enabled`, une origine canonique HTTPS et les paramètres `GP_SMTP_HOST`, `GP_SMTP_PORT`, `GP_SMTP_USER`, `GP_SMTP_PASSWORD`, `GP_SMTP_FROM`. Leur activation et la planification du worker restent à effectuer après recette avec boîtes contrôlées. Le code gère acquisition sous bail, reprises, erreurs et préférences du destinataire. Une acceptation SMTP suivie d’un arrêt avant acquittement peut laisser un état `uncertain` : vérifier avant relance, sans promettre une livraison exactement une fois. Surveiller les baux expirés, les erreurs permanentes et la file d’échec. Un acquittement SMTP ne prouve pas l’arrivée en boîte de réception.

L’export/suppression de compte et le nettoyage de fichiers nécessitent également une politique de conservation et une supervision. Les demandes durables ou désactivations de compte ne doivent pas être présentées comme des purges complètes de tous les historiques, sauvegardes et obligations de conservation.

## Sauvegarde et restauration

L’outil `scripts/backup-project.ts` est livré : export PostgreSQL + inventaire/téléchargement Storage, hashes, vérification et plan de restauration vers un autre projet. Suivre [OPS_BACKUP.md](OPS_BACKUP.md) pour les secrets opérateur, commandes et limites. Les tests utilisent des fichiers locaux inertes ; aucun export/restauration distant n’a été exécuté par cet outil. La restauration des schémas gérés par Supabase reste manuelle et doit être validée sur environnement isolé.

**En local**, arrêter le processus possédant SQLite avant une copie simple, ou utiliser une sauvegarde SQLite cohérente. Ne pas copier seulement le fichier principal pendant des écritures WAL. Sauvegarder aussi le dossier des médias. Traiter la copie comme privée : elle peut contenir emails, brouillons, sessions hashées et tokens de boîte de démonstration. Restaurer d’abord dans un emplacement isolé et confirmer qu’aucun destinataire externe n’est utilisé.

**Pour Supabase**, sauvegarder PostgreSQL **et** les objets Storage, avec les clés d’objets nécessaires au rapprochement. Une sauvegarde SQL ne contient pas le contenu binaire des photos et modèles. Consigner date, périmètre, versions applicatives/migrations, chiffrements et accès. RPO 24 h/RTO 8 h restent des cibles proposées jusqu’à mesure d’une restauration réelle. Aucune restauration complète du projet de recette n’est déclarée effectuée.

Tester la restauration dans un environnement isolé : compte, annonce, version publiée, galerie privée/publique, conversation et fichier correspondant. Une restauration n’est réussie que si la recette permet de retrouver ces objets et vérifie les droits. Aucune suppression massive d’objets orphelins sans sélection à blanc et conservation des références utilisées par une autre annonce.

## Incidents et retours arrière

Pour fuite suspectée : limiter les accès concernés, conserver les traces utiles, révoquer les sessions/credentials exposés et analyser le périmètre. Ne pas supprimer les pièces d’incident avant examen. Pour problème de tuile, garder les listes fonctionnelles et proposer réessai ou un fournisseur de carte configurable.

Privilégier une version applicative précédente compatible et des migrations additives. Un rollback ne doit pas supprimer les annonces récentes ou remettre une ancienne disponibilité de bien vendu. Documenter toute intervention et revérifier un visiteur anonyme, un vendeur propriétaire et un tiers.

## Suivi minimal

Surveiller erreurs HTTP/serveur, échecs de traitement d’images, backlog et ancienneté de l’outbox, refus d’accès anormaux, quotas de stockage, erreurs du fournisseur de carte et santé des sauvegardes. Nommer un opérateur pour modération et signalements. Son identité, les mentions légales et les droits sur les documents restent à compléter avant ouverture ; ce document ne constitue pas une validation juridique ou une conformité complète. Ne pas inscrire de données privées dans un tableau analytique public.

Les forfaits mensuels appartiennent à la V2. Aucun prix ni compte Stripe n’est activé ici. Les tarifs commerciaux, taxes et modalités seront validés avant les tests de facturation.

## Références d’intégration

- [GitHub Actions checkout](https://github.com/actions/checkout) et [setup-node](https://github.com/actions/setup-node), versions de tags vérifiées puis commits épinglés dans la CI.
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control).
- [OpenFreeMap](https://openfreemap.org/quick_start/) pour le style et les attributions.
