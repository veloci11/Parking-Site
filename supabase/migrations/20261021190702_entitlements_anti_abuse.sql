-- 022. Free V1 rights and effective usage only. No billing or paid product is enabled.
begin;
create table public.plan_definitions(code text primary key check(code='free'),limits jsonb not null,row_version integer not null default 1 check(row_version>0),updated_at timestamptz not null default now());
insert into public.plan_definitions(code,limits) values('free','{"activeListings":10,"draftsPerDay":10,"submissionsPerDay":20,"contactsPerDay":10,"messagesPerMinute":30,"messagesBurst":5,"uploadsPerHour":60,"uploadBytesPerDay":262144000}');
create table public.user_entitlements(user_id uuid primary key references auth.users(id) on delete cascade,plan_code text not null default 'free' references plan_definitions(code) check(plan_code='free'));
insert into public.user_entitlements(user_id) select id from auth.users;
create table public.entitlement_overrides(user_id uuid primary key references auth.users(id) on delete cascade,limits jsonb not null,starts_at timestamptz not null,expires_at timestamptz not null,reason text not null check(length(btrim(reason)) between 15 and 2000),row_version integer not null default 1 check(row_version>0),updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now(),check(expires_at>=starts_at and expires_at<=starts_at+interval '90 days'));
alter table public.plan_definitions enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.entitlement_overrides enable row level security;
revoke all on public.plan_definitions,public.user_entitlements,public.entitlement_overrides from public,anon,authenticated;
create function public.gp_assign_free_entitlement() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin insert into user_entitlements(user_id) values(new.id) on conflict do nothing;return new;end;$$;
create trigger gp_assign_free_entitlement after insert on auth.users for each row execute function gp_assign_free_entitlement();
create function public.gp_limits_valid(p_limits jsonb,p_partial boolean default false) returns boolean language plpgsql immutable security invoker set search_path=public,pg_temp as $$declare k text;v jsonb;maximum bigint;begin
 if jsonb_typeof(p_limits) is distinct from 'object' or (not p_partial and (select count(*) from jsonb_object_keys(p_limits))<>8) then return false;end if;
 for k,v in select key,value from jsonb_each(p_limits) loop
 maximum=case k when 'activeListings' then 500 when 'draftsPerDay' then 1000 when 'submissionsPerDay' then 2000 when 'contactsPerDay' then 1000 when 'messagesPerMinute' then 300 when 'messagesBurst' then 50 when 'uploadsPerHour' then 1000 when 'uploadBytesPerDay' then 2147483648 else null end;
 if maximum is null or jsonb_typeof(v) is distinct from 'number' or (v::text)::numeric<0 or (v::text)::numeric>maximum or trunc((v::text)::numeric)<>(v::text)::numeric then return false;end if;
 end loop;return true;end;$$;
alter table public.plan_definitions add constraint gp_plan_limits_valid check(gp_limits_valid(limits,false));
alter table public.entitlement_overrides add constraint gp_override_limits_valid check(gp_limits_valid(limits,true));
create function public.gp_effective_limits(p_user_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select p.limits||coalesce((select o.limits from entitlement_overrides o where o.user_id=p_user_id and o.starts_at<=now() and o.expires_at>now()),'{}') from plan_definitions p where p.code=coalesce((select plan_code from user_entitlements where user_id=p_user_id),'free')$$;
create function public.gp_active_listing_limit(p_user_id uuid) returns integer language sql stable security definer set search_path=public,pg_temp as $$select (gp_effective_limits(p_user_id)->>'activeListings')::integer$$;
-- Change the original private quota cores too; wrappers alone would leave the old cap of 10.
do $$declare f record;definition text;replacement text;begin
 for f in select p.oid,p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'gp_listing%' or p.proname like 'gp_moderate%') and p.prosrc~'active_count[[:space:]]*>=[[:space:]]*10' loop
 replacement=case when f.proname like 'gp_moderate%' then 'active_count>=public.gp_active_listing_limit(l.seller_id)' else 'active_count>=public.gp_active_listing_limit(auth.uid())' end;
 definition=regexp_replace(f.definition,'active_count[[:space:]]*>=[[:space:]]*10',replacement,'g');execute definition;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'gp_listing%' or p.proname like 'gp_moderate%') and p.prosrc~'active_count[[:space:]]*>=[[:space:]]*10') then raise exception 'LEGACY_QUOTA_CORE';end if;
