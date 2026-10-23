-- 031: synthetic request/status/privacy fixtures only. No Auth network or email; always rollback.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f3110000-0000-4000-8000-000000000001','{"name":"Modeling owner A"}',now()),
('f3110000-0000-4000-8000-000000000002','{"name":"Modeling owner B","role":"admin"}',now()),
('f3110000-0000-4000-8000-000000000003','{"name":"Modeling moderator"}',now()),
('f3110000-0000-4000-8000-000000000004','{"name":"Modeling admin"}',now()),
('f3110000-0000-4000-8000-000000000005','{"name":"Modeling unverified"}',null);
update app_roles set role=case when user_id='f3110000-0000-4000-8000-000000000004' then 'admin' else 'moderator' end where user_id in('f3110000-0000-4000-8000-000000000003','f3110000-0000-4000-8000-000000000004');
insert into listings(id,seller_id,draft) values
('f3120000-0000-4000-8000-000000000001','f3110000-0000-4000-8000-000000000001','{"title":"Private draft owner A"}'),
('f3120000-0000-4000-8000-000000000002','f3110000-0000-4000-8000-000000000002','{"title":"Private draft owner B"}'),
('f3120000-0000-4000-8000-000000000003','f3110000-0000-4000-8000-000000000005','{"title":"Unverified private draft"}'),
('f3120000-0000-4000-8000-000000000004','f3110000-0000-4000-8000-000000000002','{"title":"Disposable private draft"}');
set local role anon;
do $$begin
 begin perform gp_my_modeling_request('f3120000-0000-4000-8000-000000000001');raise exception 'Expected anon RPC refusal';exception when insufficient_privilege then null;end;
 begin perform note from parking_modeling_requests;raise exception 'Expected anon table refusal';exception when insufficient_privilege then null;end;
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/((gp_my_modeling_request('f3120000-0000-4000-8000-000000000001') is null)::integer) as absent_request_is_explicit_null;
select set_config('gp.qa.modeling_initial',gp_request_parking_modeling('f3120000-0000-4000-8000-000000000001',' OWNER-NOTE-PRIVATE-031 ')::text,true);
select 1/((current_setting('gp.qa.modeling_initial')::jsonb->>'note'='OWNER-NOTE-PRIVATE-031' and current_setting('gp.qa.modeling_initial')::jsonb->>'status'='requested' and current_setting('gp.qa.modeling_initial')::jsonb->>'version'='1' and not(current_setting('gp.qa.modeling_initial')::jsonb ? 'ownerId') and not(current_setting('gp.qa.modeling_initial')::jsonb ? 'actorId'))::integer) as request_server_attributes_state_and_keeps_note_private;
select 1/((gp_request_parking_modeling('f3120000-0000-4000-8000-000000000001','A replay never overwrites the first note')=current_setting('gp.qa.modeling_initial')::jsonb)::integer) as request_replay_is_idempotent;
do $$begin
 begin perform gp_request_parking_modeling('f3120000-0000-4000-8000-000000000002','Guessing another listing');raise exception 'Expected owner-only write';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
 begin perform gp_my_modeling_request('f3120000-0000-4000-8000-000000000002');raise exception 'Expected owner-only read';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
 begin perform gp_request_parking_modeling('f3120000-0000-4000-8000-000000000001',repeat('x',2001));raise exception 'Expected note bound';exception when others then if sqlerrm<>'MODELING_REQUEST_INVALID' then raise;end if;end;
 begin update parking_modeling_requests set status='ready' where listing_id='f3120000-0000-4000-8000-000000000001';raise exception 'Expected direct status write refusal';exception when insufficient_privilege then null;end;
 begin insert into parking_modeling_requests(listing_id,owner_id,status) values('f3120000-0000-4000-8000-000000000004',auth.uid(),'ready');raise exception 'Expected direct attribution refusal';exception when insufficient_privilege then null;end;
 begin perform actor_id from parking_modeling_requests;raise exception 'Expected staff attribution hidden';exception when insufficient_privilege then null;end;
 begin perform gp_admin_modeling_requests();raise exception 'Expected member admin refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
end;$$;
select 1/((select count(note)=1 from parking_modeling_requests)::integer) as sdk_owner_select_is_scoped;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}',true);
do $$begin begin perform gp_request_parking_modeling('f3120000-0000-4000-8000-000000000003','Unverified request');raise exception 'Expected verified owner';exception when others then if sqlerrm<>'EMAIL_UNVERIFIED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","user_metadata":{"role":"admin"}}',true);
select gp_request_parking_modeling('f3120000-0000-4000-8000-000000000002','OTHER-OWNER-PRIVATE-031');
select 1/((select count(note)=1 and bool_and(note='OTHER-OWNER-PRIVATE-031') from parking_modeling_requests)::integer) as metadata_role_spoof_never_reads_other_owner;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_admin_modeling_requests();raise exception 'Expected moderator refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
do $$begin
 begin perform gp_admin_modeling_requests();raise exception 'Expected AAL2 queue';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
 begin perform gp_decide_modeling_request('f3120000-0000-4000-8000-000000000001','ready',1);raise exception 'Expected AAL2 decision';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
