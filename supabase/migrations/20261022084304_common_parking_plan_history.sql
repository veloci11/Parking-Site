-- 032: immutable common-plan revisions. Restoration publishes a new version;
-- it never changes a listing, a consent, a seller or a registry link.
begin;
create table gp_private.parking_level_plan_revisions (
  level_id uuid not null references public.parking_levels(id),
  row_version integer not null check(row_version>0),
  manifest jsonb not null, physical_mapping jsonb not null,
  evidence_ids uuid[] not null, evidence_snapshot jsonb not null,
  state text not null check(state in ('published','withdrawn')),
  action text not null check(action in ('publish_level_plan','withdraw_level_plan','restore_level_plan','legacy_snapshot')),
  reviewer_id uuid, reason text not null, created_at timestamptz not null,
  restored_from_version integer, is_demo boolean not null default false,
  primary key(level_id,row_version)
);
alter table gp_private.parking_level_plan_revisions enable row level security;
revoke all on gp_private.parking_level_plan_revisions from public,anon,authenticated;
grant select on gp_private.parking_level_plan_revisions to service_role;
create index gp_level_plan_revision_evidence on gp_private.parking_level_plan_revisions using gin(evidence_ids);

create function gp_private.gp_level_plan_mapping(p_level uuid) returns jsonb language sql stable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('spaceId',id,'publicAlias',public_alias,'levelId',level_id,'number',number,'dimensions',dimensions) order by id),'[]')
  from parking_spaces where level_id=p_level
$$;
create function gp_private.gp_level_plan_evidence(p_ids uuid[]) returns jsonb language sql stable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'listingId',listing_id,'ownerId',owner_id,'sha256',sha256,'mime',mime,'byteSize',byte_size,'objectKey',object_key) order by id),'[]')
  from parking_scene_sources where id=any(p_ids)
$$;
-- This is a capture of the existing state, not a fabricated approval event.
insert into gp_private.parking_level_plan_revisions(level_id,row_version,manifest,physical_mapping,evidence_ids,evidence_snapshot,state,action,reviewer_id,reason,created_at)
select level_id,row_version,manifest,gp_private.gp_level_plan_mapping(level_id),evidence_ids,gp_private.gp_level_plan_evidence(evidence_ids),state,'legacy_snapshot',reviewer_id,reason,reviewed_at from public.parking_level_plans;
insert into public.audit_events(actor_id,action,target_id,detail)
select null,'registry.level_plan_history_backfill',level_id::text,'Existing state captured; no new source verification or historical approval is asserted.' from public.parking_level_plans;

create function gp_private.gp_level_plan_revision_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'PLAN_HISTORY_IMMUTABLE'; end; $$;
create trigger gp_level_plan_revision_immutable before update or delete on gp_private.parking_level_plan_revisions for each row execute function gp_private.gp_level_plan_revision_immutable();

create function gp_private.gp_capture_level_plan_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare restored integer=nullif(current_setting('gp.level_plan_restore_from',true),'')::integer;
begin
  if tg_op='UPDATE' and new.row_version<>old.row_version+1 then raise exception 'VERSION_CONFLICT'; end if;
  insert into gp_private.parking_level_plan_revisions(level_id,row_version,manifest,physical_mapping,evidence_ids,evidence_snapshot,state,action,reviewer_id,reason,created_at,restored_from_version)
  values(new.level_id,new.row_version,new.manifest,gp_private.gp_level_plan_mapping(new.level_id),new.evidence_ids,gp_private.gp_level_plan_evidence(new.evidence_ids),new.state,
    case when restored is not null then 'restore_level_plan' when new.state='withdrawn' then 'withdraw_level_plan' else 'publish_level_plan' end,
    new.reviewer_id,new.reason,new.reviewed_at,restored);
  return new;
end; $$;
create trigger gp_level_plan_capture after insert or update on public.parking_level_plans for each row execute function gp_private.gp_capture_level_plan_revision();

create or replace function public.gp_common_plan_sources_ready(p_level uuid,p_ids uuid[]) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select cardinality(p_ids) between 1 and 20 and cardinality(p_ids)=(select count(distinct s.id) from parking_scene_sources s
join account_statuses a on a.user_id=s.owner_id and a.status='active'
join auth.users owner on owner.id=s.owner_id and owner.email_confirmed_at is not null
where s.id=any(p_ids) and s.processing_state='ready'
and exists(select 1 from storage.objects o where o.bucket_id='scene-sources' and o.name=s.object_key)
and exists(select 1 from registry_listing_units u join parking_spaces sp on sp.id=u.space_id join parking_levels lev on lev.id=sp.level_id
join parking_levels target on target.id=p_level where u.listing_id=s.listing_id and lev.site_id=target.site_id))$$;

create function public.gp_level_plan_history(p_level uuid,p_before_version integer default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare items jsonb;more boolean;current_version integer;
begin
  if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED'; end if;
  if p_before_version is not null and p_before_version<1 then raise exception 'COMMON_PLAN_INVALID'; end if;
  if not exists(select 1 from parking_levels where id=p_level) then raise exception 'NOT_FOUND'; end if;
  select coalesce((select row_version from parking_level_plans where level_id=p_level),0) into current_version;
  with page as (select * from gp_private.parking_level_plan_revisions where level_id=p_level and row_version<coalesce(p_before_version,2147483647) order by row_version desc limit 26)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('version',row_version,'state',state,'action',action,'reason',reason,'createdAt',created_at,
    'spaceCount',jsonb_array_length(manifest->'spaces'),'evidenceCount',cardinality(evidence_ids),'isDemo',is_demo,'restoredFromVersion',restored_from_version)) order by row_version desc),'[]') into items
  from (select * from page order by row_version desc limit 25)p;
  select count(*)>25 into more from(select 1 from gp_private.parking_level_plan_revisions where level_id=p_level and row_version<coalesce(p_before_version,2147483647) limit 26)p;
  return jsonb_strip_nulls(jsonb_build_object('levelId',p_level,'currentVersion',current_version,'items',items,'hasMore',more,'nextBeforeVersion',case when more then (items->24->>'version')::integer else null end));
