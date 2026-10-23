# Conservation et clôture opérateur —033

État : migration033 appliquée au projet Supabase de recette le22octobre2026, après032. Le coordinateur a exécuté la recette SQL complète sur les vrais schémas Auth/Storage et le validateur PostGIS, avec `retention_finalization_contract_closed=1` puis `ROLLBACK`. La migration ne crée **aucune politique**. Aucun traitement n’est actif sans configuration et validation explicites. Ce document ne fixe aucune durée légale et ne revendique aucun déploiement public.

## Contrat

La table privée `retention_policies` porte une clé, une version immuable, quatre délais en secondes (`account`, `draft`, `media`, `source`), une référence d’approbateur et un motif. Tous les délais sont requis ; aucun défaut180/7/30 jours n’est appliqué. Une nouvelle version est nécessaire pour changer les règles ; une version peut être désactivée. Le chemin033 n’impose pas le délai7jours de l’ancien nettoyage limité021 : une demande `requested` peut être explicitement revue sous sa nouvelle politique.

Une simulation demande un type et1–100 UUID explicites. Elle renvoie l’éligibilité, les blocages, un SHA256 du graphe et le nombre d’objets. Elle ne supprime rien. Les types couvrent :

- `account` : demande de suppression déjà déposée, compte désactivé, revue explicite ; jamais un UUID Auth arbitraire.
- `draft` : brouillon inactif jamais publié/soumis, sans dépendance partagée.
- `media` et `source` : objet orphelin non référencé ; pas un fichier encore attaché à un brouillon, une publication, une révision, un export actif ou une preuve de scène.

La préparation porte sur **une** cible et exige l’empreinte attendue, la politique/version, une référence opérateur, une référence de revue et une référence de traitement des sauvegardes. Le job est durable et idempotent par(type,cible). Préparer un job ne retire aucun fichier.

Les RPC ne sont exécutables que par `service_role`. Les helpers, politiques, holds et jobs restent privés avec RLS et sans grants client. L’application et le navigateur ne reçoivent ni cette clé ni une route d’administration générique. Le worker est un programme opérateur externe ; aucun cron ni lancement automatique n’est installé.

## Exécution et reprise

`prepared → purging → auth_pending → completed` pour un compte ; les autres types passent de `purging` à `completed` après vérification Storage et nettoyage en base.

1. Claim avec version attendue ; la politique doit encore être approuvée, non désactivée, le graphe identique — y compris le SHA256 des métadonnées Storage — et sans conservation bloquante. Bail technique de10minutes, renouvelé aux points de contrôle ; il ne s’agit pas d’une durée de conservation.
2. Avant chaque objet, contrôler politique/hold/bail et l’empreinte de tous les objets planifiés encore présents, puis demander sa suppression à l’API Storage. Un objet absent est accepté pour reprendre après une suppression partielle ; un objet présent mais modifié bloque le worker. Aucun `DELETE storage.objects` dans le worker ou les fonctions de production.
3. La base vérifie l’absence de **tous** les objets planifiés avant de supprimer les métadonnées et les seules dépendances autorisées. Une suppression Storage partielle ne permet pas d’avancer la phase.
4. Pour un compte, appeler l’API Admin Auth seulement après le nettoyage en base. Lire à nouveau Auth après l’appel ; un succès HTTP seul ne prouve pas l’absence.
5. La fonction finale vérifie indépendamment Auth, Storage et les lignes applicatives avant d’émettre le reçu. Le reçu secret de suppression survit au retrait Auth grâce à une référence utilisateur nullable.

Un échec libère le bail, conserve la phase et augmente la version. Relire `gp_retention_job` puis reprendre avec cette version ; les suppressions Storage sont idempotentes et `auth_pending` ne répète pas le nettoyage déjà acquis. Un processus interrompu avant sa libération peut être repris après expiration du bail. Un hold ou une révocation de politique bloque également la reprise. Une mutation concurrente qui tente de créer une référence, de la détacher ou de renommer son objet pendant la purge est refusée ; le trigger vérifie OLD et NEW sur UPDATE, NEW sur INSERT ; les verrous SHARE/UPDATE sérialisent l’apparition d’une référence et le claim.

**Limite distribuée :** Storage, PostgreSQL et Auth ne constituent pas une transaction commune. Un hold arrivé pendant un appel Storage déjà en vol peut laisser une suppression partielle ; il bloque les étapes suivantes et le reçu final. Le système ne prétend pas annuler un fichier déjà supprimé. La reprise et le journal rendent cet état visible.

## Conservations et données partagées

Des holds opérateur versionnés peuvent viser un compte/cible, brouillon, média ou source. Leur ajout/retrait exige motif et version ; les transitions se sérialisent avec les phases SQL. Aucune expiration implicite ne les libère.

Un historique de plan032, même retiré ou remplacé, protège ses sources et ses médias cités. Les scènes, conversations, signalements, favoris d’un tiers, conflits et historiques physiques non résolus protègent également leurs dépendances. Une source téléversée par un tiers, un export ou raster actif et un bucket non reconnu échouent en protection. Le mécanisme ne détruit ni conversation d’autrui, ni preuve historique immuable, ni géométrie partagée pour « réussir » une demande.

Ces cas nécessitent une décision et une procédure de conservation/anonymisation adaptées ; ils restent bloqués et ne sont pas déclarés effacés. Les nouvelles tables ou nouveaux chemins de références doivent intégrer les protections avant d’être ajoutés au produit.

