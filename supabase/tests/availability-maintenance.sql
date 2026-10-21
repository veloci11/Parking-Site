-- Rollback-only QA: exact fd1300* fixtures, no Storage object and no external email.
-- Run as migration operator after013, in one transaction. No ordinary user privileges altered.
begin;
select set_config('request.jwt.claim.sub','fd130000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fd130000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values('fd130000-0000-4000-8000-000000000001','{"name":"Availability rollback QA"}',now());
update app_roles set role='moderator' where user_id='fd130000-0000-4000-8000-000000000001';
insert into listings(id,seller_id,lifecycle_state,draft)values('fd130001-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','pending','{}');
insert into published_listings(id,payload)values('fd130001-0000-4000-8000-000000000001','{}');
update listings set lifecycle_state='published',last_published='{}' where id='fd130001-0000-4000-8000-000000000001';
do $$declare l listings;v jsonb;begin
 select * into l from listings where id='fd130001-0000-4000-8000-000000000001';
 if l.availability_expires_at<>now()+interval '90 days' or not gp_listing_available(l.id) then raise exception 'initial90day';end if;
 begin perform gp_confirm_availability(l.id,999);raise exception 'wrong_version_accepted';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 perform gp_confirm_availability(l.id,1);
 if (select row_version<>2 or updated_at<>l.updated_at from listings where id=l.id) then raise exception 'confirmation_bumped_content_timestamp';end if;
 update listings set draft=draft||'{"title":"edit"}' where id=l.id;
 if (select availability_expires_at<>l.availability_expires_at from listings where id=l.id) then raise exception 'minor_edit_extended';end if;
 update listings set availability_expires_at=now()+interval '13 days' where id=l.id;
 perform gp_run_availability(array[l.id],'availability-v1-retention-observe');perform gp_run_availability(array[l.id],'availability-v1-retention-observe');
 if (select count(*) from notification_outbox where target_id like l.id||':%')<>1 then raise exception 'reminder_duplicate';end if;
 update listings set availability_expires_at=now()+interval '2 days' where id=l.id;perform gp_run_availability(array[l.id],'availability-v1-retention-observe');
 if (select count(*) from notification_outbox where type='availability_3' and target_id like l.id||':%')<>1 then raise exception 'three_day_reminder';end if;
 update listings set availability_expires_at=now()-interval '1 second' where id=l.id;
 if gp_listing_available(l.id) or gp_scene_public(l.id,null) is not null then raise exception 'deadline_not_hidden';end if;
 execute 'set local role anon';
 if (select count(*) from published_listings where id=l.id)<>0 then raise exception 'anon_deadline_rls_failed';end if;
 execute 'reset role';
 begin perform gp_confirm_availability(l.id,2);raise exception 'expired_confirm_accepted';exception when others then if sqlerrm<>'AVAILABILITY_REVIEW_REQUIRED' then raise;end if;end;
 update listings set lifecycle_state='paused' where id=l.id;
 begin update listings set lifecycle_state='published' where id=l.id;raise exception 'expired_resume_accepted';exception when others then if sqlerrm<>'AVAILABILITY_REVIEW_REQUIRED' then raise;end if;end;
 perform gp_run_availability(array[l.id],'availability-v1-retention-observe');
 if exists(select 1 from published_listings where id=l.id) or not exists(select 1 from listings where id=l.id and lifecycle_state='expired' and last_published is null) then raise exception 'expiry_failed';end if;
 begin update listings set lifecycle_state='published' where id=l.id;raise exception 'cleanup_race_accepted';exception when others then if sqlerrm<>'AVAILABILITY_CLEANUP_PENDING' then raise;end if;end;
 perform gp_finish_availability_cleanup(l.id,(select row_version from listings where id=l.id));
 update listings set lifecycle_state='pending' where id=l.id;insert into published_listings(id,payload)values(l.id,'{}');update listings set lifecycle_state='published',last_published='{}' where id=l.id;
 if not gp_listing_available(l.id) then raise exception 'reviewed_republication_failed';end if;
 update account_statuses set status='suspended' where user_id=l.seller_id;
 begin perform gp_confirm_availability(l.id,3);raise exception 'suspended_accepted';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 if has_function_privilege('anon','gp_run_availability(uuid[],text)','EXECUTE') or has_function_privilege('authenticated','gp_maintenance_plan(integer)','EXECUTE') then raise exception 'job_privilege_leak';end if;
 if not has_function_privilege('service_role','gp_run_availability(uuid[],text)','EXECUTE') then raise exception 'worker_missing';end if;
end;$$;
insert into media_assets(id,owner_id,listing_id,object_key,mime,created_at) values
('fd130002-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','fd130001-0000-4000-8000-000000000001','availability-rollback-retained','image/webp',now()-interval '8 days'),
('fd130002-0000-4000-8000-000000000002','fd130000-0000-4000-8000-000000000001','fd130001-0000-4000-8000-000000000001','availability-rollback-orphan','image/webp',now()-interval '8 days');
insert into listing_revisions(listing_id,revision_no,payload) values('fd130001-0000-4000-8000-000000000001',999,'{"spacePhotos":{"unit":["/api/media/fd130002-0000-4000-8000-000000000001"]}}');
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at)
select id,'fd130001-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','availability-rollback-'||id,'application/pdf',100,repeat('a',64),now()-interval '8 days' from unnest(array['fd130003-0000-4000-8000-000000000001','fd130003-0000-4000-8000-000000000002']::uuid[])id;
insert into parking_scenes(listing_id,owner_id,creator_id,manifest,evidence_ids) values('fd130001-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','{}',array['fd130003-0000-4000-8000-000000000001'::uuid]);
do $$declare plan jsonb;begin plan=gp_maintenance_plan();
if not (plan->'retentionCandidates'->'orphanMedia7d' ? 'fd130002-0000-4000-8000-000000000002') or (plan->'retentionCandidates'->'orphanMedia7d' ? 'fd130002-0000-4000-8000-000000000001') or not (plan->'retentionCandidates'->'orphanSceneSources7d' ? 'fd130003-0000-4000-8000-000000000002') or (plan->'retentionCandidates'->'orphanSceneSources7d' ? 'fd130003-0000-4000-8000-000000000001') then raise exception 'retention_references_failed';end if;end;$$;
rollback;
