-- 021: private reauthenticated exports, durable deletion requests, bounded limited cleanup.
begin;
create table gp_private.privacy_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),receipt_hash text not null unique check(receipt_hash~'^[a-f0-9]{64}$'),state text not null default 'requested' check(state in('requested','manual_review')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),limited_cleanup_at timestamptz,retained_categories jsonb not null default '["auth_identity","conversations","reported_context","listing_history","scene_evidence","audit","backups"]',unique(user_id));
alter table gp_private.privacy_requests enable row level security;
create index gp_privacy_requests_queue on gp_private.privacy_requests(state,created_at,id);
revoke all on gp_private.privacy_requests from public,anon,authenticated;
create function public.gp_privacy_recent_password() returns boolean language sql stable security invoker set search_path=public,pg_temp as $$select exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='password' and case when a->>'timestamp' ~ '^[0-9]+$' then (a->>'timestamp')::bigint>=extract(epoch from now()-interval '5 minutes') else false end)$$;
create function public.gp_privacy_export() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare u uuid=auth.uid();result jsonb;begin
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;perform gp_limit('privacy_export',3,3600);
 result=jsonb_build_object(
 'formatVersion','gp-private-export-v1','generatedAt',now(),
 'scope','Account data and owned documents metadata; binary files are not embedded; internal moderation evidence and credentials are excluded.',
 'profile',(select to_jsonb(p) from profiles p where user_id=u),
 'identity',(select jsonb_build_object('id',id,'email',email,'emailConfirmedAt',email_confirmed_at,'createdAt',created_at) from auth.users where id=u),
 'accountStatus',(select status from account_statuses where user_id=u),
 'listings',coalesce((select jsonb_agg(to_jsonb(l)) from listings l where seller_id=u),'[]'),
 'listingRevisions',coalesce((select jsonb_agg(to_jsonb(r)) from listing_revisions r join listings l on l.id=r.listing_id where l.seller_id=u),'[]'),
 'mediaAssets',coalesce((select jsonb_agg(to_jsonb(a)) from media_assets a where owner_id=u),'[]'),
 'favorites',coalesce((select jsonb_agg(to_jsonb(f)) from favorites f where user_id=u),'[]'),
 'conversations',coalesce((select jsonb_agg(to_jsonb(c)) from conversations c where u in(c.buyer_id,c.seller_id)),'[]'),
 'messagesSent',coalesce((select jsonb_agg(to_jsonb(m)) from messages m where sender_id=u),'[]'),
 'visits',coalesce((select jsonb_agg(to_jsonb(v)) from visit_requests v join conversations c on c.id=v.conversation_id where u in(c.buyer_id,c.seller_id)),'[]'),
 'messageReads',coalesce((select jsonb_agg(to_jsonb(r)) from message_reads r where user_id=u),'[]'),
 'blocksByMe',coalesce((select jsonb_agg(to_jsonb(b)) from conversation_blocks b where user_id=u),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from notifications n where user_id=u),'[]'),
 'listingReportsByMe',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'listingId',r.listing_id,'reason',r.reason,'status',r.status,'decisionReason',r.decision_reason,'createdAt',r.created_at,'decidedAt',r.decided_at)) from reports r where user_id=u),'[]'),
 'contextReportsByMe',coalesce((select jsonb_agg(to_jsonb(r)-'client_request_id') from context_reports r where user_id=u),'[]'),
 'termsAcceptances',coalesce((select jsonb_agg(to_jsonb(t)) from terms_acceptances t where user_id=u),'[]'),
 'scenesOwned',coalesce((select jsonb_agg(to_jsonb(s)) from parking_scenes s where owner_id=u),'[]'),
 'sceneSourcesOwned',coalesce((select jsonb_agg(to_jsonb(s)) from parking_scene_sources s where owner_id=u and uploader_id=u),'[]'),
 'registryContributions',coalesce((select jsonb_agg(to_jsonb(c)) from parking_contributors c where user_id=u),'[]'),
 'auditAboutMe',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'targetId',target_id,'createdAt',created_at)) from audit_events where actor_id=u),'[]'));
 insert into audit_events(actor_id,action,target_id) values(u,'privacy.export_prepared',u::text);return result;end;$$;
