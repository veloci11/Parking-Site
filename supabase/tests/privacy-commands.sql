-- 021 rollback-only fixtures; no email, no real deletion job or Storage mutation.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values('f2100000-0000-4000-8000-000000000001','{"name":"QA Owner","termsAccepted":true,"termsVersion":"2026-10-21-v1-preparation","privacyVersion":"2026-10-21-v1-preparation"}',now()),('f2100000-0000-4000-8000-000000000002','{"name":"QA Other"}',now());
insert into listings(id,seller_id,draft) values('f2110000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','{"title":"Own secret draft"}'),('f2110000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000002','{"title":"Other secret draft"}');
insert into favorites values('f2100000-0000-4000-8000-000000000001','f2110000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','f2100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","amr":[]}',true);
do $$begin begin perform gp_privacy_export();raise exception 'Expected REAUTH_REQUIRED';exception when others then if sqlerrm<>'REAUTH_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claims',jsonb_build_object('sub','f2100000-0000-4000-8000-000000000001','role','authenticated','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select set_config('gp.qa_export',gp_privacy_export()::text,true);
select 1/((jsonb_array_length(current_setting('gp.qa_export')::jsonb->'listings')=1 and current_setting('gp.qa_export')::jsonb->'listings'->0->'draft'->>'title'='Own secret draft')::integer) as export_owner_only;
select 1/((jsonb_array_length(current_setting('gp.qa_export')::jsonb->'favorites')=1 and jsonb_array_length(current_setting('gp.qa_export')::jsonb->'termsAcceptances')=1)::integer) as export_secondary_categories;
select 1/((position('encrypted_password' in current_setting('gp.qa_export'))=0 and position('Other secret draft' in current_setting('gp.qa_export'))=0)::integer) as export_no_credentials_or_other_drafts;
select set_config('gp.qa_privacy_request',(gp_privacy_request_deletion(repeat('a',64))->>'id'),true);
reset role;
select 1/((select status='deletion_pending' from account_statuses where user_id='f2100000-0000-4000-8000-000000000001')::integer) as account_deactivated;
select 1/((select lifecycle_state='withdrawn' from listings where id='f2110000-0000-4000-8000-000000000001')::integer) as own_listing_withdrawn;
select 1/((select draft->>'title'='Other secret draft' from listings where id='f2110000-0000-4000-8000-000000000002')::integer) as unrelated_listing_untouched;
set local role anon;
select 1/((gp_privacy_request_status(current_setting('gp.qa_privacy_request')::uuid,repeat('b',64)) is null)::integer) as forged_receipt_no_status;
select 1/(((gp_privacy_request_status(current_setting('gp.qa_privacy_request')::uuid,repeat('a',64))->>'completeErasure')::boolean=false)::integer) as truthful_incomplete_status;
do $$begin begin perform gp_privacy_cleanup_plan(100);raise exception 'Expected denied';exception when insufficient_privilege then null;end;end;$$;
reset role;
set local role service_role;
do $$begin begin perform gp_privacy_cleanup(array[current_setting('gp.qa_privacy_request')::uuid],'wrong');raise exception 'Expected VALIDATION_ERROR';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;begin perform gp_privacy_cleanup(array[current_setting('gp.qa_privacy_request')::uuid],'privacy-limited-cleanup-v1');raise exception 'Expected PRIVACY_NOT_ELIGIBLE';exception when others then if sqlerrm<>'PRIVACY_NOT_ELIGIBLE' then raise;end if;end;end;$$;
reset role;
update gp_private.privacy_requests set created_at=now()-interval '8 days' where id=current_setting('gp.qa_privacy_request')::uuid;
set local role service_role;
select 1/((gp_privacy_cleanup_plan(100)->'eligibleRequestIds' ? current_setting('gp.qa_privacy_request'))::integer) as bounded_plan_candidate;
select 1/((jsonb_array_length(gp_privacy_cleanup(array[current_setting('gp.qa_privacy_request')::uuid],'privacy-limited-cleanup-v1')->'processedIds')=1)::integer) as eligible_limited_cleanup;
select 1/((jsonb_array_length(gp_privacy_cleanup(array[current_setting('gp.qa_privacy_request')::uuid],'privacy-limited-cleanup-v1')->'processedIds')=0)::integer) as cleanup_retry_idempotent;
reset role;
select 1/((select state='manual_review' and limited_cleanup_at is not null from gp_private.privacy_requests where id=current_setting('gp.qa_privacy_request')::uuid)::integer) as final_erasure_not_claimed;
select 1/((select count(*)=1 from listings where id='f2110000-0000-4000-8000-000000000001')::integer) as history_preserved_without_retention_policy;
select 1/((not has_function_privilege('authenticated','public.gp_privacy_cleanup(uuid[],text)','execute') and not has_table_privilege('authenticated','gp_private.privacy_requests','select'))::integer) as private_job_privileges;
-- Durable archive jobs are private and complete within the explicit ownership scope.
insert into media_assets(id,owner_id,listing_id,object_key,mime) values('f2120000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000002','f2110000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000002/f2110000-0000-4000-8000-000000000002/f2120000-0000-4000-8000-000000000001.webp','image/webp');
insert into parking_scene_sources(id,owner_id,uploader_id,listing_id,object_key,mime,byte_size,sha256) values
('f2130000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000002','f2110000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000002/f2110000-0000-4000-8000-000000000002/f2130000-0000-4000-8000-000000000001.pdf','application/pdf',100,repeat('a',64)),
('f2130000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001','f2110000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001/f2110000-0000-4000-8000-000000000002/f2130000-0000-4000-8000-000000000002.pdf','application/pdf',100,repeat('b',64));
set local role authenticated;
select set_config('request.jwt.claim.sub','f2100000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f2100000-0000-4000-8000-000000000002','role','authenticated','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
-- 023 keeps originals quarantined until the private worker has validated its result.
do $$begin begin perform gp_export_request();raise exception 'Expected EXPORT_SOURCE_NOT_READY';exception when others then if sqlerrm<>'EXPORT_SOURCE_NOT_READY' then raise;end if;end;end;$$;
reset role;
select 1/((select count(*)=0 from gp_private.export_jobs where user_id='f2100000-0000-4000-8000-000000000002')::integer) as unready_source_creates_no_export_job;
-- Inert Storage metadata only: no uploaded bytes or worker process are fabricated.
-- Exercise the actual service receipt and completion RPC instead of forcing ready.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into storage.objects(bucket_id,name,metadata) values
('scene-sources','f2100000-0000-4000-8000-000000000002/f2110000-0000-4000-8000-000000000002/f2130000-0000-4000-8000-000000000001.pdf','{"size":100}'),
('scene-sources','f2100000-0000-4000-8000-000000000002/f2110000-0000-4000-8000-000000000002/f2130000-0000-4000-8000-000000000001.preview-1.png','{"size":100}');
set local role service_role;
select set_config('gp.qa_source_claim',(gp_source_claim('f2130000-0000-4000-8000-000000000001')->>'token'),true);
select gp_source_complete('f2130000-0000-4000-8000-000000000001',current_setting('gp.qa_source_claim')::uuid,true,array['f2100000-0000-4000-8000-000000000002/f2110000-0000-4000-8000-000000000002/f2130000-0000-4000-8000-000000000001.preview-1.png'],1,'gp-source-raster/1');
reset role;
select 1/((select processing_state='ready' and page_count=1 and cardinality(preview_keys)=1 and lease_token is null from parking_scene_sources where id='f2130000-0000-4000-8000-000000000001')::integer) as owned_source_processed_through_worker_contract;
select 1/((select processing_state='processing' from parking_scene_sources where id='f2130000-0000-4000-8000-000000000002')::integer) as other_uploader_source_stays_quarantined;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2100000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f2100000-0000-4000-8000-000000000002','role','authenticated','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select set_config('gp.qa_export_job',(gp_export_request()->>'id'),true);
select 1/((jsonb_array_length(gp_export_history())=1)::integer) as owner_job_history;
do $$begin begin perform gp_export_request();raise exception 'Expected EXPORT_PENDING';exception when others then if sqlerrm<>'EXPORT_PENDING' then raise;end if;end;begin perform gp_export_download(current_setting('gp.qa_export_job')::uuid);raise exception 'Expected EXPORT_NOT_READY';exception when others then if sqlerrm<>'EXPORT_NOT_READY' then raise;end if;end;end;$$;
reset role;
select 1/((select jsonb_array_length(files)=3 and position('f2130000-0000-4000-8000-000000000002' in snapshot::text)=0 and position('f2130000-0000-4000-8000-000000000002' in files::text)=0 and (select count(*)=1 from jsonb_array_elements(files) f where f->>'kind'='preview' and f->>'mime'='image/png') from gp_private.export_jobs where id=current_setting('gp.qa_export_job')::uuid)::integer) as only_own_uploaded_files_and_ready_preview;
set local role service_role;
select set_config('gp.qa_export_claim',gp_export_claim(current_setting('gp.qa_export_job')::uuid,'private-export-v1')::text,true);
select gp_export_finish(current_setting('gp.qa_export_job')::uuid,(current_setting('gp.qa_export_claim')::jsonb->>'leaseToken')::uuid,true,1000,repeat('a',64),null);
reset role;
select 1/((select snapshot='{}'::jsonb and files='[]'::jsonb and expires_at=ready_at+interval '7 days' from gp_private.export_jobs where id=current_setting('gp.qa_export_job')::uuid)::integer) as snapshot_cleared_and_seven_day_expiry;
set local role authenticated;
select 1/((gp_export_download(current_setting('gp.qa_export_job')::uuid)->>'objectKey' like 'f2100000-0000-4000-8000-000000000002/%')::integer) as owner_reauthenticated_download;
select set_config('request.jwt.claim.sub','f2100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','f2100000-0000-4000-8000-000000000001','role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select 1/((jsonb_array_length(gp_export_history())=0)::integer) as other_user_no_job_history;
reset role;
update gp_private.export_jobs set expires_at=now()-interval '1 second' where id=current_setting('gp.qa_export_job')::uuid;
set local role service_role;
select set_config('gp.qa_export_purge',(gp_export_purge_claim(current_setting('gp.qa_export_job')::uuid,'private-export-v1')->>'purgeToken'),true);
select gp_export_purge_finish(current_setting('gp.qa_export_job')::uuid,current_setting('gp.qa_export_purge')::uuid);
reset role;
select 1/((select state='expired' and object_key is null from gp_private.export_jobs where id=current_setting('gp.qa_export_job')::uuid)::integer) as bounded_expiry_state;
select 1/((not (select public from storage.buckets where id='private-exports') and not has_function_privilege('authenticated','public.gp_export_claim(uuid,text)','execute') and not has_table_privilege('authenticated','gp_private.export_jobs','select'))::integer) as export_private_worker_only;
rollback;