end;$$;
create function public.gp_quota_rule(p_user_id uuid,p_kind text,p_limit bigint,p_seconds integer) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare limits jsonb=gp_effective_limits(p_user_id);k text;s integer;begin
 k=case p_kind when 'draft' then 'draftsPerDay' when 'submit' then 'submissionsPerDay' when 'contact' then 'contactsPerDay' when 'message' then 'messagesPerMinute' when 'message_burst' then 'messagesBurst' when 'upload' then 'uploadsPerHour' when 'upload_bytes' then 'uploadBytesPerDay' else null end;
 s=case p_kind when 'draft' then 86400 when 'submit' then 86400 when 'contact' then 86400 when 'message' then 60 when 'message_burst' then 5 when 'upload' then 3600 when 'upload_bytes' then 86400 else p_seconds end;
 return jsonb_build_object('limit',case when k is null then p_limit else (limits->>k)::bigint end,'seconds',s);end;$$;
-- Bigint bytes cannot overflow the original integer count column at the 2 GiB hard bound.
alter table public.rate_limits alter column count type bigint;
create function public.gp_consume_user_limit(p_user_id uuid,p_kind text,p_limit bigint,p_seconds integer,p_amount bigint default 1) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare rule jsonb;n bigint;cap bigint;s integer;bucket_key text;reset_time timestamptz;begin
 if p_user_id is null or not exists(select 1 from account_statuses where user_id=p_user_id and status='active') then raise exception 'UNAUTHENTICATED';end if;
 rule=gp_quota_rule(p_user_id,p_kind,p_limit,p_seconds);cap=(rule->>'limit')::bigint;s=(rule->>'seconds')::integer;
 if p_amount is null or p_amount<=0 or cap is null or cap<0 or s is null or s<1 then raise exception 'LIMITS_INVALID';end if;
 bucket_key=p_user_id::text||':'||p_kind;
 insert into rate_limits(bucket,count,reset_at) values(bucket_key,0,now()+make_interval(secs=>s)) on conflict(bucket) do nothing;
 select count,reset_at into n,reset_time from rate_limits where bucket=bucket_key for update;
 if reset_time<=now() then n=0;reset_time=now()+make_interval(secs=>s);end if;
 if n+p_amount>cap then raise exception 'RATE_LIMITED' using detail='retryAfter='||greatest(1,ceil(extract(epoch from reset_time-now())))::bigint;end if;
 update rate_limits set count=n+p_amount,reset_at=reset_time where bucket=bucket_key;
