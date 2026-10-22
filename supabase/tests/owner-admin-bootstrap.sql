-- Synthetic email/account fixtures only; the entire transaction is rolled back.
begin;
insert into gp_private.owner_admin_bootstrap(email_sha256,reason)
values(encode(sha256(convert_to('owner-bootstrap-qa@test.invalid','UTF8')),'hex'),'Recette isolée : propriétaire initial autorisé.');
insert into auth.users(id,email,raw_user_meta_data) values
('f2900000-0000-4000-8000-000000000001','owner-bootstrap-qa@test.invalid','{"name":"Owner fixture","role":"admin"}');
select 1/((select role='member' from app_roles where user_id='f2900000-0000-4000-8000-000000000001')::integer) as email_confirmation_required;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('f2900000-0000-4000-8000-000000000002','outsider-bootstrap-qa@test.invalid',now(),'{"name":"Member fixture","role":"admin","email":"owner-bootstrap-qa@test.invalid"}');
select 1/((select role='member' from app_roles where user_id='f2900000-0000-4000-8000-000000000002')::integer) as user_metadata_never_grants_admin;
update auth.users set email_confirmed_at=now() where id='f2900000-0000-4000-8000-000000000001';
select 1/((select role='admin' from app_roles where user_id='f2900000-0000-4000-8000-000000000001')::integer) as verified_reserved_owner_is_admin;
select 1/((select claimed_by='f2900000-0000-4000-8000-000000000001' and claimed_at is not null from gp_private.owner_admin_bootstrap where email_sha256=encode(sha256(convert_to('owner-bootstrap-qa@test.invalid','UTF8')),'hex'))::integer) as reservation_is_consumed;
select 1/((not gp_private.claim_owner_admin('f2900000-0000-4000-8000-000000000001'))::integer) as reservation_is_one_time;
select 1/((select count(*)=1 from audit_events where actor_id='f2900000-0000-4000-8000-000000000001' and action='account.owner_admin_bootstrap')::integer) as grant_is_audited_once;
insert into gp_private.owner_admin_bootstrap(email_sha256,reason)
values(encode(sha256(convert_to('second-owner-qa@test.invalid','UTF8')),'hex'),'Recette isolée : aucun second propriétaire automatique.');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('f2900000-0000-4000-8000-000000000003','second-owner-qa@test.invalid',now(),'{"name":"Second fixture"}');
select 1/((select role='member' from app_roles where user_id='f2900000-0000-4000-8000-000000000003')::integer) as existing_admin_prevents_second_bootstrap;
update account_statuses set status='suspended' where user_id='f2900000-0000-4000-8000-000000000001';
insert into gp_private.owner_admin_bootstrap(email_sha256,reason,created_at,expires_at)
values(encode(sha256(convert_to('expired-owner-qa@test.invalid','UTF8')),'hex'),'Recette isolée : réservation expirée.',now()-interval '3 days',now()-interval '2 days');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('f2900000-0000-4000-8000-000000000004','expired-owner-qa@test.invalid',now(),'{"name":"Expired fixture"}');
select 1/((select role='member' from app_roles where user_id='f2900000-0000-4000-8000-000000000004')::integer) as expired_reservation_never_grants_admin;
select 1/((not has_table_privilege('authenticated','gp_private.owner_admin_bootstrap','select')
and not has_table_privilege('authenticated','gp_private.owner_admin_bootstrap','insert')
and not has_function_privilege('authenticated','gp_private.claim_owner_admin(uuid)','execute')
and not has_function_privilege('anon','gp_private.apply_owner_admin_bootstrap()','execute'))::integer) as bootstrap_is_private;
rollback;
