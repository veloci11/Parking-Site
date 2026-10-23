-- 033 rollback-only fixture. Storage rows are inert metadata, not uploaded bytes.
-- Auth rows exercise FK/cascade/post-absence, not GoTrue or a real user's account.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,raw_user_meta_data,email_confirmed_at)values
('f3300000-0000-4000-8000-000000000001','{"name":"Retention fixture owner"}',now()),
('f3300000-0000-4000-8000-000000000002','{"name":"Retention fixture other"}',now());
insert into listings(id,seller_id,draft)values('f3310000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000001','{"title":"Inert own abandoned draft"}'),('f3310000-0000-4000-8000-000000000002','f3300000-0000-4000-8000-000000000002','{"title":"Other draft must survive"}');
insert into media_assets(id,owner_id,listing_id,object_key,mime)values('f3320000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000001','f3310000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000001/f3320000-0000-4000-8000-000000000001.webp','image/webp');
insert into gp_private.privacy_requests(id,user_id,receipt_hash,state)values('f3330000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000001',repeat('a',64),'requested');
update account_statuses set status='deletion_pending'where user_id='f3300000-0000-4000-8000-000000000001';
select 1/((not has_function_privilege('authenticated','public.gp_retention_claim(uuid,integer)','execute')and not has_function_privilege('anon','public.gp_retention_approve_policy(text,integer,jsonb,text,text)','execute')and not has_table_privilege('authenticated','gp_private.retention_jobs','select'))::integer)as retention_operator_only;
set local role authenticated;
do $$begin begin perform gp_retention_claim(gen_random_uuid(),1);raise exception 'Expected denied';exception when insufficient_privilege then null;end;end;$$;
reset role;
do $$begin
 begin perform gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'absent-policy',1);raise exception 'Expected policy';exception when others then if sqlerrm<>'RETENTION_POLICY_REQUIRED'then raise;end if;end;
 begin perform gp_retention_approve_policy('fixture-policy',1,'{"account":0,"draft":0}','fixture-operator','Inert fixture policy, not a live retention decision.');raise exception 'Expected invalid';exception when others then if sqlerrm<>'RETENTION_POLICY_INVALID'then raise;end if;end;
