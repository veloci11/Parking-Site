# Mission 8/15 — accès serveur, rôles, sessions et MFA

Revue indépendante du 22 octobre 2026 sur `codex/build-parking-platform`. Périmètre : frontières Next/API/SDK, buyer/seller/member/moderator/admin, assurance MFA, sessions, contrôle sensible de 033. Aucun serveur, navigateur, SQL, migration ou compte humain n’a été exécuté/modifié par cet agent. Les tests MFA exécutés utilisent une autorité simulée, sans ouvrir de base. Aucun secret lu ou imprimé.

## Résultat

La correction MFA locale est cohérente et ses **3 tests passent**. Aucun contournement buyer/seller vers moderator/admin n’a été établi dans les chemins relus. 033 est validée sur les points demandés OLD+NEW, privilèges opérateur et RLS privées, au SHA `da59c817694fd2244bbd9c7d60c8fbc2566d902a60f0056776ad4b4500b2dac3`.

Un défaut distinct de sérialisation du dernier admin est établi dans le code historique : les changements administratifs et la demande de suppression prennent deux verrous différents. La migration **034 a été appliquée par le coordinateur avec succès** après comparaison des définitions installées, au SHA final ci-dessous ; elle ne modifie aucun compte. La recette SQL est encore en attente. Une reproduction concurrente reste à réaliser par le coordinateur ; ce rapport ne la déduit pas d’un test mono-session.

## Frontières contrôlées et preuves

| Surface | Contrôle effectivement relu | Limite de la preuve |
| --- | --- | --- |
| Identité connectée | `src/server/supabase.ts:166` et `src/server/scenes/context.ts:69` utilisent `auth.getUser()`, puis le rôle de `app_roles` et le statut de `account_statuses`. Le rôle n’est pas tiré des métadonnées utilisateur. Un statut absent/inactif refuse l’accès. | Source, pas de nouvelle connexion Auth effectuée. |
| Buyer/seller | Rôles applicatifs `member`, `moderator`, `admin` ; buyer/seller sont des relations aux annonces/conversations. Les politiques participant/owner et RPC messages/visites contrôlent `auth.uid()` contre ces relations, sans droit automatique de lecture des messages pour un modérateur. | `001:153–161`, `012:67–70`, `supabase/tests/rls.sql` et `profiles-admin-history.sql` relus ; SQL non exécuté ici. |
| Administration | `supabase.ts:491` exige admin après contrôle modération. Les routes entitlements, registre et demandes de modélisation exigent aussi admin ; leurs RPC imposent `gp_admin_allowed()` et AAL2. | Source des handlers et migrations 012/019/022/031. |
| Modération | `supabase.ts:217–225` appelle `requireModerationMfa`; les handlers dédiés utilisent `sceneContext.moderator()` qui appelle `gp_moderation_allowed()`. La base impose rôle, compte actif, email confirmé et AAL2 selon la politique privée. | La migration 025 installe la politique obligatoire ; son état courant doit être vérifié par le coordinateur. |
| MFA obligatoire | `moderation-mfa.ts:24–38` lit toujours `gp_mfa_required`. Une erreur ou valeur non booléenne refuse en 503 ; DB=true ou env=true exige `aal2`. Env=false ne neutralise pas DB=true. | 3 tests exécutés couvrent absent/false/true, AAL1/AAL2, RPC indisponible, valeur malformée et assurance invalide. |
| Accès SDK direct | Les RPC privilégiées portent les contrôles SQL, les tables privées ont RLS, les helpers renommés ont des révocations explicites. La politique 004 remplace les anciennes branches de modération par `gp_moderation_allowed()`. | Lecture de la chaîne des migrations et des recettes RLS/MFA ; aucune requête SDK live exécutée par cet agent. |
| Sessions/CSRF | Cookies connectés HttpOnly/SameSite=Lax et Secure si origine HTTPS ; mutations avec Origin exact. Mode démo limité au loopback. En local, token stocké haché, expiration et compte actif vérifiés à chaque résolution. | `security.ts:48–101`, `supabase.ts:145–159`, `scenes/context.ts:24–49`. |
| Récupération | État HMAC, expiration, compte lié, retour filtré ; grant lié à userId/sessionId et consommé une seule fois en base avant mise à jour du mot de passe. Le changement ordinaire vérifie le mot de passe dans un client séparé. | `auth-grants.ts`, `auth-commands.ts:114–127,243–444`, `018:23–35` ; tests de parcours relus, non exécutés ici car ils ouvrent une DB de test. |

