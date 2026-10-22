-- 033: operator-only, policy-gated retention and resumable active-system erasure.
-- No policy is inserted or enabled by this migration. Storage/Auth use their APIs.
begin;
create table gp_private.retention_policies(
 policy_key text not null check(policy_key~'^[a-z0-9_-]{3,80}$'),version integer not null check(version>0),
 rules jsonb not null,approved_by text not null check(length(btrim(approved_by)) between 5 and 200),
 reason text not null check(length(btrim(reason)) between 15 and 2000),approved_at timestamptz not null default now(),
 disabled_at timestamptz,primary key(policy_key,version)
);
create table gp_private.retention_holds(
 kind text not null check(kind in('account','draft','media','source')),subject_id uuid not null,
 active boolean not null,reason text not null check(length(btrim(reason)) between 15 and 2000),
 operator_reference text not null check(length(btrim(operator_reference)) between 5 and 200),
 row_version integer not null default 1,updated_at timestamptz not null default now(),primary key(kind,subject_id)
);
create table gp_private.retention_jobs(
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in('account','draft','media','source')),
 subject_id uuid not null,subject_user_id uuid,policy_key text not null,policy_version integer not null,
 state text not null default 'prepared' check(state in('prepared','purging','auth_pending','completed')),
 graph_hash text not null check(graph_hash~'^[a-f0-9]{64}$'),objects jsonb not null,listing_ids uuid[] not null,
 media_ids uuid[] not null,source_ids uuid[] not null,review_reference text not null check(length(btrim(review_reference)) between 15 and 2000),
 operator_reference text not null check(length(btrim(operator_reference)) between 5 and 200),
 backup_reference text not null check(length(btrim(backup_reference)) between 15 and 2000),
 row_version integer not null default 1,lease_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),
 completed_at timestamptz,unique(kind,subject_id),foreign key(policy_key,policy_version) references gp_private.retention_policies(policy_key,version)
);
alter table gp_private.retention_policies enable row level security;
alter table gp_private.retention_holds enable row level security;
alter table gp_private.retention_jobs enable row level security;
revoke all on gp_private.retention_policies,gp_private.retention_holds,gp_private.retention_jobs from public,anon,authenticated;
create index retention_jobs_active on gp_private.retention_jobs(state) where state in('purging','auth_pending');
-- A completed receipt must survive deletion of its Auth identity.
alter table gp_private.privacy_requests drop constraint privacy_requests_user_id_fkey;
alter table gp_private.privacy_requests alter column user_id drop not null;
alter table gp_private.privacy_requests add foreign key(user_id) references auth.users(id) on delete set null;
alter table gp_private.privacy_requests drop constraint privacy_requests_state_check;
alter table gp_private.privacy_requests add check(state in('requested','manual_review','purging','completed'));
alter table gp_private.privacy_requests add column row_version integer not null default 1;

create function gp_private.retention_service() returns void language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$begin
 if current_user<>'service_role' and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
end;$$;
create function gp_private.retention_policy(p_key text,p_version integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare rules jsonb;begin
 perform gp_private.retention_service();
 select p.rules into rules from gp_private.retention_policies p where policy_key=p_key and version=p_version and disabled_at is null;
 if rules is null then raise exception 'RETENTION_POLICY_REQUIRED';end if;return rules;end;$$;
create function public.gp_retention_approve_policy(p_key text,p_version integer,p_rules jsonb,p_operator_reference text,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare key text;begin
 perform gp_private.retention_service();
 if jsonb_typeof(p_rules) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_rules))<>4 then raise exception 'RETENTION_POLICY_INVALID';end if;
 foreach key in array array['account','draft','media','source'] loop
 if not(p_rules ? key) or jsonb_typeof(p_rules->key) is distinct from 'number' or (p_rules->>key)!~'^[0-9]+$' or (p_rules->>key)::numeric>3155760000 then raise exception 'RETENTION_POLICY_INVALID';end if;end loop;
 insert into gp_private.retention_policies(policy_key,version,rules,approved_by,reason) values(p_key,p_version,p_rules,btrim(p_operator_reference),btrim(p_reason));
 insert into audit_events(action,target_id,detail) values('retention.policy_approved',p_key||':'||p_version,'explicit operator policy; no automatic activation defaults');
 return jsonb_build_object('policyKey',p_key,'policyVersion',p_version,'approved',true);end;$$;