end;$$;
select gp_retention_approve_policy('fixture-policy',1,'{"account":0,"draft":0,"media":0,"source":0}','fixture-operator','Inert fixture policy, not a live retention decision.');
select 1/((gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'fixture-policy',1)->'items'->0->>'eligible')::boolean::integer)as retention_no_legacy_seven_day_default;
select gp_retention_approve_policy('not-yet-due',1,'{"account":1000,"draft":1000,"media":1000,"source":1000}','fixture-operator','Longer fixture policy, not a live retention decision.');
select 1/((gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'not-yet-due',1)->'items'->0->'blockers'?'RETENTION_NOT_DUE')::integer)as retention_explicit_duration_enforced;
insert into favorites values('f3300000-0000-4000-8000-000000000002','f3310000-0000-4000-8000-000000000001');
select 1/((gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'fixture-policy',1)->'items'->0->'blockers'?'SHARED_OR_REPORTED_LISTING')::integer)as retention_preserves_other_user_context;
delete from favorites where user_id='f3300000-0000-4000-8000-000000000002';
select gp_retention_hold('account','f3330000-0000-4000-8000-000000000001',0,true,'fixture-operator','Fixture preservation must prevent all deletion.');
select 1/((gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'fixture-policy',1)->'items'->0->'blockers'?'RETENTION_HOLD')::integer)as retention_hold_blocks_plan;
select gp_retention_hold('account','f3330000-0000-4000-8000-000000000001',1,false,'fixture-operator','Release only the explicit synthetic fixture hold.');
-- Storage presence and locking are checked in a subtransaction. Its inert rows
-- are removed by ROLLBACK, never by SQL DELETE or a disabled Storage guard.
savepoint retention_storage_guard;
-- The real upload quota requires an active target even for service-side writes.
-- Model the upload before deactivation; this synthetic status transition and its
-- quota receipt roll back with this branch. No admission trigger is bypassed.
update account_statuses set status='active'where user_id='f3300000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name,metadata)values('private-uploads','f3300000-0000-4000-8000-000000000001/f3320000-0000-4000-8000-000000000001.webp','{"size":100}');
select 1/((exists(select 1 from private_upload_receipts where user_id='f3300000-0000-4000-8000-000000000001'and object_name='f3300000-0000-4000-8000-000000000001/f3320000-0000-4000-8000-000000000001.webp'and byte_size=100))::integer)as retention_storage_real_quota_admission;
update account_statuses set status='deletion_pending'where user_id='f3300000-0000-4000-8000-000000000001';
select set_config('gp.retention_plan',(gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'fixture-policy',1)->'items'->0)::text,true);
do $$begin begin perform gp_retention_prepare('account','f3330000-0000-4000-8000-000000000001',repeat('f',64),'fixture-policy',1,'fixture-operator','Reviewed synthetic account and dependency graph.','No real backup exists for this transaction-only fixture.');raise exception 'Expected stale';exception when others then if sqlerrm<>'VERSION_CONFLICT'then raise;end if;end;end;$$;
select set_config('gp.retention_job',gp_retention_prepare('account','f3330000-0000-4000-8000-000000000001',current_setting('gp.retention_plan')::jsonb->>'graphHash','fixture-policy',1,'fixture-operator','Reviewed synthetic account and dependency graph.','No real backup exists for this transaction-only fixture.')::text,true);
select 1/((gp_retention_prepare('account','f3330000-0000-4000-8000-000000000001',current_setting('gp.retention_plan')::jsonb->>'graphHash','fixture-policy',1,'fixture-operator','Reviewed synthetic account and dependency graph.','No real backup exists for this transaction-only fixture.')->>'replayed')::boolean::integer)as retention_prepare_idempotent;
do $$begin
 begin perform gp_retention_claim((current_setting('gp.retention_job')::jsonb->>'id')::uuid,null);raise exception 'Expected version';exception when others then if sqlerrm<>'VERSION_CONFLICT'then raise;end if;end;
 begin
 update storage.objects set metadata='{"size":100,"fixtureRevision":2}'where bucket_id='private-uploads'and name='f3300000-0000-4000-8000-000000000001/f3320000-0000-4000-8000-000000000001.webp';
 perform gp_retention_claim((current_setting('gp.retention_job')::jsonb->>'id')::uuid,1);raise exception 'Expected changed storage';
 exception when others then if sqlerrm<>'RETENTION_REVIEW_STALE'then raise;end if;end;