end; $$;

alter function public.gp_registry_command(jsonb) rename to gp_registry_command_before_plan_history;
create function public.gp_registry_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text=p_command->>'action';lev parking_levels;current_plan parking_level_plans;revision gp_private.parking_level_plan_revisions;
  field text;restored integer;expected integer;result jsonb;
begin
  if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED'; end if;
  perform set_config('gp.level_plan_restore_from','',true);
  if action is distinct from 'restore_level_plan' then return gp_registry_command_before_plan_history(p_command); end if;
  if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'COMMON_PLAN_INVALID'; end if;
  for field in select jsonb_object_keys(p_command) loop
    if field not in ('action','levelId','version','sourceVersion','reason','rightsAttested','checks') then raise exception 'COMMON_PLAN_INVALID'; end if;
  end loop;
  if coalesce(p_command->>'levelId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or jsonb_typeof(p_command->'version') is distinct from 'number' or (p_command->>'version')::numeric not between 1 and 2147483646 or trunc((p_command->>'version')::numeric)<>(p_command->>'version')::numeric
    or jsonb_typeof(p_command->'sourceVersion') is distinct from 'number' or (p_command->>'sourceVersion')::numeric not between 1 and 2147483646 or trunc((p_command->>'sourceVersion')::numeric)<>(p_command->>'sourceVersion')::numeric
    then raise exception 'COMMON_PLAN_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gp:canonical-registry',0));
  select * into lev from parking_levels where id=(p_command->>'levelId')::uuid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into current_plan from parking_level_plans where level_id=lev.id for update;
  expected=(p_command->>'version')::integer;
  if current_plan.level_id is null or current_plan.row_version<>expected then raise exception 'VERSION_CONFLICT'; end if;
  restored=(p_command->>'sourceVersion')::integer;
  select * into revision from gp_private.parking_level_plan_revisions where level_id=lev.id and row_version=restored;
  if not found or revision.state<>'published' or revision.is_demo then raise exception 'PLAN_REVISION_INVALID'; end if;
  if revision.physical_mapping is distinct from gp_private.gp_level_plan_mapping(lev.id)
    or revision.evidence_snapshot is distinct from gp_private.gp_level_plan_evidence(revision.evidence_ids) then raise exception 'PLAN_HISTORY_STALE'; end if;
  if not coalesce(gp_common_plan_sources_ready(lev.id,revision.evidence_ids),false) then raise exception 'SCENE_EVIDENCE_REQUIRED'; end if;
  if not exists(select 1 from registry_published_units r join parking_spaces sp on sp.id=r.space_id join published_listings p on p.id=r.listing_id
    where sp.level_id=lev.id and p.payload->>'locationPrecision'='exact_opt_in' and gp_listing_available(p.id)) then raise exception 'COMMON_PLAN_CONSENT_REQUIRED'; end if;
  perform set_config('gp.level_plan_restore_from',restored::text,true);
  result=gp_registry_command_before_plan_history((p_command-'sourceVersion')||jsonb_build_object('action','publish_level_plan','manifest',revision.manifest,'evidenceIds',to_jsonb(revision.evidence_ids)));
  perform set_config('gp.level_plan_restore_from','',true);
  insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'registry.restore_level_plan',lev.id::text,'sourceVersion='||restored||'; newVersion='||(expected+1)||'; '||btrim(p_command->>'reason'));
  return result;
end; $$;

-- Historical references retain sources even when every current plan is withdrawn.
create or replace function public.gp_orphan_scene_source_candidates(p_limit integer default 100) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select coalesce(jsonb_agg(id),'[]') from(select s.id from parking_scene_sources s where s.created_at<now()-interval '7 days'
  and not exists(select 1 from parking_scenes p where s.id=any(p.evidence_ids))
  and not exists(select 1 from parking_level_plans p where p.state='published' and s.id=any(p.evidence_ids))
  and not exists(select 1 from gp_private.parking_level_plan_revisions r where r.evidence_ids @> array[s.id])
  and not exists(select 1 from listings l where position(s.id::text in l.draft::text)>0 or position(s.id::text in coalesce(l.last_published::text,''))>0)
  and not exists(select 1 from listing_revisions r where position(s.id::text in r.payload::text)>0)
  order by s.id limit least(100,greatest(1,p_limit)))q$$;

revoke all on function gp_private.gp_level_plan_mapping(uuid),gp_private.gp_level_plan_evidence(uuid[]),gp_private.gp_level_plan_revision_immutable(),gp_private.gp_capture_level_plan_revision(),public.gp_level_plan_history(uuid,integer),public.gp_registry_command_before_plan_history(jsonb),public.gp_registry_command(jsonb) from public,anon,authenticated;
grant execute on function public.gp_level_plan_history(uuid,integer),public.gp_registry_command(jsonb) to authenticated;
commit;