`completed` signifie **absence vérifiée du périmètre actif traité**. Les reçus minimaux, le journal et la rotation externe des sauvegardes restent explicitement distingués : `activeSystemErased:true`, **`completeErasure:false`**. Une référence opérateur de sauvegarde est une pièce de revue, pas une preuve automatique que toutes les copies sont détruites. Aucun reçu « effacement total » n’est émis.

## Programme opérateur

Configuration privée : `GP_RETENTION_SUPABASE_URL` et `GP_RETENTION_SERVICE_ROLE_KEY`, uniquement dans un gestionnaire de secrets/environnement opérateur, jamais dans `NEXT_PUBLIC_*`, Git ou l’application. Vérifier le projet cible. Le fichier de politique externe contient `key`, `version`, `rules` avec les quatre entiers requis, `validated:true`, `operatorReference` et `reason` ; ne pas fournir de chiffres inventés.

```sh
# Valider le fichier local sans accès distant ni mutation.
npx tsx scripts/retention-maintenance.ts --approve-policy --policy-file /chemin/prive/politique.json
# Enregistrer volontairement la politique déjà validée.
npx tsx scripts/retention-maintenance.ts --approve-policy --policy-file /chemin/prive/politique.json --execute
# Simulation bornée, aucune suppression.
npx tsx scripts/retention-maintenance.ts --kind account --ids UUID_DEMANDE --policy CLE --policy-version VERSION
# Préparer une seule cible revue, avec l’empreinte obtenue par simulation.
npx tsx scripts/retention-maintenance.ts --kind account --ids UUID_DEMANDE --policy CLE --policy-version VERSION --prepare --expected-hash SHA256 --operator-reference REFERENCE_OPERATEUR --review-reference REFERENCE_REVUE --backup-reference REFERENCE_SAUVEGARDES --execute
# Lire l’état avant reprise ; aucune mutation par défaut.
npx tsx scripts/retention-maintenance.ts --job UUID_JOB
# Exécuter/reprendre la version précise du job.
npx tsx scripts/retention-maintenance.ts --job UUID_JOB --expected-version VERSION --execute
```

Les sorties CLI ne contiennent ni clé, token/bail, email, corps de document ou chemin Storage privé. Le worker n’accepte aucun booléen client « supprimé » pour clôturer un compte.

## Recette et limites

- `tests/retention-policy.test.ts` : politiques sans défaut, échec/reprise Storage et Auth, post-absence, refus par la base, hold/configuration manquante, chemins invalides, version périmée, idempotence et absence d’appel Auth pour un média.
- `supabase/tests/retention-finalization.sql` : politique absente/invalide/désactivée, durée explicitement fournie, rôle client refusé, dépendance d’un tiers, hold entre phases, empreinte périmée, objets Storage encore présents, Auth encore présent, reprise, reçu conservé et protection des sources historiques032. Les quatre branches account/media/source/draft sont exercées ; versions et baux nulls sont refusés. Transaction annulée.
- La recette033 corrigée sépare deux preuves : présence/fingerprint/verrouillage Storage dans des savepoints annulés, puis clôture SQL d’un graphe sans objet Storage. Le compte synthétique est actif à la création de l’objet inerte, ce qui exécute le vrai quota et son reçu ; il passe `deletion_pending` avant la revue. Aucun `DELETE storage.objects`, paramètre d’autorisation de suppression, trigger désactivé ou rôle replica ne contourne les protections Storage dans ce fixture. L’absence d’objet après rollback est vérifiée avant la branche SQL sans Storage.
- Deux connexions PostgreSQL séparées ont exercé les deux ordres de course pour un favori et un renommage Storage : claim gagnant → insertion/renommage refusé ; référence/renommage gagnant → claim périmé refusé. Une mutation de métadonnée Storage hors trigger, simulée par le superutilisateur uniquement sur une ligne inerte locale, a également été refusée au checkpoint indépendant. Voir `docs/qa/retention-finalization.json`. Les cinq clones de recette ont été supprimés et le seul banc55429 arrêté.
- Le banc PG14 local a de vrais FK/transactions/verrous et SHA256, mais des schémas Auth/Storage de test et d’anciens stubs géographiques/validateurs. Son ancien schéma Storage ne reproduisait pas l’interdiction réelle de suppression SQL et avait masqué cette incompatibilité du fixture. Cette preuve historique reste limitée au banc ; la recette corrigée a ensuite réussi sur le vrai Supabase, protections Storage actives. Les tests du worker utilisent un adaptateur contrôlé.
- Le22octobre2026 à13:50:41UTC, le contrôle du coordinateur après le rollback distant confirme zéro politique/job/hold033, zéro utilisateur synthétique `f33…` et zéro objet Storage dont le chemin correspond à cette fixture. Les autres fixtures en activité restent hors de ce constat. Migration033 : SHA256 `da59c817694fd2244bbd9c7d60c8fbc2566d902a60f0056776ad4b4500b2dac3`, inchangé.
- Aucun compte humain purgé, aucune politique réelle activée, aucune clé de service demandée. La suppression d’octets Storage et la suppression GoTrue par le worker SDK de bout en bout ne sont pas établies par ces recettes SQL ; elles restent un exercice distinct, sur fixtures exclusives avec configuration opérateur autorisée. La suppression transactionnelle d’une ligne Auth synthétique démontre les FK et post-absences, pas un appel Admin Auth.

Sources techniques vérifiées : [supprimer via l’API Storage, pas en SQL](https://supabase.com/docs/guides/storage/management/delete-objects), [Admin Auth deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser). Le changelog Supabase a été relu : les annonces TLS/CBC et versions mineures PostgreSQL pertinentes ne changent pas ce contrat ; le SHA256 utilise la fonction PostgreSQL standard et pas un chiffrement legacy pgcrypto.