end;$$;
select 1 as retention_storage_fingerprint_revalidated;
select set_config('gp.retention_claim',gp_retention_claim((current_setting('gp.retention_job')::jsonb->>'id')::uuid,1)::text,true);
do $$begin
 -- Only this private synthetic job's expected fingerprint is changed, then
 -- restored. No trigger is disabled and no real Storage bytes are modified.
 update gp_private.retention_jobs set objects=jsonb_set(objects,'{0,storageFingerprint}',to_jsonb(repeat('f',64)))where id=(current_setting('gp.retention_job')::jsonb->>'id')::uuid;
 begin perform gp_retention_checkpoint((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid);raise exception 'Expected fingerprint';exception when others then if sqlerrm<>'RETENTION_STORAGE_CHANGED'then raise;end if;end;
 update gp_private.retention_jobs set objects=current_setting('gp.retention_claim')::jsonb->'objects'where id=(current_setting('gp.retention_job')::jsonb->>'id')::uuid;
 begin insert into favorites values('f3300000-0000-4000-8000-000000000002','f3310000-0000-4000-8000-000000000001');raise exception 'Expected locked';exception when others then if sqlerrm<>'RETENTION_TARGET_LOCKED'then raise;end if;end;
 begin perform gp_retention_finish_database((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid);raise exception 'Expected storage';exception when others then if sqlerrm<>'STORAGE_REMOVAL_UNPROVEN'then raise;end if;end;
end;$$;
rollback to savepoint retention_storage_guard;
select 1/((not exists(select 1 from storage.objects where bucket_id='private-uploads'and name='f3300000-0000-4000-8000-000000000001/f3320000-0000-4000-8000-000000000001.webp')and not exists(select 1 from private_upload_receipts where user_id='f3300000-0000-4000-8000-000000000001'))::integer)as retention_storage_branch_rolled_back;
-- The account graph now has no Storage object. Completion below proves SQL
-- absence checks only; actual Storage/Auth SDK deletion is a separate proof.
select set_config('gp.retention_plan',(gp_retention_plan('account',array['f3330000-0000-4000-8000-000000000001'::uuid],'fixture-policy',1)->'items'->0)::text,true);
select set_config('gp.retention_job',gp_retention_prepare('account','f3330000-0000-4000-8000-000000000001',current_setting('gp.retention_plan')::jsonb->>'graphHash','fixture-policy',1,'fixture-operator','Reviewed synthetic account with no Storage objects.','No real backup exists for this transaction-only fixture.')::text,true);
select set_config('gp.retention_claim',gp_retention_claim((current_setting('gp.retention_job')::jsonb->>'id')::uuid,1)::text,true);
select gp_retention_hold('account','f3330000-0000-4000-8000-000000000001',2,true,'fixture-operator','A hold added between phases must stop completion.');
do $$begin begin perform gp_retention_finish_database((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid);raise exception 'Expected hold';exception when others then if sqlerrm<>'RETENTION_HOLD'then raise;end if;end;end;$$;
select gp_retention_hold('account','f3330000-0000-4000-8000-000000000001',3,false,'fixture-operator','Release only this synthetic inter-phase fixture hold.');
select gp_retention_finish_database((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid);
select 1/((select count(*)=0 from listings where seller_id='f3300000-0000-4000-8000-000000000001')::integer)as retention_own_database_removed;
select 1/((select count(*)=1 from listings where id='f3310000-0000-4000-8000-000000000002')::integer)as retention_other_database_preserved;
do $$begin begin perform gp_retention_complete((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid);raise exception 'Expected auth';exception when others then if sqlerrm<>'AUTH_REMOVAL_UNPROVEN'then raise;end if;end;end;$$;
select gp_retention_release((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid,'AUTH_FAILED');
do $$begin begin perform gp_retention_checkpoint((current_setting('gp.retention_job')::jsonb->>'id')::uuid,null);raise exception 'Expected lease';exception when others then if sqlerrm<>'VERSION_CONFLICT'then raise;end if;end;end;$$;

select set_config('gp.retention_claim',gp_retention_claim((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(gp_retention_job((current_setting('gp.retention_job')::jsonb->>'id')::uuid)->>'version')::integer)::text,true);
select 1/((current_setting('gp.retention_claim')::jsonb->>'state'='auth_pending')::integer)as retention_resumes_after_auth_failure;
-- Transaction-only synthetic Auth row deletion, not a GoTrue deletion call.
delete from auth.users where id='f3300000-0000-4000-8000-000000000001';
select 1/((gp_retention_complete((current_setting('gp.retention_job')::jsonb->>'id')::uuid,(current_setting('gp.retention_claim')::jsonb->>'leaseToken')::uuid)->>'activeSystemErased')::boolean::integer)as retention_post_absence_verified;
select 1/(((gp_privacy_request_status('f3330000-0000-4000-8000-000000000001',repeat('a',64))->>'state')='completed'and(gp_privacy_request_status('f3330000-0000-4000-8000-000000000001',repeat('a',64))->>'completeErasure')='false')::integer)as retention_truthful_receipt_survives_auth_deletion;
select 1/((gp_retention_complete((current_setting('gp.retention_job')::jsonb->>'id')::uuid,gen_random_uuid())->>'state'='completed')::integer)as retention_completion_idempotent;
-- Each non-account kind has a real metadata cleanup branch; no Auth effect.
insert into listings(id,seller_id,draft)values('f3370000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000002','{"title":"Only an orphan fixture parent"}');
insert into media_assets(id,owner_id,listing_id,object_key,mime)values('f3370000-0000-4000-8000-000000000002','f3300000-0000-4000-8000-000000000002','f3370000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000002/f3370000-0000-4000-8000-000000000001/f3370000-0000-4000-8000-000000000002.webp','image/webp');
insert into parking_scene_sources(id,owner_id,uploader_id,listing_id,object_key,mime,byte_size,sha256)values('f3370000-0000-4000-8000-000000000003','f3300000-0000-4000-8000-000000000002','f3300000-0000-4000-8000-000000000002','f3370000-0000-4000-8000-000000000001','orphan-source-fixture.pdf','application/pdf',100,repeat('b',64));
savepoint retention_orphan_storage_guard;
insert into storage.objects(bucket_id,name,metadata)values('public-approved','f3370000-0000-4000-8000-000000000002.webp','{"size":100}');
do $$declare target uuid='f3370000-0000-4000-8000-000000000002';candidate jsonb;job jsonb;claim jsonb;begin
 candidate=gp_retention_plan('media',array[target],'fixture-policy',1)->'items'->0;
 job=gp_retention_prepare('media',target,candidate->>'graphHash','fixture-policy',1,'fixture-operator','Only synthetic Storage reference locking is reviewed.','No backup exists for this isolated fixture object.');
 claim=gp_retention_claim((job->>'id')::uuid,1);
 -- NEW has no protected UUID after rename. OLD must still block detachment.
 begin update storage.objects set name='detached-retention-fixture.webp'where bucket_id='public-approved'and name=target::text||'.webp';raise exception 'Expected rename locked';exception when others then if sqlerrm<>'RETENTION_TARGET_LOCKED'then raise;end if;end;
 begin perform gp_retention_finish_database((job->>'id')::uuid,(claim->>'leaseToken')::uuid);raise exception 'Expected Storage absence';exception when others then if sqlerrm<>'STORAGE_REMOVAL_UNPROVEN'then raise;end if;end;
end;$$;
rollback to savepoint retention_orphan_storage_guard;
do $$declare k text;target uuid;candidate jsonb;job jsonb;claim jsonb;result jsonb;begin
 foreach k in array array['media','source','draft']loop
 target=case k when 'media'then 'f3370000-0000-4000-8000-000000000002'::uuid when 'source'then 'f3370000-0000-4000-8000-000000000003'::uuid else 'f3370000-0000-4000-8000-000000000001'::uuid end;
 candidate=gp_retention_plan(k,array[target],'fixture-policy',1)->'items'->0;
 if candidate->>'eligible'<>'true'then raise exception 'Orphan kind not eligible: %',candidate->'blockers';end if;
 job=gp_retention_prepare(k,target,candidate->>'graphHash','fixture-policy',1,'fixture-operator','Only a synthetic orphan fixture was reviewed.','No backup exists for these isolated fixture rows.');
 claim=gp_retention_claim((job->>'id')::uuid,1);
 -- These three subjects have no uploaded Storage objects. No SQL operation
 -- simulates API removal or bypasses storage.protect_delete().
 result=gp_retention_finish_database((job->>'id')::uuid,(claim->>'leaseToken')::uuid);
 if result->>'state'<>'completed'then raise exception 'Orphan job did not complete';end if;
 end loop;
 if not exists(select 1 from auth.users where id='f3300000-0000-4000-8000-000000000002')then raise exception 'Orphan cleanup touched Auth';end if;
end;$$;
select 1 as retention_orphan_media_source_draft_metadata_paths;
select 1 as retention_old_reference_rename_guard_closed;
-- Historical source must be preserved even when the common plan was withdrawn.
insert into parking_sites(id,public_name,internal_reference)values('f3340000-0000-4000-8000-000000000001','Inert history fixture','retention-history-fixture');
insert into parking_levels(id,site_id,code,label,number,sort_order)values('f3350000-0000-4000-8000-000000000001','f3340000-0000-4000-8000-000000000001','fixture','Fixture level',-1,0);
insert into parking_scene_sources(id,owner_id,uploader_id,listing_id,object_key,mime,byte_size,sha256)values('f3360000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000002','f3300000-0000-4000-8000-000000000002','f3310000-0000-4000-8000-000000000002','fixture-private-source.pdf','application/pdf',100,repeat('a',64));
insert into gp_private.parking_level_plan_revisions(level_id,row_version,manifest,physical_mapping,evidence_ids,evidence_snapshot,state,action,reason,created_at)values('f3350000-0000-4000-8000-000000000001',1,'{}','[]',array['f3360000-0000-4000-8000-000000000001'::uuid],'[]','withdrawn','legacy_snapshot','Only an inert historical-reference fixture.',now());
select 1/((gp_retention_plan('source',array['f3360000-0000-4000-8000-000000000001'::uuid],'fixture-policy',1)->'items'->0->'blockers'?'HISTORICAL_SCENE_EVIDENCE_RETAINED')::integer)as retention_withdrawn_history_preserves_sources;
select gp_retention_disable_policy('fixture-policy',1,'Disable the synthetic policy before leaving the fixture.');
do $$begin begin perform gp_retention_plan('draft',array['f3310000-0000-4000-8000-000000000002'::uuid],'fixture-policy',1);raise exception 'Expected disabled';exception when others then if sqlerrm<>'RETENTION_POLICY_REQUIRED'then raise;end if;end;end;$$;
select 1 as retention_finalization_contract_closed;
rollback;
