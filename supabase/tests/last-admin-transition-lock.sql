-- 034: rollback-only fixture for a disposable database with no active admins.
-- Abort before inserting fixtures if a provisioned admin is already present.
-- This is a one-session contract test, not a concurrent execution proof.
begin;
do $$begin
 if exists(select 1 from app_roles r join account_statuses s using(user_id) where r.role='admin' and s.status='active')then raise exception 'ISOLATED_ADMIN_FIXTURE_REQUIRED';end if;
end;$$;
-- Verify the shared lock and fresh post-lock checks in the installed functions.
do $$declare a text=pg_get_functiondef('public.gp_admin_user_decision(uuid,integer,text,text,text)'::regprocedure);d text=pg_get_functiondef('public.gp_privacy_request_deletion_before_modeling(text)'::regprocedure);lock_sql text='perform pg_advisory_xact_lock(hashtextextended(''gp:admin-management'',0));';tail text;begin
 if position(lock_sql in a)=0 or position(lock_sql in d)=0 or position('privacy-last-admin' in d)>0 then raise exception 'ADMIN_TRANSITION_LOCK_MISMATCH';end if;
 tail=substring(a from position(lock_sql in a)+length(lock_sql));
 if position('if not gp_admin_allowed()' in tail)=0 or position('if not gp_admin_allowed()' in tail)>position('select * into target_status' in tail)then raise exception 'ADMIN_POST_LOCK_CHECK_MISSING';end if;
 tail=substring(d from position(lock_sql in d)+length(lock_sql));
 if position('if not gp_active() or not gp_privacy_recent_password()' in tail)=0 or position('if not gp_active() or not gp_privacy_recent_password()' in tail)>position('if gp_role()=' in tail)then raise exception 'PRIVACY_POST_LOCK_CHECK_MISSING';end if;
end;$$;
select 1 as admin_transitions_share_lock_and_recheck;
select 1/((position('gp_privacy_request_deletion_before_modeling(p_receipt_hash)' in pg_get_functiondef('public.gp_privacy_request_deletion(text)'::regprocedure))>0 and position('delete from public.parking_modeling_requests where owner_id=u' in pg_get_functiondef('public.gp_privacy_request_deletion(text)'::regprocedure))>0)::integer)as public_deletion_wrapper_preserved;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at)values
 ('f3400000-0000-4000-8000-000000000001','{"name":"Admin lock fixture A"}',now()),
 ('f3400000-0000-4000-8000-000000000002','{"name":"Admin lock fixture B"}',now()),
 ('f3400000-0000-4000-8000-000000000003','{"name":"Admin lock fixture C"}',now()),
 ('f3400000-0000-4000-8000-000000000004','{"name":"Member lock fixture"}',now());
update app_roles set role='admin'where user_id in('f3400000-0000-4000-8000-000000000001','f3400000-0000-4000-8000-000000000002');
insert into listings(id,seller_id,draft)values('f3410000-0000-4000-8000-000000000001','f3400000-0000-4000-8000-000000000004','{}');
insert into parking_modeling_requests(listing_id,owner_id,note)values('f3410000-0000-4000-8000-000000000001','f3400000-0000-4000-8000-000000000004','Only an inert private fixture note.');
set local role authenticated;
select set_config('request.jwt.claim.sub','f3400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f3400000-0000-4000-8000-000000000001','role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select gp_admin_user_decision('f3400000-0000-4000-8000-000000000002',1,'Suspend only the synthetic second administrator.','suspended',null);
do $$begin
 begin perform gp_privacy_request_deletion(repeat('a',64));raise exception 'Expected LAST_ADMIN';exception when others then if sqlerrm<>'LAST_ADMIN'then raise;end if;end;
end;$$;
select 1/((gp_active() and gp_role()='admin')::integer)as last_admin_deletion_refused_after_admin_transition;
select gp_admin_user_decision('f3400000-0000-4000-8000-000000000002',2,'Reactivate only the synthetic second administrator.','active',null);
select gp_privacy_request_deletion(repeat('a',64));
do $$begin
 begin perform gp_admin_user_decision('f3400000-0000-4000-8000-000000000002',3,'A stale actor cannot suspend the remaining administrator.','suspended',null);raise exception 'Expected actor refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED'then raise;end if;end;
end;$$;
select 1 as deletion_pending_actor_cannot_administer;
select set_config('request.jwt.claim.sub','f3400000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f3400000-0000-4000-8000-000000000002','role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$begin
 begin perform gp_privacy_request_deletion(repeat('b',64));raise exception 'Expected LAST_ADMIN';exception when others then if sqlerrm<>'LAST_ADMIN'then raise;end if;end;
end;$$;
select gp_admin_user_decision('f3400000-0000-4000-8000-000000000003',1,'Appoint the replacement synthetic administrator.',null,'admin');
select gp_privacy_request_deletion(repeat('b',64));
select set_config('request.jwt.claim.sub','f3400000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f3400000-0000-4000-8000-000000000004','role','authenticated','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select gp_privacy_request_deletion(repeat('d',64));
reset role;
select 1/((not exists(select 1 from parking_modeling_requests where owner_id='f3400000-0000-4000-8000-000000000004'))::integer)as deletion_still_removes_private_modeling_notes;
select 1/((select count(*)=1 from app_roles r join account_statuses s using(user_id)where r.role='admin'and s.status='active')::integer)as replacement_admin_preserved;
select 1/((select count(*)=3 from gp_private.privacy_requests where user_id in('f3400000-0000-4000-8000-000000000001','f3400000-0000-4000-8000-000000000002','f3400000-0000-4000-8000-000000000004'))::integer)as admin_and_member_receipt_contract_preserved;
select 1/((has_function_privilege('authenticated','public.gp_admin_user_decision(uuid,integer,text,text,text)','execute')and has_function_privilege('authenticated','public.gp_privacy_request_deletion(text)','execute')and not has_function_privilege('anon','public.gp_admin_user_decision(uuid,integer,text,text,text)','execute')and not has_function_privilege('anon','public.gp_privacy_request_deletion(text)','execute')and not has_function_privilege('authenticated','public.gp_privacy_request_deletion_before_modeling(text)','execute')and not has_function_privilege('authenticated','public.gp_delete_account_before_privacy()','execute'))::integer)as admin_transition_rpc_grants_preserved;
select 1 as last_admin_transition_contract_closed;
rollback;