end;$$;
create function public.gp_consume_limit(p_kind text,p_limit bigint,p_seconds integer,p_amount bigint default 1) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if auth.uid() is null or not gp_active() then raise exception 'UNAUTHENTICATED';end if;perform gp_consume_user_limit(auth.uid(),p_kind,p_limit,p_seconds,p_amount);end;$$;
create or replace function public.gp_limit(p_kind text,p_limit integer,p_seconds integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform gp_consume_limit(p_kind,p_limit,p_seconds,1);
 if p_kind='message' then perform gp_consume_limit('message_burst',5,5,1);end if;
end;$$;
-- Serialize retries before the original core checks sender/request id and consumes quota.
alter function public.gp_message(uuid,text,text) rename to gp_message_before_entitlements;
create function public.gp_message(p_conversation_id uuid,p_body text,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:message:'||auth.uid()::text,0));
 return gp_message_before_entitlements(p_conversation_id,p_body,p_request_id);end;$$;
-- Storage makes rollback-only RLS probes and may finish a signed upload as a superuser.
-- Count the real committed object, attributing it to its policy-validated UUID path.
-- A receipt makes probe/retry/final metadata updates idempotent for count and bytes.
create table public.private_upload_receipts(object_id uuid primary key references storage.objects(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,bucket_id text not null,object_name text not null,byte_size bigint not null default 0 check(byte_size>=0),created_at timestamptz not null default now());
alter table public.private_upload_receipts enable row level security;
revoke all on public.private_upload_receipts from public,anon,authenticated;
create function public.gp_private_upload_quota() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare bytes bigint=0;charged bigint;target uuid;begin
 if new.bucket_id not in ('private-uploads','scene-sources') then return new;end if;
 -- Preview paths are never client-insertable: source-upload RLS accepts only the exact original object_key.
 -- Match a registered original rather than JWT claims; Storage finalizes worker writes as superuser.
 if new.bucket_id='scene-sources' and new.name~'\.preview-[1-3]\.png$' and exists(select 1 from parking_scene_sources s where regexp_replace(new.name,'\.preview-[1-3]\.png$','')=regexp_replace(s.object_key,'\.(pdf|webp)$','')) then return new;end if;
 if split_part(new.name,'/',1)!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'UPLOAD_SIZE_REQUIRED';end if;
 target=split_part(new.name,'/',1)::uuid;
 if new.metadata ? 'size' then
 if jsonb_typeof(new.metadata->'size') is distinct from 'number' or (new.metadata->>'size')!~'^[0-9]+$' then raise exception 'UPLOAD_SIZE_REQUIRED';end if;
 bytes=(new.metadata->>'size')::bigint;if bytes<1 or bytes>(case when new.bucket_id='private-uploads' then 10485760 else 26214400 end) then raise exception 'UPLOAD_SIZE_REQUIRED';end if;
 end if;
 select byte_size into charged from private_upload_receipts where object_id=new.id for update;
 if not found then
 perform gp_consume_user_limit(target,'upload',60,3600,1);
 insert into private_upload_receipts(object_id,user_id,bucket_id,object_name) values(new.id,target,new.bucket_id,new.name);charged=0;
 end if;
 if bytes>charged then perform gp_consume_user_limit(target,'upload_bytes',262144000,86400,bytes-charged);update private_upload_receipts set byte_size=bytes where object_id=new.id;end if;
 return new;end;$$;
create trigger gp_private_upload_quota after insert or update of metadata on storage.objects for each row execute function gp_private_upload_quota();
-- Preserve original path, ownership and per-listing media checks, removing its double charge.
do $$declare definition text;begin
 select pg_get_functiondef('public.gp_storage_allowed(text)'::regprocedure) into definition;
 if position('perform gp_limit(''upload'',60,3600);' in definition)=0 then raise exception 'STORAGE_GUARD_SHAPE';end if;
 execute replace(definition,'perform gp_limit(''upload'',60,3600);','');end;$$;
create function public.gp_entitlement_view(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare caps jsonb=gp_effective_limits(p_user_id);usage jsonb='{}';o entitlement_overrides;rule record;r rate_limits;used bigint;cap bigint;active_count integer;begin
 select * into o from entitlement_overrides where user_id=p_user_id;
 select count(*) into active_count from listings where seller_id=p_user_id and (last_published is not null or lifecycle_state='pending') and lifecycle_state not in ('sold','withdrawn');
 cap=(caps->>'activeListings')::bigint;usage=jsonb_build_object('activeListings',jsonb_build_object('limit',cap,'used',active_count,'remaining',greatest(0,cap-active_count),'resetsAt',null));
 for rule in select * from (values('drafts','draft','draftsPerDay'),('submissions','submit','submissionsPerDay'),('contacts','contact','contactsPerDay'),('messages','message','messagesPerMinute'),('messageBurst','message_burst','messagesBurst'),('uploads','upload','uploadsPerHour'),('uploadBytes','upload_bytes','uploadBytesPerDay')) q(name,kind,cap_key) loop
 select * into r from rate_limits where bucket=p_user_id::text||':'||rule.kind;
 used=case when r.reset_at>now() then r.count else 0 end;cap=(caps->>rule.cap_key)::bigint;
 usage=usage||jsonb_build_object(rule.name,jsonb_build_object('limit',cap,'used',used,'remaining',greatest(0,cap-used),'resetsAt',case when r.reset_at>now() then r.reset_at else null end));
 end loop;
 return jsonb_build_object('plan','free','planVersion',(select row_version from plan_definitions where code='free'),'billingEnabled',false,'limits',caps,'override',case when o.user_id is null then null else jsonb_build_object('version',o.row_version,'startsAt',o.starts_at,'expiresAt',o.expires_at,'active',o.starts_at<=now() and o.expires_at>now()) end,'usage',usage);
end;$$;
create function public.gp_entitlements() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin if not gp_active() then raise exception 'UNAUTHENTICATED';end if;return gp_entitlement_view(auth.uid());end;$$;
create function public.gp_admin_entitlements(p_user_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if p_user_id is not null and not exists(select 1 from account_statuses where user_id=p_user_id) then raise exception 'NOT_FOUND';end if;
 return jsonb_build_object('freePlan',(select jsonb_build_object('version',row_version,'limits',limits) from plan_definitions where code='free'),'user',case when p_user_id is not null then gp_entitlement_view(p_user_id)||jsonb_build_object('userId',p_user_id) else null end);end;$$;
create function public.gp_entitlement_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare action text;reason text;target uuid;version integer;o entitlement_overrides;p plan_definitions;start_time timestamptz;end_time timestamptz;limits jsonb;key text;begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'LIMITS_INVALID';end if;
 action=p_command->>'action';reason=p_command->>'reason';
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(btrim(reason)) not between 15 and 2000 or jsonb_typeof(p_command->'version') is distinct from 'number' or (p_command->>'version')!~'^[0-9]+$' then raise exception 'LIMITS_INVALID';end if;
 version=(p_command->>'version')::integer;
 perform pg_advisory_xact_lock(hashtextextended('gp:entitlement-admin',0));
 if action='set_free_limits' then
 for key in select jsonb_object_keys(p_command) loop if key not in ('action','version','limits','reason') then raise exception 'LIMITS_INVALID';end if;end loop;
 if not gp_limits_valid(p_command->'limits',false) then raise exception 'LIMITS_INVALID';end if;
 select * into p from plan_definitions where code='free' for update;if p.row_version<>version then raise exception 'VERSION_CONFLICT';end if;
 update plan_definitions set limits=p_command->'limits',row_version=row_version+1,updated_at=now() where code='free';
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'entitlements.free_limits','free',reason);return gp_admin_entitlements(null);
 elsif action in ('set_user_override','clear_user_override') then
 for key in select jsonb_object_keys(p_command) loop if key not in ('action','userId','version','limits','startsAt','expiresAt','reason') then raise exception 'LIMITS_INVALID';end if;end loop;
 target=(p_command->>'userId')::uuid;if target is null or not exists(select 1 from account_statuses where user_id=target) then raise exception 'NOT_FOUND';end if;
 select * into o from entitlement_overrides where user_id=target for update;if coalesce(o.row_version,0)<>version then raise exception 'VERSION_CONFLICT';end if;
 if action='clear_user_override' then if o.user_id is null then raise exception 'VERSION_CONFLICT';end if;limits='{}';start_time=now();end_time=start_time;
 else
 limits=p_command->'limits';if not gp_limits_valid(limits,true) or limits='{}'::jsonb then raise exception 'LIMITS_INVALID';end if;
 start_time=coalesce((p_command->>'startsAt')::timestamptz,now());end_time=(p_command->>'expiresAt')::timestamptz;
 if start_time<now()-interval '5 minutes' or end_time is null or end_time<=start_time or end_time>now()+interval '90 days' then raise exception 'LIMITS_INVALID';end if;
 end if;
 insert into entitlement_overrides(user_id,limits,starts_at,expires_at,reason,row_version,updated_by) values(target,limits,start_time,end_time,reason,version+1,auth.uid()) on conflict(user_id) do update set limits=excluded.limits,starts_at=excluded.starts_at,expires_at=excluded.expires_at,reason=excluded.reason,row_version=excluded.row_version,updated_by=excluded.updated_by,updated_at=now();
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'entitlements.'||action,target::text,reason);return gp_admin_entitlements(target);
 else raise exception 'LIMITS_INVALID';end if;end;$$;
revoke all on function public.gp_assign_free_entitlement(),public.gp_limits_valid(jsonb,boolean),public.gp_effective_limits(uuid),public.gp_active_listing_limit(uuid),public.gp_quota_rule(uuid,text,bigint,integer),public.gp_consume_limit(text,bigint,integer,bigint),public.gp_consume_user_limit(uuid,text,bigint,integer,bigint),public.gp_limit(text,integer,integer),public.gp_message_before_entitlements(uuid,text,text),public.gp_private_upload_quota(),public.gp_entitlement_view(uuid),public.gp_entitlements(),public.gp_admin_entitlements(uuid),public.gp_entitlement_command(jsonb),public.gp_message(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gp_entitlements(),public.gp_admin_entitlements(uuid),public.gp_entitlement_command(jsonb),public.gp_message(uuid,text,text) to authenticated;
commit;