end;$$;
select 1/((select count(note)=0 from parking_modeling_requests)::integer) as aal1_admin_cannot_read_private_queue_by_sdk;
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select 1/((gp_admin_modeling_requests(null,0,1)->>'total'='2' and jsonb_array_length(gp_admin_modeling_requests(null,0,1)->'requests')=1 and (gp_admin_modeling_requests(null,0,1)->>'hasMore')::boolean and gp_admin_modeling_requests(null,1,1)->'requests'->0->>'listingId'='f3120000-0000-4000-8000-000000000002')::integer) as admin_queue_is_bounded_and_paginated;
select gp_decide_modeling_request('f3120000-0000-4000-8000-000000000001','in_progress',1);
do $$begin
 begin perform gp_decide_modeling_request('f3120000-0000-4000-8000-000000000001','ready',1);raise exception 'Expected optimistic version';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 begin perform gp_decide_modeling_request('f3120000-0000-4000-8000-000000000001','auto_generated',2);raise exception 'Expected strict state';exception when others then if sqlerrm<>'MODELING_REQUEST_INVALID' then raise;end if;end;
end;$$;
select gp_decide_modeling_request('f3120000-0000-4000-8000-000000000001','ready',2);
select 1/((gp_admin_modeling_requests('ready')->>'total'='1' and gp_admin_modeling_requests('ready')->'requests'->0->>'note'='OWNER-NOTE-PRIVATE-031')::integer) as ready_is_a_private_manual_status;
reset role;
select 1/((select actor_id='f3110000-0000-4000-8000-000000000004' and row_version=3 from parking_modeling_requests where listing_id='f3120000-0000-4000-8000-000000000001')::integer) as staff_attribution_is_server_owned;
select 1/((not exists(select 1 from published_listings where id::text like 'f3120000-%') and not exists(select 1 from parking_scenes where listing_id::text like 'f3120000-%') and not exists(select 1 from parking_scene_sources where listing_id::text like 'f3120000-%') and not exists(select 1 from notification_outbox where user_id::text like 'f3110000-%') and (select lifecycle_state='draft' and row_version=1 from listings where id='f3120000-0000-4000-8000-000000000001'))::integer) as ready_does_not_generate_publish_or_send_email;
select 1/((select count(*)=1 from audit_events where action='modeling.requested' and target_id='f3120000-0000-4000-8000-000000000001')::integer) as idempotent_request_has_one_audit;
set local role authenticated;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f3110000-0000-4000-8000-000000000001','role','authenticated','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())))))::text,true);
select 1/((gp_request_parking_modeling('f3120000-0000-4000-8000-000000000001','Retry after admin decision')->>'status'='ready')::integer) as owner_replay_never_resets_staff_decision;
select set_config('gp.qa.modeling_export', (gp_privacy_export()->'modelingRequests')::text,true);
select 1/((jsonb_array_length(current_setting('gp.qa.modeling_export')::jsonb)=1 and current_setting('gp.qa.modeling_export')::jsonb->0->>'note'='OWNER-NOTE-PRIVATE-031' and current_setting('gp.qa.modeling_export') not like '%OTHER-OWNER-PRIVATE%' and not(current_setting('gp.qa.modeling_export')::jsonb->0 ? 'actorId') and not(current_setting('gp.qa.modeling_export')::jsonb->0 ? 'actor_id'))::integer) as export_contains_only_owned_request_and_no_staff_identity;
select gp_privacy_request_deletion(repeat('a',64));
reset role;
select 1/((not exists(select 1 from parking_modeling_requests where owner_id='f3110000-0000-4000-8000-000000000001') and exists(select 1 from parking_modeling_requests where owner_id='f3110000-0000-4000-8000-000000000002') and (select status='deletion_pending' from account_statuses where user_id='f3110000-0000-4000-8000-000000000001'))::integer) as confirmed_deletion_purges_only_own_manual_notes;
update account_statuses set status='suspended' where user_id='f3110000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f3110000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f3110000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select 1/((select count(note)=0 from parking_modeling_requests)::integer) as suspended_owner_loses_private_sdk_access;
do $$begin begin perform gp_my_modeling_request('f3120000-0000-4000-8000-000000000002');raise exception 'Expected inactive account';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;end;$$;
reset role;
update account_statuses set status='active' where user_id='f3110000-0000-4000-8000-000000000002';
set local role authenticated;
select gp_request_parking_modeling('f3120000-0000-4000-8000-000000000004','Disposable listing request');
reset role;
delete from listings where id='f3120000-0000-4000-8000-000000000004';
select 1/((not exists(select 1 from parking_modeling_requests where listing_id='f3120000-0000-4000-8000-000000000004'))::integer) as listing_deletion_cascades_manual_request;
select 1/((not has_function_privilege('anon','public.gp_request_parking_modeling(uuid,text)','execute') and not has_function_privilege('anon','public.gp_admin_modeling_requests(text,integer,integer)','execute') and not has_function_privilege('authenticated','gp_private.modeling_request_payload(public.parking_modeling_requests)','execute') and not has_function_privilege('authenticated','public.gp_privacy_export_before_modeling()','execute') and not has_function_privilege('authenticated','public.gp_privacy_request_deletion_before_modeling(text)','execute') and not has_table_privilege('authenticated','public.parking_modeling_requests','insert,update,delete') and not has_column_privilege('authenticated','public.parking_modeling_requests','actor_id','select') and (select relrowsecurity from pg_class where oid='public.parking_modeling_requests'::regclass))::integer) as manual_modeling_request_internal_bypasses_closed;
rollback;
