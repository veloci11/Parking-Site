# Recette HTTP connectée des offres et demandes manuelles

`scripts/verify-connected-offers-modeling.ts` exerce les routes du build de production local connecté au vrai Supabase. Cette recette est distincte du parcours SQLite et des recettes SQL en transaction annulée. Elle ne démarre aucun serveur, ne crée pas de compte, n’envoie aucun email, ne change pas de rôle ou de politique Auth et n’applique pas de SQL.

Le coordinateur prépare cinq nouvelles identités fictives `.invalid`, avec un mot de passe aléatoire différent pour chacune et les rôles membre/membre/membre/modérateur/administrateur. La confirmation d’email de ces seules fixtures est préparée directement dans Auth ; la réception d’un email d’inscription n’est donc pas testée. Aucun opérateur humain n’est créé et la réservation privée du premier administrateur reste intacte.

La configuration `.data/supabase-qa.json` est ignorée par Git et protégée en0600. Elle porte `origin`, `supabaseUrl`, `publishableKey`, puis `users.seller/buyer/outsider/moderator/admin`, chacun avec `id/email/password`. Le manifeste privé `.data/completion-qa-manifest.json` identifie exactement cette nouvelle campagne. Aucune clé de service n’est nécessaire à la recette. Ne jamais afficher ces fichiers ni réutiliser les identifiants d’une campagne nettoyée.

Avant la première mutation, le coordinateur relève les comptes Auth, annonces, publications, demandes, objets Storage, migrations et réservation administrateur. La première campagne a commencé avec zéro compte, annonce, publication, demande ou objet,31 migrations et une réservation non réclamée. La campagne finale est repartie du même inventaire vide avec34 migrations et la réservation inchangée. Son setup est borné à cinq identités synthétiques sur le projet de recette ; les protections globales restent inchangées.

Après démarrage coordonné du build connecté sur `http://127.0.0.1:3001`, exécuter :

```sh
npx tsx scripts/verify-connected-offers-modeling.ts --run
```

Sans `--run`, le script affiche seulement la commande. Il refuse une configuration publique, un autre projet, des emails non synthétiques et l’écrasement d’un inventaire contenant déjà des annonces ou médias. L’inventaire `.data/connected-offers-modeling-artifacts.json` est enregistré après chaque création et recopié dans le format de l’outil de nettoyage existant. Une exécution interrompue ne doit pas être relancée en perdant cet inventaire : nettoyer son graphe exact d’abord.

Le parcours prévu couvre les connexions GoTrue et cookies, le refus AAL1 puis un vrai enrôlement/défi TOTP pour les deux rôles privilégiés, les refus d’accès du tiers et du modérateur à la file de modélisation, et les permissions directes PostgREST/Storage. Les cinq places ont trois ventes et deux loyers mensuels. Un second lot distinct permet de vérifier prix contextuel, surface/niveau sur la même offre, total avant limite, tri et curseur sans doublon. Les six photos sont synthétiques et sont téléversées par l’API ; les originaux privés sont refusés au tiers, le retrait ferme l’accès applicatif et les nouvelles lectures à l’origine. La révocation immédiate des octets déjà servis par le CDN n’est pas garantie ; ce contrôle reste distinct et peut échouer.

Les demandes manuelles vérifient note privée bornée, absence d’attribution client, réessai idempotent, version optimiste, états en préparation/prêt/refusé et export propriétaire. `ready` doit laisser la révision commerciale en attente et ne créer aucune source, scène ou plan commun. Les révisions de prix/statut passent par la modération et réutilisent les liens physiques déjà validés. Le retrait et la conservation de la conversation sont vérifiés avant nettoyage.

Le rapport assaini est `docs/qa/connected-offers-modeling.json`. Il ne contient aucun cookie, mot de passe, secret TOTP ou jeton. Une réussite HTTP avant nettoyage porte explicitement `passed-pending-exact-fixture-cleanup`. Le premier essai a été conservé séparément dans `connected-offers-modeling-initial.json` :37 contrôles réussis avant un arrêt sur la route de modération AAL1. Le correctif de politique MFA doit être présent dans le build avant la relance ; ce préfixe ne constitue pas une réussite de la suite.

Le coordinateur prépare ensuite le nettoyage existant :

```sh
npx tsx scripts/cleanup-completion-fixtures.ts
```

Cette commande génère uniquement un plan et deux fichiers SQL privés. Avant de les exécuter via MCP, vérifier les cinq UUID et le domaine fictif, le graphe de dépendances, les annonces et sites créés, les objets exacts et l’absence de relations avec un tiers extérieur à la campagne. La suppression SQL des dépendances conserve Auth pour le nettoyage Storage ; elle ne supprime aucune métadonnée Storage directement.

Après application du fichier de dépendances revu, le SDK Storage retire uniquement les noms du plan :