alter function public.gp_delete_account() rename to gp_delete_account_before_privacy;
revoke all on function public.gp_delete_account_before_privacy() from public,anon,authenticated;
create function public.gp_privacy_request_deletion(p_receipt_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare u uuid=auth.uid();r gp_private.privacy_requests;begin
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;
 if p_receipt_hash is null or p_receipt_hash!~'^[a-f0-9]{64}$' then raise exception 'VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended('privacy-last-admin',0));
 if gp_role()='admin' and (select count(*) from app_roles a join account_statuses s using(user_id) where a.role='admin' and s.status='active')<=1 then raise exception 'LAST_ADMIN';end if;
 perform gp_delete_account_before_privacy();
 insert into gp_private.privacy_requests(user_id,receipt_hash) values(u,p_receipt_hash) returning * into r;
 insert into audit_events(actor_id,action,target_id) values(u,'privacy.deletion_requested',r.id::text);
 return jsonb_build_object('id',r.id,'state',r.state,'createdAt',r.created_at,'retainedCategories',r.retained_categories);end;$$;
-- Legacy RPC still creates a durable request; it cannot bypass the queue.
create function public.gp_delete_account() returns void language plpgsql security definer set search_path=public,pg_temp as $$begin perform gp_privacy_request_deletion(encode(extensions.gen_random_bytes(32),'hex'));end;$$;
revoke all on function public.gp_delete_account() from public,anon,authenticated;
grant execute on function public.gp_delete_account() to authenticated;
create function public.gp_privacy_request_status(p_id uuid,p_receipt_hash text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('id',id,'state',state,'createdAt',created_at,'updatedAt',updated_at,'limitedCleanupAt',limited_cleanup_at,'retainedCategories',retained_categories,'completeErasure',false) from gp_private.privacy_requests where id=p_id and receipt_hash=p_receipt_hash and created_at>now()-interval '90 days'$$;
create function public.gp_privacy_cleanup_plan(p_limit integer default 100) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('policy','privacy-limited-cleanup-v1','eligibleRequestIds',coalesce((select jsonb_agg(id) from(select id from gp_private.privacy_requests where state='requested' and created_at<now()-interval '7 days' order by created_at,id limit least(100,greatest(1,p_limit))) q),'[]'),'completeErasure',false,'preserved','Auth, messages, reported evidence, listing/scene history, audit, storage and backups require a justified retention schedule; this worker does not erase them.')$$;
create function public.gp_privacy_cleanup(p_ids uuid[],p_policy text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r gp_private.privacy_requests;done uuid[]='{}';begin
 if p_policy is distinct from 'privacy-limited-cleanup-v1' or cardinality(p_ids) is null or cardinality(p_ids) not between 1 and 100 or exists(select 1 from unnest(p_ids) x where x is null) or (select count(distinct x) from unnest(p_ids)x)<>cardinality(p_ids) then raise exception 'VALIDATION_ERROR';end if;
 if (select count(*) from gp_private.privacy_requests where id=any(p_ids))<>cardinality(p_ids) then raise exception 'NOT_FOUND';end if;
 for r in select * from gp_private.privacy_requests where id=any(p_ids) order by id for update loop
 if r.state='manual_review' then continue;end if;
 if r.created_at>now()-interval '7 days' or not exists(select 1 from account_statuses where user_id=r.user_id and status='deletion_pending') then raise exception 'PRIVACY_NOT_ELIGIBLE';end if;
 delete from favorites where user_id=r.user_id;delete from notifications where user_id=r.user_id;delete from message_reads where user_id=r.user_id;delete from notification_outbox where user_id=r.user_id and status in('pending','failed');
 update profiles set email_notifications=false where user_id=r.user_id;
 update gp_private.privacy_requests set state='manual_review',limited_cleanup_at=now(),updated_at=now() where id=r.id;
 insert into audit_events(actor_id,action,target_id) values(null,'privacy.limited_cleanup',r.id::text);done=array_append(done,r.id);
 end loop;
 delete from gp_private.auth_grant_consumptions where expires_at<now()-interval '1 day';
 return jsonb_build_object('processedIds',to_jsonb(done),'completeErasure',false,'state','manual_review');end;$$;
revoke all on function public.gp_privacy_recent_password(),public.gp_privacy_export(),public.gp_privacy_request_deletion(text),public.gp_privacy_request_status(uuid,text),public.gp_privacy_cleanup_plan(integer),public.gp_privacy_cleanup(uuid[],text) from public,anon,authenticated;
grant execute on function public.gp_privacy_export(),public.gp_privacy_request_deletion(text) to authenticated;
grant execute on function public.gp_privacy_request_status(uuid,text) to anon,authenticated;
grant execute on function public.gp_privacy_cleanup_plan(integer),public.gp_privacy_cleanup(uuid[],text) to service_role;
-- Durable export snapshot and private archive; only a service worker may build/purge files.
create table gp_private.export_jobs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),state text not null default 'queued' check(state in('queued','processing','ready','failed','expired')),snapshot jsonb not null,files jsonb not null,lease_token uuid,lease_until timestamptz,object_key text unique,byte_size bigint,sha256 text,error_code text,created_at timestamptz not null default now(),ready_at timestamptz,expires_at timestamptz,purge_token uuid,purge_until timestamptz);
alter table gp_private.export_jobs enable row level security;
revoke all on gp_private.export_jobs from public,anon,authenticated;
create index gp_export_jobs_queue on gp_private.export_jobs(state,created_at,id);
create function public.gp_export_job_public(j gp_private.export_jobs) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('id',j.id,'state',case when j.expires_at<=now() and j.state='ready' then 'expired' else j.state end,'createdAt',j.created_at,'readyAt',j.ready_at,'expiresAt',j.expires_at,'byteSize',j.byte_size,'errorCode',j.error_code)$$;
create function public.gp_export_request() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare j gp_private.export_jobs;s jsonb;f jsonb;begin
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('export:'||auth.uid(),0));
 if exists(select 1 from gp_private.export_jobs where user_id=auth.uid() and state in('queued','processing')) then raise exception 'EXPORT_PENDING';end if;
 s=gp_privacy_export();
 select coalesce(jsonb_agg(value),'[]') into f from(
 select jsonb_build_object('id',a.id,'kind','media','bucket','private-uploads','objectKey',a.object_key,'mime',a.mime) value from media_assets a where a.owner_id=auth.uid()
 union all select jsonb_build_object('id',x.id,'kind','source','bucket','scene-sources','objectKey',x.object_key,'mime',x.mime) from parking_scene_sources x where x.owner_id=auth.uid() and x.uploader_id=auth.uid()) own_files;
 if octet_length(s::text)>33554432 or jsonb_array_length(f)>250 then raise exception 'EXPORT_TOO_LARGE';end if;
 insert into gp_private.export_jobs(user_id,snapshot,files) values(auth.uid(),s,f) returning * into j;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'privacy.export_requested',j.id::text);return gp_export_job_public(j);end;$$;
