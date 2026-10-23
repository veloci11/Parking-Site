-- 018 isolated fixture checks. No Auth network call, no email. Always rollback.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f1800000-0000-4000-8000-000000000001','{"name":"QA Accepted","termsAccepted":true,"termsVersion":"2026-10-21-v1-preparation","privacyVersion":"2026-10-21-v1-preparation"}',now()),
('f1800000-0000-4000-8000-000000000002','{"name":"QA Legacy"}',now()),
('f1800000-0000-4000-8000-000000000003','{"name":"QA Obsolete","termsAccepted":true,"termsVersion":"obsolete","privacyVersion":"obsolete"}',now());
select 1/((select count(*)=1 from terms_acceptances where user_id::text like 'f1800000-%')::integer) as signup_exact_version_only;
update auth.users set raw_user_meta_data='{"termsAccepted":false}' where id='f1800000-0000-4000-8000-000000000001';
select 1/((select count(*)=1 from terms_acceptances where user_id='f1800000-0000-4000-8000-000000000001' and source='signup_declaration')::integer) as later_metadata_cannot_erase_acceptance;
set local role anon;
select 1/((gp_auth_policy()->>'termsVersion'='2026-10-21-v1-preparation')::integer) as public_policy_readable;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1800000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f1800000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1","session_id":"f1810000-0000-4000-8000-000000000001"}',true);
select 1/(((gp_terms_status()->>'accepted')::boolean=false)::integer) as legacy_not_auto_accepted;
select 1/((select count(*)=0 from terms_acceptances)::integer) as outsider_no_other_consent;
do $$begin
 begin perform gp_accept_terms('obsolete','obsolete',true);raise exception 'Expected TERMS_VERSION_CHANGED';exception when others then if sqlerrm<>'TERMS_VERSION_CHANGED' then raise;end if;end;
 begin perform gp_accept_terms('2026-10-21-v1-preparation','2026-10-21-v1-preparation',null);raise exception 'Expected TERMS_VERSION_CHANGED';exception when others then if sqlerrm<>'TERMS_VERSION_CHANGED' then raise;end if;end;
 begin perform gp_consume_recovery_grant(null,'f1810000-0000-4000-8000-000000000001');raise exception 'Expected REAUTH_REQUIRED';exception when others then if sqlerrm<>'REAUTH_REQUIRED' then raise;end if;end;
 begin perform gp_consume_recovery_grant('f1820000-0000-4000-8000-000000000001','f1810000-0000-4000-8000-000000000002');raise exception 'Expected REAUTH_REQUIRED';exception when others then if sqlerrm<>'REAUTH_REQUIRED' then raise;end if;end;
end;$$;
select 1/(((gp_accept_terms('2026-10-21-v1-preparation','2026-10-21-v1-preparation',true)->>'accepted')::boolean)::integer) as authenticated_explicit_consent;
select gp_accept_terms('2026-10-21-v1-preparation','2026-10-21-v1-preparation',true);
select 1/((select count(*)=1 from terms_acceptances)::integer) as consent_retry_deduplicated;
select gp_consume_recovery_grant('f1820000-0000-4000-8000-000000000001','f1810000-0000-4000-8000-000000000001');
do $$begin
 begin perform gp_consume_recovery_grant('f1820000-0000-4000-8000-000000000001','f1810000-0000-4000-8000-000000000001');raise exception 'Expected RECOVERY_GRANT_USED';exception when others then if sqlerrm<>'RECOVERY_GRANT_USED' then raise;end if;end;
 begin perform nonce from gp_private.auth_grant_consumptions;raise exception 'Expected denied';exception when insufficient_privilege then null;end;
 begin insert into terms_acceptances(user_id,terms_version,privacy_version,source) values(auth.uid(),'x','x','authenticated_declaration');raise exception 'Expected denied';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select 1/((select count(*)=1 from gp_private.auth_grant_consumptions where user_id='f1800000-0000-4000-8000-000000000002')::integer) as one_consumption_only;
select 1/((not has_function_privilege('anon','public.gp_consume_recovery_grant(uuid,uuid)','execute') and not has_table_privilege('authenticated','gp_private.auth_grant_consumptions','select') and not has_table_privilege('authenticated','public.terms_acceptances','insert'))::integer) as direct_privileges_denied;
rollback;