```sh
npx tsx scripts/cleanup-completion-fixtures.ts --storage --db-rows-removed
```

Ce nettoyage établit son propre facteur TOTP temporaire de modérateur, le révoque puis ferme les sessions. Le second fichier SQL ne supprime les cinq identités Auth qu’après refus de tout reste applicatif ou Storage. Relever ensuite le même inventaire global et le graphe exact, vérifier zéro reste de fixture et la réservation administrateur inchangée. La fermeture des serveurs et le sort des fichiers privés de cette campagne restent coordonnés séparément.

## Résultat exécuté et limite constatée

La dernière campagne sur le build de production actuel a exécuté **225 contrôles :224 réussis et un échec CDN conservé**. La lecture de conversation après retrait retourne200, le suivi privé de la demande reste `ready`, et la lecture Storage atteignant l’origine avec nonce/no-store est refusée. Le même jeton peut encore relire les octets déjà mis en cache sur l’URL Storage initiale. Cet échec reste faux dans le rapport et maintient une sortie1 ; il est collecté jusqu’à la fin de la section pour que les deux contrôles suivants soient effectivement exécutés. Aucun nouveau correctif produit ni assouplissement de politique n’a été appliqué pour ce dernier lot. Voir [le rapport final](qa/connected-offers-modeling.json).

Les cinq nouvelles identités, deux annonces, deux parkings, six originaux et six copies approuvées ont ensuite été retirés par le nettoyage exact. Le SELECT réel du22 octobre à14:27UTC confirme zéro compte Auth, annonce, objet Storage, demande, scène, source, conversation, message ou facteur ; MFA reste requis et la réservation privée non réclamée vaut1. Les mots de passe et le SQL de setup temporaires ont été retirés après vérification. [L’inventaire final](qa/connected-offers-modeling-inventory.json) conserve les comptes avant/après et le résultat du SDK Storage.

La première campagne complète, conservée dans [le rapport historique221](qa/connected-offers-modeling-221.json), a réussi **221 contrôles et échoué sur une assertion** : le SDK Storage relit encore une copie approuvée déjà mise en cache après le retrait. La fiche est404, le catalogue est vide et le proxy photo refuse bien l’accès. Un repro dédié établit qu’avec le même membre AAL1 et le même jeton, l’URL initiale retourne200 `CF HIT` avec `private,max-age=3600`, tandis qu’un nonce et `no-store` atteignent l’origine et sont refusés400 `CF BYPASS`. Un nouveau login est également refusé. Ce résultat ne démontre pas un bypass RLS permanent ; il laisse ouverte la révocation immédiate des octets déjà en cache. Voir [la preuve](qa/withdrawal-storage-cache.json).

Les connexions GoTrue, les deux TOTP réels, les refus AAL1, les cinq offres individuelles, les protections de notes et rôles, l’export propriétaire, le tri/total/curseur entre deux annonces, les révisions commerciales sans nouveau rapprochement et les deux retraits ont été exercés. Dans cette campagne historique, les deux contrôles placés après l’assertion en échec n’ont pas été exécutés : lecture de conversation et suivi privé après retrait. Aucun bilan « toute la suite réussie » n’est annoncé.

La création de nouvelles copies approuvées utilise désormais `cacheControl:"0"`. La sonde dédiée sur le nouveau build confirme le header `private,max-age=0` sur une copie neuve, mais le même jeton et la même URL donnent encore200 `CF HIT` après retrait ; l’origine avec nonce/no-store refuse400. La mesure seule ne clôt donc pas cette limite. [La preuve cache zéro](qa/storage-cache-zero.json) conserve cet échec et le nettoyage complet des trois nouvelles identités, deux brouillons suivis et six objets. Elle ne modifie pas les copies existantes et ne révoque pas rétroactivement les octets déjà téléchargés ou mis en cache. Le script conserve l’assertion de refus immédiat et ajoute un contrôle distinct de l’origine avec nonce/no-store ; il ne transforme pas l’échec observé en succès.

Le nettoyage exact a terminé sur le vrai service : cinq identités Auth, deux annonces et deux sites supprimés ; six originaux et six copies approuvées retirés par le SDK Storage ; tous les facteurs temporaires révoqués. Le SELECT final confirme zéro compte, publication, demande, média, objet, site, niveau, place, lien, scène, source, conversation, message ou facteur de cette campagne. La politique MFA est toujours vraie et la réservation administrateur non réclamée vaut toujours1. Les migrations sont maintenant34, appliquées séparément par le coordinateur. Les mots de passe temporaires ont été retirés du workspace après cette vérification. [L’inventaire historique](qa/connected-offers-modeling-inventory-221.json) distingue ce nettoyage des221 contrôles HTTP et des journaux internes du fournisseur.

Aucune génération de modèle, rasterisation, construction d’archive ZIP distante, livraison d’email, donnée de parking réel ou mise en ligne publique ne découle de cette recette.
