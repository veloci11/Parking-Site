-- 025: isolated identities, no Auth network calls or TOTP secrets, always rollback.
-- Do not toggle mfa_required here: this tests the value installed by the migration.
begin;
select 1/(coalesce((select value='true'::jsonb from gp_private.configuration where key='mfa_required'),false)::integer) as moderation_mfa_enabled_by_default;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f2510000-0000-4000-8000-000000000001','{"name":"MFA Member QA"}',now()),
('f2510000-0000-4000-8000-000000000002','{"name":"MFA Moderator QA"}',now()),
('f2510000-0000-4000-8000-000000000003','{"name":"MFA Admin QA"}',now()),
('f2510000-0000-4000-8000-000000000004','{"name":"MFA Unverified QA"}',null),
('f2510000-0000-4000-8000-000000000005','{"name":"MFA Suspended QA"}',now());
update app_roles set role=case when user_id='f2510000-0000-4000-8000-000000000002' then 'moderator' else 'admin' end
where user_id::text in('f2510000-0000-4000-8000-000000000002','f2510000-0000-4000-8000-000000000003','f2510000-0000-4000-8000-000000000004','f2510000-0000-4000-8000-000000000005');
update account_statuses set status='suspended' where user_id='f2510000-0000-4000-8000-000000000005';
insert into listings(id,seller_id,draft) values('f2520000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000001','{}');
insert into reports(id,user_id,listing_id,reason) values('f2530000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000001','f2520000-0000-4000-8000-000000000001','Signalement fictif pour vérifier la protection MFA.');
set local role authenticated;
select set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select 1/((gp_mfa_required() and not gp_moderation_allowed())::integer) as moderator_aal1_denied;
select 1/((not exists(select 1 from listings where id='f2520000-0000-4000-8000-000000000001') and not exists(select 1 from reports where id='f2530000-0000-4000-8000-000000000001'))::integer) as moderator_aal1_cannot_read_private_evidence;
do $$begin
 begin perform gp_report_decision('f2530000-0000-4000-8000-000000000001','reviewed','Décision fictive de recette.',1);raise exception 'Expected AAL1 refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
 begin perform gp_moderate('f2520000-0000-4000-8000-000000000001','approve',1);raise exception 'Expected moderation AAL1 refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
end;$$;
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select 1/((gp_moderation_allowed())::integer) as moderator_aal2_has_only_moderator_rights;
select 1/((exists(select 1 from listings where id='f2520000-0000-4000-8000-000000000001') and exists(select 1 from reports where id='f2530000-0000-4000-8000-000000000001'))::integer) as moderator_aal2_can_read_report_context;
select 1/((gp_report_decision('f2530000-0000-4000-8000-000000000001','reviewed','Décision fictive de recette.',1)->>'status'='reviewed')::integer) as moderator_aal2_can_decide;
do $$begin begin perform gp_admin_users();raise exception 'Expected moderator admin refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select 1/((not gp_moderation_allowed())::integer) as admin_aal1_denied;
do $$begin begin perform gp_admin_users();raise exception 'Expected admin AAL1 refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select 1/((gp_moderation_allowed() and jsonb_typeof(gp_admin_users())='array')::integer) as admin_aal2_allowed;
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select 1/((not gp_moderation_allowed())::integer) as admin_without_assurance_denied;
do $$begin begin perform gp_admin_users();raise exception 'Expected privileged access refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select 1/((not gp_moderation_allowed())::integer) as member_aal2_has_no_privileged_role;
do $$begin begin perform gp_admin_users();raise exception 'Expected privileged access refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select 1/((not gp_moderation_allowed())::integer) as unverified_admin_aal2_denied;
do $$begin begin perform gp_admin_users();raise exception 'Expected privileged access refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"f2510000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}',true);
select 1/((not gp_moderation_allowed())::integer) as suspended_admin_aal2_denied;
do $$begin begin perform gp_admin_users();raise exception 'Expected privileged access refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
do $$begin begin update gp_private.configuration set value='false' where key='mfa_required';raise exception 'Expected private configuration refusal';exception when insufficient_privilege then null;end;end;$$;
reset role;
select 1/(coalesce((select value='true'::jsonb from gp_private.configuration where key='mfa_required'),false)::integer) as users_cannot_disable_mfa;
rollback;