create function public.gp_retention_disable_policy(p_key text,p_version integer,p_reason text) returns void language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$begin
 perform gp_private.retention_service();if length(btrim(p_reason)) not between 15 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 update gp_private.retention_policies set disabled_at=now() where policy_key=p_key and version=p_version;
 insert into audit_events(action,target_id,detail)values('retention.policy_disabled',p_key||':'||p_version,btrim(p_reason));end;$$;
create function public.gp_retention_hold(p_kind text,p_id uuid,p_expected_version integer,p_active boolean,p_operator_reference text,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare old gp_private.retention_holds;begin
 perform gp_private.retention_service();perform pg_advisory_xact_lock(hashtextextended('retention:'||p_kind||':'||p_id,0));
 perform id from gp_private.retention_jobs where(kind=p_kind and subject_id=p_id)or(p_kind='account'and subject_user_id=p_id)or(p_kind='draft'and p_id=any(listing_ids))or(p_kind='media'and p_id=any(media_ids))or(p_kind='source'and p_id=any(source_ids))order by id for update;
 select * into old from gp_private.retention_holds where kind=p_kind and subject_id=p_id for update;
 if coalesce(old.row_version,0) is distinct from p_expected_version then raise exception 'VERSION_CONFLICT';end if;
 insert into gp_private.retention_holds(kind,subject_id,active,reason,operator_reference,row_version) values(p_kind,p_id,p_active,btrim(p_reason),btrim(p_operator_reference),p_expected_version+1)
 on conflict(kind,subject_id)do update set active=excluded.active,reason=excluded.reason,operator_reference=excluded.operator_reference,row_version=excluded.row_version,updated_at=now();
 insert into audit_events(action,target_id,detail)values('retention.hold_changed',p_id::text,'active='||p_active);
 return jsonb_build_object('version',p_expected_version+1,'active',p_active);end;$$;

create function gp_private.retention_candidate(p_kind text,p_id uuid,p_key text,p_policy_version integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$
declare rules jsonb;u uuid;born timestamptz;target jsonb;list_ids uuid[]='{}';med_ids uuid[]='{}';src_ids uuid[]='{}';objs jsonb;blocked text[]='{}';graph_snapshot jsonb;begin
 perform gp_private.retention_service();rules=gp_private.retention_policy(p_key,p_policy_version);
 if p_kind is null or p_kind not in('account','draft','media','source') or p_id is null then raise exception 'VALIDATION_ERROR';end if;
 if p_kind='account' then
 select to_jsonb(r),r.user_id,r.created_at into target,u,born from gp_private.privacy_requests r where id=p_id;
 if target is null then raise exception 'NOT_FOUND';end if;
 if target->>'state' not in('requested','manual_review','purging') then blocked=array_append(blocked,'REQUEST_REVIEW_REQUIRED');end if;
 if not exists(select 1 from account_statuses where user_id=u and status='deletion_pending') then blocked=array_append(blocked,'ACCOUNT_NOT_DEACTIVATED');end if;
 if exists(select 1 from app_roles where user_id=u and role<>'member') then blocked=array_append(blocked,'PRIVILEGED_ACCOUNT_REVIEW');end if;
 select coalesce(array_agg(id order by id),'{}') into list_ids from listings where seller_id=u;
 elsif p_kind='draft' then
 select to_jsonb(l),seller_id,updated_at into target,u,born from listings l where id=p_id;list_ids=array[p_id];
 if target is null then raise exception 'NOT_FOUND';end if;
 if target->>'lifecycle_state'<>'draft' or target->'last_published'<>'null'::jsonb or exists(select 1 from listing_revisions where listing_id=p_id) then blocked=array_append(blocked,'NOT_ABANDONED_DRAFT');end if;
 elsif p_kind='media' then
 select to_jsonb(m),owner_id,created_at into target,u,born from media_assets m where id=p_id;med_ids=array[p_id];
 if target is null then raise exception 'NOT_FOUND';end if;
 else
 select to_jsonb(s),owner_id,created_at into target,u,born from parking_scene_sources s where id=p_id;src_ids=array[p_id];
 if target is null then raise exception 'NOT_FOUND';end if;
 end if;
 if born+make_interval(secs=>(rules->>p_kind)::double precision)>now() then blocked=array_append(blocked,'RETENTION_NOT_DUE');end if;
 if p_kind='source'and target->>'uploader_id'is distinct from u::text then blocked=array_append(blocked,'FOREIGN_ASSET_OWNER');end if;
 if p_kind='account'and(exists(select 1 from media_assets where owner_id=u and not(listing_id=any(list_ids)))or exists(select 1 from parking_scene_sources where owner_id=u and not(listing_id=any(list_ids))))then blocked=array_append(blocked,'FOREIGN_LISTING_REFERENCE');end if;
 if cardinality(list_ids)>500 then blocked=array_append(blocked,'SELECTION_TOO_LARGE');end if;
 if cardinality(list_ids)>0 then
 select coalesce(array_agg(id order by id),'{}')into med_ids from media_assets where listing_id=any(list_ids);
 select coalesce(array_agg(id order by id),'{}')into src_ids from parking_scene_sources where listing_id=any(list_ids);
 if exists(select 1 from media_assets where id=any(med_ids) and owner_id<>u)or exists(select 1 from parking_scene_sources where id=any(src_ids)and(owner_id<>u or uploader_id<>u))then blocked=array_append(blocked,'FOREIGN_ASSET_OWNER');end if;
 if exists(select 1 from conversations where listing_id=any(list_ids))or exists(select 1 from favorites where listing_id=any(list_ids)and user_id<>u)or exists(select 1 from reports where listing_id=any(list_ids))or exists(select 1 from registry_conflicts where listing_id=any(list_ids)or other_listing_id=any(list_ids))then blocked=array_append(blocked,'SHARED_OR_REPORTED_LISTING');end if;
 if exists(select 1 from registry_identity_history where listing_id=any(list_ids))then blocked=array_append(blocked,'PHYSICAL_HISTORY_REVIEW');end if;
 end if;
 if p_kind='account' and(
 exists(select 1 from conversations where buyer_id=u or seller_id=u)or exists(select 1 from messages where sender_id=u)or exists(select 1 from reports where user_id=u or decided_by=u)or exists(select 1 from context_reports where user_id=u)
 or exists(select 1 from gp_private.context_report_decisions where actor_id=u)or exists(select 1 from listing_revisions where actor_id=u and not(listing_id=any(list_ids)))or exists(select 1 from registry_identity_history where actor_id=u)
 or exists(select 1 from parking_scenes where owner_id=u or creator_id=u or reviewer_id=u)
 or exists(select 1 from parking_scene_sources where uploader_id=u and owner_id<>u)
 or exists(select 1 from gp_private.export_jobs where user_id=u and state in('queued','processing') and(lease_until is null or lease_until>now()))
 )then blocked=array_append(blocked,'SHARED_CONTEXT_REVIEW');end if;
 -- Sources used by ANY scene or historical common plan are retained, even withdrawn.
 if exists(select 1 from parking_scene_sources where id=any(src_ids)and processing_state='processing'and lease_until>now())then blocked=array_append(blocked,'SOURCE_PROCESSING_ACTIVE');end if;
 if exists(select 1 from context_reports where target_id=any(list_ids||med_ids||src_ids||case when p_kind='account'then array[u]else '{}'::uuid[]end))then blocked=array_append(blocked,'REPORTED_CONTEXT_RETAINED');end if;
 if exists(select 1 from parking_scenes where evidence_ids&&src_ids)or exists(select 1 from parking_level_plans where evidence_ids&&src_ids)then blocked=array_append(blocked,'SCENE_EVIDENCE_RETAINED');end if;
 if to_regclass('gp_private.parking_level_plan_revisions') is null then blocked=array_append(blocked,'HISTORY_SCHEMA_REQUIRED');else
 if p_kind='account'and exists(select 1 from gp_private.parking_level_plan_revisions where reviewer_id=u)then blocked=array_append(blocked,'HISTORICAL_REVIEWER_RETAINED');end if;
 if exists(select 1 from gp_private.parking_level_plan_revisions h where h.evidence_ids&&src_ids or exists(select 1 from unnest(med_ids||src_ids)x where position(x::text in h.manifest::text)>0))then blocked=array_append(blocked,'HISTORICAL_SCENE_EVIDENCE_RETAINED');end if;end if;
 if exists(select 1 from parking_scenes where listing_id=any(list_ids))then blocked=array_append(blocked,'SCENE_HISTORY_RETAINED');end if;
 if exists(select 1 from listings l where not(l.id=any(list_ids))and exists(select 1 from unnest(med_ids||src_ids) x where position(x::text in l.draft::text)>0 or position(x::text in coalesce(l.last_published::text,''))>0))
 or exists(select 1 from listing_revisions r where not(r.listing_id=any(list_ids))and exists(select 1 from unnest(med_ids||src_ids)x where position(x::text in r.payload::text)>0))or exists(select 1 from published_listings p where not(p.id=any(list_ids))and exists(select 1 from unnest(med_ids||src_ids)x where position(x::text in p.payload::text)>0))then blocked=array_append(blocked,'ASSET_REFERENCED');end if;
 if p_kind in('media','source')and exists(select 1 from gp_private.export_jobs where state in('queued','processing')and(position(p_id::text in files::text)>0 or position(p_id::text in snapshot::text)>0))then blocked=array_append(blocked,'EXPORT_REFERENCE_RETAINED');end if;
 if p_kind in('media','source')and(
 exists(select 1 from listings l where position(p_id::text in l.draft::text)>0 or position(p_id::text in coalesce(l.last_published::text,''))>0)
 or exists(select 1 from listing_revisions r where position(p_id::text in r.payload::text)>0)
 or exists(select 1 from parking_scenes s where position(p_id::text in s.manifest::text)>0)or exists(select 1 from parking_level_plans s where position(p_id::text in s.manifest::text)>0)or exists(select 1 from published_listings p where position(p_id::text in p.payload::text)>0)
 )then blocked=array_append(blocked,'ASSET_REFERENCED');end if;
 if exists(select 1 from gp_private.retention_holds where active and((kind=p_kind and subject_id=p_id)or(kind='account'and subject_id=u)or(kind='draft'and subject_id=any(list_ids))or(kind='media'and subject_id=any(med_ids))or(kind='source'and subject_id=any(src_ids))))then blocked=array_append(blocked,'RETENTION_HOLD');end if;
 -- Owner-owned unclassified objects cannot silently be swept from unrelated buckets.
 if p_kind='account'and exists(select 1 from storage.objects o where coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=u::text and bucket_id not in('private-uploads','public-approved','scene-sources','private-exports'))then blocked=array_append(blocked,'UNKNOWN_STORAGE_BUCKET');end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'name',o.name,'storageFingerprint',encode(pg_catalog.sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex'))order by o.bucket_id,o.name),'[]')into objs from storage.objects o where
 (p_kind='account'and coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=u::text and bucket_id in('private-uploads','public-approved','scene-sources','private-exports'))
 or(o.bucket_id in('private-uploads','scene-sources')and split_part(o.name,'/',1)=u::text and split_part(o.name,'/',2)=any(array(select x::text from unnest(list_ids)x)))
 or(o.bucket_id='private-uploads'and exists(select 1 from media_assets m where m.id=any(med_ids)and m.object_key=o.name))
 or(o.bucket_id='public-approved'and exists(select 1 from unnest(med_ids) m where o.name=m::text||'.webp'))
 or(o.bucket_id='scene-sources'and exists(select 1 from parking_scene_sources s where s.id=any(src_ids)and(s.object_key=o.name or o.name=any(s.preview_keys))))
 or(p_kind='account'and o.bucket_id='private-exports'and exists(select 1 from gp_private.export_jobs j where j.user_id=u and j.object_key=o.name));
 if exists(select 1 from jsonb_array_elements(objs)x join storage.objects o on o.bucket_id=x->>'bucket'and o.name=x->>'name'where nullif(coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner'),'')is not null and coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')<>u::text)then blocked=array_append(blocked,'FOREIGN_STORAGE_OWNER');end if;
 if jsonb_array_length(objs)>1000 or cardinality(med_ids)>1000 or cardinality(src_ids)>100 then blocked=array_append(blocked,'SELECTION_TOO_LARGE');end if;
 graph_snapshot=jsonb_build_object('target',target,'listings',(select coalesce(jsonb_agg(to_jsonb(l)order by id),'[]')from listings l where id=any(list_ids)),
 'media',(select coalesce(jsonb_agg(to_jsonb(m)order by id),'[]')from media_assets m where id=any(med_ids)),
 'sources',(select coalesce(jsonb_agg(to_jsonb(s)order by id),'[]')from parking_scene_sources s where id=any(src_ids)),'objects',objs);
 return jsonb_build_object('kind',p_kind,'id',p_id,'userId',u,'eligible',cardinality(blocked)=0,'blockers',to_jsonb(blocked),'graphHash',encode(pg_catalog.sha256(convert_to(graph_snapshot::text,'UTF8')),'hex'),'objects',objs,'listingIds',to_jsonb(list_ids),'mediaIds',to_jsonb(med_ids),'sourceIds',to_jsonb(src_ids));end;$$;

create function public.gp_retention_plan(p_kind text,p_ids uuid[],p_policy_key text,p_policy_version integer)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare id uuid;items jsonb='[]';begin
 perform gp_private.retention_service();perform gp_private.retention_policy(p_policy_key,p_policy_version);
 if p_ids is null or cardinality(p_ids)not between 1 and 100 or exists(select 1 from unnest(p_ids)x where x is null)or cardinality(p_ids)<>(select count(distinct x)from unnest(p_ids)x)then raise exception 'SELECTION_REQUIRED';end if;
 foreach id in array p_ids loop items=items||jsonb_build_array(gp_private.retention_candidate(p_kind,id,p_policy_key,p_policy_version));end loop;
 return jsonb_build_object('dryRun',true,'policyKey',p_policy_key,'policyVersion',p_policy_version,'items',items);end;$$;
create function public.gp_retention_prepare(p_kind text,p_id uuid,p_graph_hash text,p_policy_key text,p_policy_version integer,p_operator_reference text,p_review_reference text,p_backup_reference text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare c jsonb;j gp_private.retention_jobs;begin
 perform gp_private.retention_service();perform pg_advisory_xact_lock(hashtextextended('retention:'||p_kind||':'||p_id,0));
 select * into j from gp_private.retention_jobs where kind=p_kind and subject_id=p_id for update;
 if found then return jsonb_build_object('id',j.id,'version',j.row_version,'state',j.state,'replayed',true);end if;
 c=gp_private.retention_candidate(p_kind,p_id,p_policy_key,p_policy_version);
 if c->>'eligible'<>'true'then raise exception 'RETENTION_BLOCKED';end if;
 if c->>'graphHash'is distinct from p_graph_hash then raise exception 'VERSION_CONFLICT';end if;
 insert into gp_private.retention_jobs(kind,subject_id,subject_user_id,policy_key,policy_version,graph_hash,objects,listing_ids,media_ids,source_ids,operator_reference,review_reference,backup_reference)
 values(p_kind,p_id,(c->>'userId')::uuid,p_policy_key,p_policy_version,p_graph_hash,c->'objects',array(select jsonb_array_elements_text(c->'listingIds')::uuid),array(select jsonb_array_elements_text(c->'mediaIds')::uuid),array(select jsonb_array_elements_text(c->'sourceIds')::uuid),btrim(p_operator_reference),btrim(p_review_reference),btrim(p_backup_reference))returning * into j;
 insert into audit_events(action,target_id,detail)values('retention.reviewed',j.id::text,'kind='||p_kind||'; policy='||p_policy_key||':'||p_policy_version);
 return jsonb_build_object('id',j.id,'version',j.row_version,'state',j.state,'replayed',false);end;$$;

create function gp_private.retention_check_job(j gp_private.retention_jobs)returns void language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$begin
 perform gp_private.retention_service();perform gp_private.retention_policy(j.policy_key,j.policy_version);
 if exists(select 1 from gp_private.retention_holds where active and((kind=j.kind and subject_id=j.subject_id)or(kind='account'and subject_id=j.subject_user_id)or(kind='draft'and subject_id=any(j.listing_ids))or(kind='media'and subject_id=any(j.media_ids))or(kind='source'and subject_id=any(j.source_ids))))then raise exception 'RETENTION_HOLD';end if;end;$$;
create function public.gp_retention_claim(p_job uuid,p_expected_version integer)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare j gp_private.retention_jobs;c jsonb;t uuid=gen_random_uuid();begin
 perform gp_private.retention_service();select * into j from gp_private.retention_jobs where id=p_job for update;if not found then raise exception 'NOT_FOUND';end if;
 if j.state='completed'then return jsonb_build_object('id',j.id,'state','completed','activeSystemErased',true,'completeErasure',false);end if;
 perform gp_private.retention_check_job(j);
 if p_expected_version is null or p_expected_version<1 or j.row_version<>p_expected_version or j.lease_until>now()then raise exception 'VERSION_CONFLICT';end if;
 if j.state='prepared'then c=gp_private.retention_candidate(j.kind,j.subject_id,j.policy_key,j.policy_version);if c->>'eligible'<>'true'or c->>'graphHash'<>j.graph_hash then raise exception 'RETENTION_REVIEW_STALE';end if;end if;
 update gp_private.retention_jobs set state=case when state='prepared'then 'purging'else state end,row_version=row_version+1,lease_token=t,lease_until=now()+interval '10 minutes'where id=p_job returning * into j;
 if j.kind='account'then update gp_private.privacy_requests set state='purging',row_version=row_version+1,updated_at=now()where id=j.subject_id and state<>'completed';end if;
 insert into audit_events(action,target_id,detail)values('retention.claimed',j.id::text,'phase='||j.state);
 return jsonb_build_object('id',j.id,'kind',j.kind,'state',j.state,'userId',j.subject_user_id,'version',j.row_version,'leaseToken',t,'objects',j.objects);end;$$;
create function public.gp_retention_checkpoint(p_job uuid,p_lease uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare j gp_private.retention_jobs;begin
 perform gp_private.retention_service();select * into j from gp_private.retention_jobs where id=p_job for update;
 if not found or p_lease is null or j.lease_token is null or j.lease_until is null or j.lease_token is distinct from p_lease or j.lease_until<=now()or j.state not in('purging','auth_pending')then raise exception 'VERSION_CONFLICT';end if;
 perform gp_private.retention_check_job(j);
 -- Missing objects are expected after an interrupted Storage phase. Existing
 -- objects must still be the reviewed row, including on every resumed claim.
 if exists(select 1 from jsonb_array_elements(j.objects)x join storage.objects o on o.bucket_id=x->>'bucket'and o.name=x->>'name'
 where x->>'storageFingerprint'is distinct from encode(pg_catalog.sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex'))then raise exception 'RETENTION_STORAGE_CHANGED';end if;
 update gp_private.retention_jobs set lease_until=now()+interval '10 minutes'where id=p_job;
 return jsonb_build_object('state',j.state,'userId',j.subject_user_id);end;$$;
-- New references to a target being erased must fail before Storage is touched.
create function gp_private.retention_reference_guard()returns trigger language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare text_row text=to_jsonb(new)::text;j gp_private.retention_jobs;begin
 -- An UPDATE may remove the final UUID/path reference from NEW. OLD still
 -- belongs to the protected graph, so detachment/rename must take the same lock.
 if tg_op='UPDATE'then text_row=text_row||to_jsonb(old)::text;end if;
 -- SHARE conflicts with claim's UPDATE lock. A concurrent writer that began
 -- before the claim must finish before its graph is revalidated, or see purging.
 for j in select * from gp_private.retention_jobs r where r.state in('prepared','purging','auth_pending')and(
 position(r.subject_id::text in text_row)>0 or(r.kind='account'and position(r.subject_user_id::text in text_row)>0)
 or exists(select 1 from unnest(r.listing_ids||r.media_ids||r.source_ids)x where position(x::text in text_row)>0))order by id for share loop
 if j.state<>'prepared'then raise exception 'RETENTION_TARGET_LOCKED';end if;end loop;return new;end;$$;
do $$declare r record;begin for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'and(
 (n.nspname='public'and c.relname<>'audit_events')or(n.nspname='gp_private'and c.relname in('export_jobs','context_report_evidence','context_report_decisions','parking_level_plan_revisions'))or(n.nspname='storage'and c.relname='objects'))loop
 execute format('create trigger gp_retention_reference_guard before insert or update on %I.%I for each row execute function gp_private.retention_reference_guard()',r.nspname,r.relname);end loop;end;$$;

create function public.gp_retention_finish_database(p_job uuid,p_lease uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare j gp_private.retention_jobs;u uuid;begin
 perform gp_private.retention_service();perform public.gp_retention_checkpoint(p_job,p_lease);select * into j from gp_private.retention_jobs where id=p_job for update;
 if j.state='auth_pending'then return jsonb_build_object('state','auth_pending','userId',j.subject_user_id);end if;
 if exists(select 1 from jsonb_array_elements(j.objects)x join storage.objects o on o.bucket_id=x->>'bucket'and o.name=x->>'name')then raise exception 'STORAGE_REMOVAL_UNPROVEN';end if;
 -- Any late protected reference fails closed (the trigger prevents new ones).
 if exists(select 1 from gp_private.parking_level_plan_revisions where evidence_ids&&j.source_ids)or exists(select 1 from parking_level_plans where evidence_ids&&j.source_ids)or exists(select 1 from parking_scenes where evidence_ids&&j.source_ids)then raise exception 'SCENE_EVIDENCE_RETAINED';end if;
 delete from favorites where listing_id=any(j.listing_ids)and user_id=j.subject_user_id;
 delete from parking_scene_sources where id=any(j.source_ids);
 delete from media_assets where id=any(j.media_ids);
 delete from published_listings where id=any(j.listing_ids);
 delete from active_space_claims where listing_id=any(j.listing_ids);
 delete from registry_published_units where listing_id=any(j.listing_ids);
 delete from canonical_space_claims where listing_id=any(j.listing_ids);
 delete from registry_listing_units where listing_id=any(j.listing_ids);
 delete from listing_revisions where listing_id=any(j.listing_ids);
 delete from listings where id=any(j.listing_ids);
 if j.kind='account'then
 u=j.subject_user_id;
 delete from favorites where user_id=u;delete from notifications where user_id=u;delete from notification_outbox where user_id=u;
 delete from message_reads where user_id=u;delete from terms_acceptances where user_id=u;
 delete from gp_private.auth_grant_consumptions where user_id=u;delete from gp_private.export_jobs where user_id=u;
 delete from parking_contributors where user_id=u;delete from private_upload_receipts where user_id=u;
 delete from rate_limits where split_part(bucket,':',1)=u::text;
 update audit_events set actor_id=null,target_id=case when target_id=u::text then null else target_id end,detail=null,state_before=null,state_after=null where actor_id=u or target_id=u::text;
 update gp_private.retention_jobs set state='auth_pending',row_version=row_version+1 where id=p_job;
 else update gp_private.retention_jobs set state='completed',completed_at=now(),row_version=row_version+1,lease_token=null,lease_until=null where id=p_job;end if;
 insert into audit_events(action,target_id,detail)values('retention.database_removed',j.id::text,'kind='||j.kind);
 return jsonb_build_object('state',case when j.kind='account'then 'auth_pending'else 'completed'end,'userId',j.subject_user_id);end;$$;
create function public.gp_retention_complete(p_job uuid,p_lease uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare j gp_private.retention_jobs;begin
 perform gp_private.retention_service();select * into j from gp_private.retention_jobs where id=p_job for update;if not found then raise exception 'NOT_FOUND';end if;
 if j.state='completed'then return jsonb_build_object('state','completed','activeSystemErased',true,'completeErasure',false);end if;
 perform public.gp_retention_checkpoint(p_job,p_lease);
 if j.kind<>'account'or j.state<>'auth_pending'then raise exception 'VERSION_CONFLICT';end if;
 if exists(select 1 from auth.users where id=j.subject_user_id)then raise exception 'AUTH_REMOVAL_UNPROVEN';end if;
 if exists(select 1 from storage.objects o where coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=j.subject_user_id::text)
 or exists(select 1 from jsonb_array_elements(j.objects)x join storage.objects o on o.bucket_id=x->>'bucket'and o.name=x->>'name')then raise exception 'STORAGE_REMOVAL_UNPROVEN';end if;
 if exists(select 1 from listings where seller_id=j.subject_user_id)or exists(select 1 from media_assets where owner_id=j.subject_user_id)or exists(select 1 from parking_scene_sources where owner_id=j.subject_user_id or uploader_id=j.subject_user_id)then raise exception 'DATABASE_REMOVAL_UNPROVEN';end if;
 update gp_private.privacy_requests set state='completed',user_id=null,retained_categories='["minimal_receipt","audit","backups_external_rotation"]',row_version=row_version+1,updated_at=now()where id=j.subject_id;
 update gp_private.retention_jobs set state='completed',completed_at=now(),row_version=row_version+1,lease_token=null,lease_until=null,subject_user_id=null,objects='[]'where id=p_job;
 insert into audit_events(action,target_id,detail)values('retention.completed',j.id::text,'active system absence verified; external backup rotation remains separately documented');
 return jsonb_build_object('state','completed','activeSystemErased',true,'completeErasure',false,'retainedCategories',jsonb_build_array('minimal_receipt','audit','backups_external_rotation'));end;$$;
create function public.gp_retention_release(p_job uuid,p_lease uuid,p_error_code text)returns void language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$begin
 perform gp_private.retention_service();if p_error_code not in('STORAGE_FAILED','DATABASE_FAILED','AUTH_FAILED','WORKER_INTERRUPTED')then raise exception 'VALIDATION_ERROR';end if;
 update gp_private.retention_jobs set lease_token=null,lease_until=null,row_version=row_version+1 where id=p_job and lease_token=p_lease and state<>'completed';
 if found then insert into audit_events(action,target_id,detail)values('retention.interrupted',p_job::text,p_error_code);end if;end;$$;
create function public.gp_retention_job(p_job uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gp_private,pg_temp as $$declare j gp_private.retention_jobs;begin perform gp_private.retention_service();select * into j from gp_private.retention_jobs where id=p_job;if not found then raise exception 'NOT_FOUND';end if;return jsonb_build_object('id',j.id,'kind',j.kind,'state',j.state,'version',j.row_version,'completedAt',j.completed_at,'activeSystemErased',j.state='completed','completeErasure',false);end;$$;
create or replace function public.gp_privacy_request_status(p_id uuid,p_receipt_hash text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('id',r.id,'state',r.state,'version',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'limitedCleanupAt',r.limited_cleanup_at,'retainedCategories',r.retained_categories,'activeSystemErased',r.state='completed','completeErasure',false)from gp_private.privacy_requests r where r.id=p_id and r.receipt_hash=p_receipt_hash and r.created_at>now()-interval '90 days'$$;
-- Private helpers are never client-callable. Only explicitly granted operator RPCs escape.
revoke all on function gp_private.retention_service(),gp_private.retention_policy(text,integer),gp_private.retention_candidate(text,uuid,text,integer),gp_private.retention_check_job(gp_private.retention_jobs),gp_private.retention_reference_guard()from public,anon,authenticated;
revoke all on function public.gp_retention_approve_policy(text,integer,jsonb,text,text),public.gp_retention_disable_policy(text,integer,text),public.gp_retention_hold(text,uuid,integer,boolean,text,text),public.gp_retention_plan(text,uuid[],text,integer),public.gp_retention_prepare(text,uuid,text,text,integer,text,text,text),public.gp_retention_claim(uuid,integer),public.gp_retention_checkpoint(uuid,uuid),public.gp_retention_finish_database(uuid,uuid),public.gp_retention_complete(uuid,uuid),public.gp_retention_job(uuid),public.gp_retention_release(uuid,uuid,text)from public,anon,authenticated;
grant execute on function public.gp_retention_approve_policy(text,integer,jsonb,text,text),public.gp_retention_disable_policy(text,integer,text),public.gp_retention_hold(text,uuid,integer,boolean,text,text),public.gp_retention_plan(text,uuid[],text,integer),public.gp_retention_prepare(text,uuid,text,text,integer,text,text,text),public.gp_retention_claim(uuid,integer),public.gp_retention_checkpoint(uuid,uuid),public.gp_retention_finish_database(uuid,uuid),public.gp_retention_complete(uuid,uuid),public.gp_retention_job(uuid),public.gp_retention_release(uuid,uuid,text)to service_role;
commit;
