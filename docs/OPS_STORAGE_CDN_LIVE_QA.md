# Reprendre la recette bornée de purge CDN

État : préparation locale seulement. Aucun nouveau compte, objet, appel opérateur, serveur ou changement SQL n’a été créé pour cette préparation. Les rapports historiques221/1,31/1 et224/1 restent inchangés. Le propriétaire déclare disposer de Pro ; la capacité effective de purge reste à vérifier avec la clé locale.

La campagne réutilise `scripts/verify-storage-cache-zero.mjs`, avec un mode distinct. Elle utilise trois nouvelles identités synthétiques `.invalid` (vendeur, acheteur membre, administrateur), une annonce, trois originaux privés et trois copies approuvées. L’administrateur passe un vrai TOTP/AAL2. Aucun signup, email ou compte humain n’est créé par le script. Le coordinateur prépare les seules fixtures après validation de la configuration opérateur.

## Prérequis et fichiers privés

Le coordinateur démarre et confirme le build connecté sur `http://127.0.0.1:3001`. Ne pas démarrer un deuxième serveur ou reconstruire ce checkout pendant la campagne. La base attendue est le projet `srrmysturoloovpuuojp` : refaire l’inventaire réel avant toute mutation ; la dernière campagne nettoyée avait zéro Auth/annonce/Storage et une réservation administrateur intacte.

L’opérateur remplit lui-même `.data/media-operator.env`, déjà ignoré et en0600. Ne jamais afficher son contenu. Seul l’enfant Node de la CLI charge ce fichier ; la sonde ne reçoit pas la clé. La validation ci-dessous vérifie localement le format sans requête distante ni lecture de compte :

```sh
npx tsx scripts/verify-storage-cache-zero.mjs --check-operator-config
```

Si cette validation échoue, ne pas préparer de fixtures distantes. Aucun repli vers une ancienne clé, un JWT utilisateur ou une clé publique n’est autorisé. La CLI exige une secret key et ne change aucune politique Auth/Storage.

Après validation et accord du coordinateur, reprendre le setup synthétique déjà éprouvé : trois UUID neufs, emails `qa-seller-HEX@parking-test.invalid`, `qa-buyer-HEX@parking-test.invalid`, `qa-admin-HEX@parking-test.invalid`, mots de passe aléatoires distincts, insertions Auth/identités bornées, confirmation DB de ces seuls emails et rôle `admin` sur le seul UUID administrateur. Aucun envoi d’email ni modification globale. Refuser un inventaire initial inattendu ; ne jamais réutiliser des comptes nettoyés.

Écrire en0600 `.data/storage-cdn-purge-qa.json`, avec `origin`, `supabaseUrl`, `publishableKey` et `users.seller/buyer/admin`, chacun contenant `id/email/password`. La clé publique de la recette reste distincte de la clé opérateur. Préparer aussi le manifeste exact `.data/storage-cdn-purge-manifest.json` avec `createdAt` et `users:[{id,email}]`, avant la première mutation distante. Les anciens fichiers `storage-cache-*` ne servent pas d’entrée à ce nouveau lot. Conserver tout inventaire interrompu avant de reprendre.

## Une seule campagne

```sh
npx tsx scripts/verify-storage-cache-zero.mjs --run --purge-cdn --execute-reviewed-purge
```

Sans `--run`, la commande ne lit pas le fichier opérateur et ne fait aucun appel. Le mode de purge exige son drapeau explicite supplémentaire. Le script :

