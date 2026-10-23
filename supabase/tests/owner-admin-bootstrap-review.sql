-- Independent 029 review. Synthetic fixtures only; no operator reservation is read.
-- Run on an isolated empty-identity test database, like owner-admin-bootstrap.sql.
begin;
insert into gp_private.owner_admin_bootstrap(email_sha256,reason) values
(encode(sha256(convert_to('normalized-owner-review@test.invalid','UTF8')),'hex'),'Revue isolée : propriétaire autorisé et email normalisé.'),
(encode(sha256(convert_to('suspended-owner-review@test.invalid','UTF8')),'hex'),'Revue isolée : compte suspendu, aucun droit accordé.'),
(encode(sha256(convert_to('second-owner-review@test.invalid','UTF8')),'hex'),'Revue isolée : second propriétaire automatique refusé.');
insert into gp_private.owner_admin_bootstrap(email_sha256,reason,created_at,expires_at) values
(encode(sha256(convert_to('expired-owner-review@test.invalid','UTF8')),'hex'),'Revue isolée : expiration ferme de la réservation.',now()-interval '2 days',now()-interval '1 day');
insert into auth.users(id,email,raw_user_meta_data) values
('f2930000-0000-4000-8000-000000000001','Normalized-Owner-Review@Test.Invalid','{"name":"Normalized review","role":"admin"}'),
('f2930000-0000-4000-8000-000000000002','suspended-owner-review@test.invalid','{"name":"Suspended review"}');
update account_statuses set status='suspended' where user_id='f2930000-0000-4000-8000-000000000002';
update auth.users set email_confirmed_at=now() where id='f2930000-0000-4000-8000-000000000002';
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('f2930000-0000-4000-8000-000000000003','expired-owner-review@test.invalid',now(),'{"name":"Expired review"}');
select 1/((not gp_private.claim_owner_admin(null)
and not gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000001')
and not gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000002')
and not gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000003')
and not exists(select 1 from app_roles where role='admin'))::integer) as verified_active_unexpired_identity_required;

set local role anon;
do $review$ begin
  begin perform 1 from gp_private.owner_admin_bootstrap;raise exception 'BOOTSTRAP_TABLE_READ_BYPASS';exception when insufficient_privilege then null;end;
  begin perform gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000001');raise exception 'BOOTSTRAP_CLAIM_BYPASS';exception when insufficient_privilege then null;end;
end;$review$;
reset role;
do $review$ begin perform set_config('request.jwt.claims','{"sub":"f2930000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);end;$review$;
set local role authenticated;
do $review$ begin
  begin perform 1 from gp_private.owner_admin_bootstrap;raise exception 'BOOTSTRAP_TABLE_READ_BYPASS';exception when insufficient_privilege then null;end;
  begin perform gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000001');raise exception 'BOOTSTRAP_CLAIM_BYPASS';exception when insufficient_privilege then null;end;
  begin update public.app_roles set role='admin' where user_id='f2930000-0000-4000-8000-000000000001';raise exception 'BOOTSTRAP_ROLE_WRITE_BYPASS';exception when insufficient_privilege then null;end;
  begin update auth.users set email_confirmed_at=now() where id='f2930000-0000-4000-8000-000000000001';raise exception 'BOOTSTRAP_EMAIL_CONFIRMATION_BYPASS';exception when insufficient_privilege then null;end;
end;$review$;
reset role;

update auth.users set email_confirmed_at=now() where id='f2930000-0000-4000-8000-000000000001';
select 1/((select role='admin' from app_roles where user_id='f2930000-0000-4000-8000-000000000001')::integer) as normalized_verified_email_is_accepted;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('f2930000-0000-4000-8000-000000000004','second-owner-review@test.invalid',now(),'{"name":"Second review"}');
select 1/((select count(*)=1 from app_roles where role='admin')::integer) as exactly_one_admin_with_two_valid_reservations;
select 1/((not gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000001')
and not gp_private.claim_owner_admin('f2930000-0000-4000-8000-000000000004')
and (select count(*)=1 from audit_events where action='account.owner_admin_bootstrap' and actor_id in('f2930000-0000-4000-8000-000000000001','f2930000-0000-4000-8000-000000000004')))::integer) as grant_consumption_and_audit_are_single_use;
select 1/((not has_schema_privilege('anon','gp_private','usage')
and not has_schema_privilege('authenticated','gp_private','usage')
and not has_function_privilege('anon','gp_private.claim_owner_admin(uuid)','execute')
and not has_function_privilege('authenticated','gp_private.claim_owner_admin(uuid)','execute')
and not has_function_privilege('anon','gp_private.apply_owner_admin_bootstrap()','execute')
and not has_function_privilege('authenticated','gp_private.apply_owner_admin_bootstrap()','execute')
and not has_table_privilege('anon','gp_private.owner_admin_bootstrap','select,insert,update,delete,truncate')
and not has_table_privilege('authenticated','gp_private.owner_admin_bootstrap','select,insert,update,delete,truncate'))::integer) as owner_admin_bootstrap_review_closed;
rollback;