create function public.gp_export_history() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select coalesce(jsonb_agg(gp_export_job_public(j) order by j.created_at desc),'[]') from(select * from gp_private.export_jobs where user_id=auth.uid() and gp_active() order by created_at desc,id desc limit 50)j$$;
create function public.gp_export_download(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare j gp_private.export_jobs;begin
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;
 select * into j from gp_private.export_jobs where id=p_id and user_id=auth.uid();if not found then raise exception 'NOT_FOUND';end if;
 if j.state<>'ready' or j.expires_at<=now() or j.purge_token is not null then raise exception 'EXPORT_NOT_READY';end if;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'privacy.export_download',j.id::text);return jsonb_build_object('objectKey',j.object_key,'byteSize',j.byte_size,'sha256',j.sha256);end;$$;
create function public.gp_export_worker_plan() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('policy','private-export-v1','queuedIds',coalesce((select jsonb_agg(id) from(select id from gp_private.export_jobs where state='queued' or(state='processing' and lease_until<now()) order by created_at,id limit 100)q),'[]'),'expiredIds',coalesce((select jsonb_agg(id) from(select id from gp_private.export_jobs where state='ready' and expires_at<=now() order by expires_at,id limit 100)q),'[]'))$$;
create function public.gp_export_claim(p_id uuid,p_policy text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare j gp_private.export_jobs;t uuid=gen_random_uuid();begin
 if p_policy is distinct from 'private-export-v1' then raise exception 'VALIDATION_ERROR';end if;
 select * into j from gp_private.export_jobs where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if j.state not in('queued','processing') or(j.state='processing' and j.lease_until>now()) then raise exception 'VERSION_CONFLICT';end if;
 update gp_private.export_jobs set state='processing',lease_token=t,lease_until=now()+interval '30 minutes' where id=j.id;
 return jsonb_build_object('id',j.id,'userId',j.user_id,'accountActive',exists(select 1 from account_statuses where user_id=j.user_id and status='active'),'leaseToken',t,'previousObjectKey',case when j.state='processing' and j.lease_token is not null then j.user_id||'/'||j.id||'/'||j.lease_token||'.zip' else null end,'snapshot',j.snapshot,'files',j.files,'objectKey',j.user_id||'/'||j.id||'/'||t||'.zip');end;$$;
create function public.gp_export_finish(p_id uuid,p_lease uuid,p_success boolean,p_byte_size bigint default null,p_sha256 text default null,p_error_code text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare j gp_private.export_jobs;begin
 select * into j from gp_private.export_jobs where id=p_id for update;
 if not found or j.state<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'VERSION_CONFLICT';end if;
 if p_success is null or(p_success and(p_byte_size is null or p_byte_size not between 1 and 536870912 or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$'))then raise exception 'VALIDATION_ERROR';end if;
 if p_success then
 if not exists(select 1 from account_statuses where user_id=j.user_id and status='active') then raise exception 'ACCOUNT_INACTIVE';end if;
 update gp_private.export_jobs set state='ready',object_key=j.user_id||'/'||j.id||'/'||p_lease||'.zip',byte_size=p_byte_size,sha256=p_sha256,ready_at=now(),expires_at=now()+interval '7 days',snapshot='{}',files='[]',lease_token=null,lease_until=null where id=j.id returning * into j;
 else update gp_private.export_jobs set state='failed',error_code=case when p_error_code in('EXPORT_TOO_LARGE','SOURCE_UNAVAILABLE','BUILD_FAILED','UPLOAD_FAILED') then p_error_code else 'BUILD_FAILED' end,snapshot='{}',files='[]',lease_token=null,lease_until=null where id=j.id returning * into j;end if;
 insert into audit_events(actor_id,action,target_id) values(null,'privacy.export_'||j.state,j.id::text);return gp_export_job_public(j);end;$$;
create function public.gp_export_purge_claim(p_id uuid,p_policy text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare j gp_private.export_jobs;t uuid=gen_random_uuid();begin
 if p_policy is distinct from 'private-export-v1' then raise exception 'VALIDATION_ERROR';end if;
 select * into j from gp_private.export_jobs where id=p_id for update;if not found or j.state<>'ready' or j.expires_at>now() or(j.purge_until>now()) then raise exception 'EXPORT_NOT_EXPIRED';end if;
 update gp_private.export_jobs set purge_token=t,purge_until=now()+interval '10 minutes' where id=j.id;return jsonb_build_object('id',j.id,'objectKey',j.object_key,'purgeToken',t);end;$$;
create function public.gp_export_purge_finish(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 update gp_private.export_jobs set state='expired',object_key=null,purge_token=null,purge_until=null where id=p_id and state='ready' and purge_token=p_token and purge_until>now() and expires_at<=now();if not found then raise exception 'VERSION_CONFLICT';end if;
 insert into audit_events(actor_id,action,target_id) values(null,'privacy.export_expired',p_id::text);end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('private-exports','private-exports',false,536870912,array['application/zip']) on conflict(id) do nothing;
create policy gp_export_private_read on storage.objects for select to authenticated using(bucket_id='private-exports' and gp_active() and gp_privacy_recent_password() and exists(select 1 from gp_private.export_jobs j where j.object_key=name and j.user_id=auth.uid() and j.state='ready' and j.expires_at>now() and j.purge_token is null));
-- The policy executes a private helper so clients never gain table access.
create function public.gp_export_storage_read(p_key text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select gp_active() and gp_privacy_recent_password() and exists(select 1 from gp_private.export_jobs j where j.object_key=p_key and j.user_id=auth.uid() and j.state='ready' and j.expires_at>now() and j.purge_token is null)$$;
alter policy gp_export_private_read on storage.objects using(bucket_id='private-exports' and gp_export_storage_read(name));
revoke all on function public.gp_export_job_public(gp_private.export_jobs),public.gp_export_request(),public.gp_export_history(),public.gp_export_download(uuid),public.gp_export_worker_plan(),public.gp_export_claim(uuid,text),public.gp_export_finish(uuid,uuid,boolean,bigint,text,text),public.gp_export_purge_claim(uuid,text),public.gp_export_purge_finish(uuid,uuid),public.gp_export_storage_read(text) from public,anon,authenticated;
grant execute on function public.gp_export_request(),public.gp_export_history(),public.gp_export_download(uuid),public.gp_export_storage_read(text) to authenticated;
grant execute on function public.gp_export_worker_plan(),public.gp_export_claim(uuid,text),public.gp_export_finish(uuid,uuid,boolean,bigint,text,text),public.gp_export_purge_claim(uuid,text),public.gp_export_purge_finish(uuid,uuid) to service_role;

commit;