La déconnexion et le changement de mot de passe utilisent `scope:"local"` dans le code connecté. Cette revue ne leur attribue donc pas une fermeture de toutes les sessions. Les contrôles de statut/rôle relisent la base pour les actions applicatives ; la révocation immédiate de tout JWT déjà émis n’a pas été testée.

## 033 — contrôle sensible demandé

- Lignes 183–186 : le trigger examine NEW et concatène OLD pour les UPDATE. Une suppression de référence par renommage/détachement ne retire donc pas l’ancienne référence du contrôle.
- Lignes 189–192 : recherche des jobs prepared/purging/auth_pending, verrou `FOR SHARE` et refus hors prepared. Le verrou entre en conflit avec celui de claim ; la recette SQL contient le renommage d’un objet Storage dont NEW ne comporte plus la référence média.
- Lignes 28–30 : RLS activée sur retention_policies/holds/jobs et aucun droit pour PUBLIC/anon/authenticated.
- Lignes 245–247 : helpers privés et RPC opérateur révoqués à PUBLIC/anon/authenticated ; seuls les RPC opérateur sont accordés à service_role. `retention_service()` ajoute le contrôle de rôle dans les corps.
- L’installation ne crée ni n’active de politique de rétention. Le statut public est borné au reçu/hash existant et ne promet pas `completeErasure:true`.

## Défaut du dernier administrateur et correctif 034

Source initiale : 012 `gp_admin_user_decision` utilise `gp:admin-management` ; 021 `gp_privacy_request_deletion`, renommée `gp_privacy_request_deletion_before_modeling` par 031, utilise `privacy-last-admin`. Avec deux admins actifs A/B, A peut demander sa propre suppression et suspendre B dans deux transactions qui ont toutes deux observé deux admins. Les écritures visent des comptes différents et les verrous historiques ne se rencontrent pas. Impact : absence d’admin actif, nécessitant une réparation opérateur. Prérequis : sessions valides d’un admin, dont une avec réauthentification récente et une AAL2 ; ce défaut ne confère pas des droits admin à un membre.

Migration : `supabase/migrations/20261022134533_last_admin_transition_lock.sql`.

- `gp_admin_user_decision` conserve son verrou existant et revalide `gp_admin_allowed()` après l’attente.
- Le helper privé `gp_privacy_request_deletion_before_modeling` utilise le même verrou et revalide compte actif/réauthentification après l’attente, avant le comptage.
- Le wrapper public 031 reste inchangé, y compris le retrait des notes privées de demandes de modélisation. Les signatures, reçus, grants et données existantes restent conservés.
- Les autres chemins ont été vérifiés : `gp_delete_account()` délègue au wrapper ; 033 traite uniquement les comptes déjà deletion_pending ; le bootstrap 029 promeut un compte vers admin et ne retire aucun admin actif. Les mutations SQL opérateur hors application ne sont pas régies par ces RPC.

SHA 034 final : `1a2f18cc4ef6579d9ec2f9717ee5b2027222c0aa466bb6f4cce0f261ffef3ead`.