1. Connecte les trois identités, établit le facteur administrateur, dépose trois images synthétiques, confirme le secteur, rattache l’annonce au registre puis la fait approuver.
2. Lit deux fois la même URL approuvée avec le même JWT acheteur conservé en mémoire ; exige200 et un cache `HIT` lors de la chauffe. Relève seulement statut, taille, Cache-Control, CF-Cache-Status, Age et Date. Ni URL ni jeton ne sont enregistrés.
3. Retire l’annonce et relève le résultat immédiat du même couple JWT/URL. Un contrôle avec nonce/no-store doit atteindre une origine qui refuse. Un résidu CDN immédiat reste une observation distincte, sans réécriture des échecs historiques.
4. Appelle `purge-public-media-cache.ts` pour préparer son plan en lecture seule. Vérifie l’annonce retirée, son vendeur et les trois médias contre l’inventaire de cette campagne, puis appelle la CLI avec ce fichier, son hash exact et un motif. Les reçus exclusifs restent dans `.data/media-cache-purge/`. Aucun bucket entier, original, plan ou archive n’est ciblé ; aucune suppression ne sert de repli.
5. Compte les acquittements, puis teste le même JWT et la même URL sans nonce ni changement de session. La fenêtre d’observation est bornée à60 secondes après le dernier acquittement, avec départs de lecture espacés de10 secondes maximum et délais réseau bornés. Elle s’arrête dès qu’un refus est observé. Un second contrôle d’origine reste exécuté même si la fenêtre expire sans refus. Une interruption réseau n’est pas assimilée à un refus.
6. Révoque le facteur temporaire et ferme les sessions. Le nettoyage complet ci-dessous reste obligatoire, y compris après refus de la CLI ou échec CDN.

Les nouvelles traces sont `.data/storage-cdn-purge-artifacts.json` (IDs exacts), `.data/storage-cdn-purge-manifest.json`, les plans/reçus privés de purge, puis `docs/qa/storage-cdn-purge-live.json` (rapport assaini, créé seulement lors de l’exécution). `invalidation_queued` prouve seulement la mise en file. Un refus observé prouve le comportement de ce client et du point CDN utilisé ; ni propagation mondiale, ni invalidation des caches navigateur, ni révocation d’octets déjà téléchargés n’est annoncée. Les URL signées ne sont pas testées dans ce lot limité.

Un refus403/offre/clé, un endpoint non pris en charge, une réponse non acquittée ou un état modifié arrête la purge sans repli. Une tentative consommée exige un nouveau plan pour toute reprise, jamais le rejeu d’un reçu. Ne pas relancer la campagne complète pour contourner un échec.

## Nettoyer même en cas d’échec

`scripts/cleanup-storage-cdn-fixtures.ts` reprend le nettoyage exact à trois identités déjà exercé, avec ses propres entrées et sorties. Il ne lit pas la clé opérateur.

```sh
npx tsx scripts/cleanup-storage-cdn-fixtures.ts
```

Cette commande prépare uniquement `.data/storage-cdn-purge-cleanup-plan.json`, `storage-cdn-purge-cleanup-dependencies.sql` et `storage-cdn-purge-cleanup-auth.sql`. Le coordinateur vérifie les trois UUID, le domaine synthétique, l’annonce/site du manifeste et les six chemins, puis applique le premier SQL DML via MCP. Les gardes refusent toute relation avec un tiers extérieur. Auth est conservé pour Storage ; aucune métadonnée Storage n’est supprimée par SQL.

```sh
npx tsx scripts/cleanup-storage-cdn-fixtures.ts --storage --db-rows-removed
```

Le SDK retire les trois originaux avec le vendeur et les trois copies avec l’administrateur/AAL2, vérifie leur absence, révoque son nouveau facteur puis ferme les sessions. Le coordinateur applique ensuite le SQL Auth exact, relève le même inventaire final et confirme zéro reste de cette campagne, MFA toujours requis et réservation administrateur inchangée. Actualiser le rapport avec ces résultats réels avant de retirer les mots de passe et le SQL de setup temporaires. Les plans/reçus restent privés ; ne pas les effacer pour rendre un plan rejouable.

La [documentation officielle](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache) exige Pro et une secret key, décrit la mise en file et annonce une propagation pouvant prendre jusqu’à60 secondes. Aucune mesure distante de ce nouveau lot n’est encore acquise.