Recette : `supabase/tests/last-admin-transition-lock.sql`, SHA `9dd1b7cf7ccc1d6cc86e7fedb7a84b49e9674eb3055e5427864d0b9ee674adfb`. Elle exige une DB jetable sans admin actif préexistant et s’arrête avant toute insertion si ce prérequis manque. Elle termine par ROLLBACK, vérifie même clé/rechecks dans les définitions installées, suspension/réactivation, LAST_ADMIN, acteur deletion_pending refusé, remplacement d’admin, suppression membre, reçus, ACL et nettoyage privé 031. **Non exécutée par cet agent ; coordinateur : DDL réussi, recette toujours en attente**, les fixtures de recette HTTP étaient encore actives à son dernier retour.

## Banc concurrent exact à reprendre par le coordinateur / mission 15

Utiliser deux connexions à la même DB PostgreSQL jetable migrée jusqu’à 034, plus une connexion d’observation. Les fixtures doivent être commitées dans cette DB jetable pour être visibles des deux sessions ; ce banc est distinct de la recette rollback ci-dessus. Recréer une DB jetable neuve pour chaque sens. Ne jamais réutiliser des identités humaines.

1. Insérer deux `auth.users` fictifs A=`f3490000-0000-4000-8000-000000000001` et B=`f3490000-0000-4000-8000-000000000002`, avec noms fixture et email_confirmed_at=now(), puis mettre leurs lignes app_roles à admin. Vérifier exactement deux admins actifs. Aucun autre compte nécessaire.
2. Dans chaque connexion de mutation, `BEGIN; SET LOCAL ROLE authenticated;` puis les claims de A :

```sql
select set_config('request.jwt.claim.sub','f3490000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object(
 'sub','f3490000-0000-4000-8000-000000000001','role','authenticated','aal','aal2',
 'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
```

3. Sens suppression d’abord : S1 appelle `gp_privacy_request_deletion(repeat('a',64))` et conserve la transaction ouverte après retour. S2 appelle `gp_admin_user_decision('f3490000-0000-4000-8000-000000000002',1,'Suspend the synthetic second administrator.','suspended',null)` de façon asynchrone. Nommer les connexions avec application_name permet à l’observateur de constater S2 en `wait_event_type='Lock'`, `wait_event='advisory'` dans pg_stat_activity. Après cette observation, COMMIT S1. S2 doit reprendre puis refuser `MFA_OR_PERMISSION_REQUIRED` ; ROLLBACK S2. Vérifier A=deletion_pending et B=admin actif.
4. Sens administration d’abord, sur DB jetable neuve : S1 appelle la suspension de B et reste ouverte. S2 appelle la suppression de A et doit attendre le verrou advisory. COMMIT S1 après preuve de l’attente. S2 doit reprendre puis refuser `LAST_ADMIN` ; ROLLBACK S2. Vérifier A=admin actif et B=suspended.
5. Dans les deux sens, contrôler les lignes/reçus après transaction, puis supprimer la DB jetable complète. Un simple délai chronométré n’est pas une preuve d’attente ; consigner l’observation pg_stat_activity et les erreurs attendues. La recette mono-session ne remplace pas ce banc.

## Vérifications effectivement réalisées par cet agent

- `./node_modules/.bin/tsx --test tests/moderation-mfa.test.ts` : **3/3**, 0 échec.
- Comparaison textuelle de 034 contre les fonctions historiques : seuls la clé de suppression et les contrôles post-verrou diffèrent ; la fonction corrigée est le helper renommé par 031.
- Aucun build, typecheck global, serveur, navigateur, SQL ou apply effectué par cet agent. Le coordinateur rapporte le succès de l’application DDL de 034 et conserve la recette DB à exécuter ; le lancement public humain reste différé.

## Contre-preuve du coordinateur

La recette034 complète a ensuite réussi sur le vrai projet Supabase, après nettoyage des identités synthétiques : `last_admin_transition_contract_closed=1`, puis `ROLLBACK`. Le commit2d51ec8 contient032/033/034 et leurs trois recettes, exécutées aussi sur le Supabase jetable de la CI. Aucun essai simultané à deux connexions n’est déduit de ces résultats.
