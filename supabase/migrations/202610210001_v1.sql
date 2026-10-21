-- GP V1. Apply to a dedicated Supabase project. No demo accounts or listings are installed here.
begin;
create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;
create table public.profiles(user_id uuid primary key references auth.users(id) on delete cascade,name text not null check(char_length(name) between 2 and 80),created_at timestamptz not null default now());
create table public.account_statuses(user_id uuid primary key references auth.users(id) on delete cascade,status text not null default 'active' check(status in ('active','suspended','deletion_pending','deleted')));
create table public.app_roles(user_id uuid primary key references auth.users(id) on delete cascade,role text not null default 'member' check(role in ('member','moderator','admin')));
create function public.gp_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into profiles values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Membre'),80),now());
 insert into account_statuses(user_id) values(new.id); insert into app_roles(user_id) values(new.id); return new; end; $$;
create trigger gp_auth_user_created after insert on auth.users for each row execute function public.gp_new_user();
create function public.gp_active() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from account_statuses where user_id=auth.uid() and status='active')$$;
create function public.gp_role() returns text language sql stable security definer set search_path=public,pg_temp as $$select role from app_roles where user_id=auth.uid()$$;
create function public.gp_verified() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) and gp_active()$$;
create table public.listings(id uuid primary key default gen_random_uuid(),seller_id uuid not null references auth.users(id),draft jsonb not null,lifecycle_state text not null default 'draft' check(lifecycle_state in ('draft','pending','published','changes_requested','rejected','paused','sold','withdrawn')),row_version integer not null default 1,last_published jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.listing_revisions(id uuid primary key default gen_random_uuid(),listing_id uuid not null references listings(id),revision_no integer not null,payload jsonb not null,state text not null default 'pending',reason text,actor_id uuid references auth.users(id),created_at timestamptz not null default now(),unique(listing_id,revision_no));
create table public.published_listings(id uuid primary key references listings(id),payload jsonb not null,public_location extensions.geography(Point,4326),created_at timestamptz not null default now());
create index gp_public_location on public.published_listings using gist(public_location);
create index gp_seller_updated on public.listings(seller_id,updated_at desc);
create table public.active_space_claims(space_id text primary key,listing_id uuid not null references listings(id));
create table public.favorites(user_id uuid not null references auth.users(id),listing_id uuid not null references listings(id),primary key(user_id,listing_id));
create table public.conversations(id uuid primary key default gen_random_uuid(),listing_id uuid not null references listings(id),buyer_id uuid not null references auth.users(id),seller_id uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(listing_id,buyer_id,seller_id),check(buyer_id<>seller_id));
create table public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references conversations(id),sender_id uuid not null references auth.users(id),body text not null check(char_length(body) between 1 and 4000),client_request_id text not null check(char_length(client_request_id) between 8 and 100),created_at timestamptz not null default now(),unique(sender_id,client_request_id));
create index gp_messages_conversation on public.messages(conversation_id,created_at,id);
create table public.visit_requests(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references conversations(id),status text not null default 'requested' check(status in ('requested','accepted','confirmed','declined','cancelled')),proposed_at timestamptz,confirmed_at timestamptz,row_version integer not null default 1,client_request_id text not null unique,created_at timestamptz not null default now());
create table public.media_assets(id uuid primary key,owner_id uuid not null references auth.users(id),listing_id uuid not null references listings(id),object_key text not null unique,mime text not null check(mime='image/webp'),created_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),listing_id uuid not null references listings(id),reason text not null check(char_length(reason) between 5 and 2000),created_at timestamptz not null default now());
create table public.audit_events(id uuid primary key default gen_random_uuid(),actor_id uuid,action text not null,target_id text,detail text,created_at timestamptz not null default now());
create table public.notification_outbox(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),type text not null,target_id text not null,status text not null default 'pending',attempts integer not null default 0,next_run_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(user_id,type,target_id));
create table public.rate_limits(bucket text primary key,count integer not null,reset_at timestamptz not null);
create function public.gp_limit(p_kind text,p_limit integer,p_seconds integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare n integer; begin
 if auth.uid() is null or not gp_active() then raise exception 'UNAUTHENTICATED'; end if;
 insert into rate_limits values(auth.uid()::text||':'||p_kind,1,now()+make_interval(secs=>p_seconds)) on conflict(bucket) do update set count=case when rate_limits.reset_at<now() then 1 else rate_limits.count+1 end,reset_at=case when rate_limits.reset_at<now() then now()+make_interval(secs=>p_seconds) else rate_limits.reset_at end returning count into n;
 if n>p_limit then raise exception 'RATE_LIMITED'; end if; end; $$;
create function public.gp_public_payload(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$ declare result jsonb;units jsonb;q jsonb;begin
 select jsonb_agg(jsonb_build_object('id',(p->>'id')||':unit:'||ordinality,'number',value->'number','level',value->'level','areaM2',value->'areaM2','lengthM',value->'lengthM','widthM',value->'widthM','clearanceM',value->'clearanceM')) into units from jsonb_array_elements(p->'spaces') with ordinality;
 q=p->'quality';
 result=jsonb_build_object('id',p->'id','slug',p->'slug','title',p->'title','description',p->'description','city',p->'city','district',p->'district','priceCents',p->'priceCents','type',p->'type','spaces',coalesce(units,'[]'),'photos',p->'photos','quality',jsonb_build_object('floor',q->'floor','lighting',q->'lighting','humidity',q->'humidity','access',q->'access','maneuver',q->'maneuver','observations',q->'observations'),'locationPrecision',p->'locationPrecision','coordinates',p->'coordinates','sceneAvailable',false,'isDemo',false,'status','published','version',p->'version','sellerName',p->'sellerName','createdAt',p->'createdAt','updatedAt',p->'updatedAt');
 if p->>'locationPrecision'='exact_opt_in' then if p ? 'address' then result=jsonb_set(result,'{address}',p->'address');end if;
 else result=jsonb_set(result,'{coordinates}',jsonb_build_array(round((p->'coordinates'->>0)::numeric,2),round((p->'coordinates'->>1)::numeric,2)));end if;
 if p ? 'occupancy' then result=jsonb_set(result,'{occupancy}',p->'occupancy');end if;if p ? 'annualChargesCents' then result=jsonb_set(result,'{annualChargesCents}',p->'annualChargesCents');end if;if p ? 'propertyTaxCents' then result=jsonb_set(result,'{propertyTaxCents}',p->'propertyTaxCents');end if;if p ? 'observedAt' then result=jsonb_set(result,'{observedAt}',p->'observedAt');end if;return result;end;$$;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare field text;u jsonb;photo text;n numeric;begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 for field in select jsonb_object_keys(p) loop if field not in ('id','slug','title','description','city','district','priceCents','type','spaces','photos','quality','locationPrecision','coordinates','address','sceneAvailable','isDemo','status','version','sellerName','createdAt','updatedAt','rejectionReason','occupancy','annualChargesCents','propertyTaxCents','observedAt') then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['title','description','city','district'] loop if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'VALIDATION_ERROR';end if;end loop;
 if length(p->>'title')>90 or length(p->>'description')>5000 or length(p->>'city')>80 or length(p->>'district')>100 or jsonb_typeof(p->'priceCents') is distinct from 'number' or (p->>'priceCents')::numeric<0 or (p->>'priceCents')::numeric>10000000000 or trunc((p->>'priceCents')::numeric)<>(p->>'priceCents')::numeric or coalesce(p->>'type','') not in ('covered','box','outdoor') or coalesce(p->>'locationPrecision','') not in ('area','exact_opt_in') then raise exception 'VALIDATION_ERROR';end if;
 if jsonb_typeof(p->'spaces') is distinct from 'array' or jsonb_array_length(p->'spaces') not between 1 and 500 or jsonb_typeof(p->'photos') is distinct from 'array' or jsonb_array_length(p->'photos')>20 or jsonb_typeof(p->'coordinates') is distinct from 'array' or jsonb_array_length(p->'coordinates')<>2 then raise exception 'VALIDATION_ERROR';end if;
 if jsonb_typeof(p->'coordinates'->0) is distinct from 'number' or jsonb_typeof(p->'coordinates'->1) is distinct from 'number' or (p->'coordinates'->>0)::numeric not between -180 and 180 or (p->'coordinates'->>1)::numeric not between -90 and 90 then raise exception 'VALIDATION_ERROR';end if;
 if jsonb_typeof(p->'quality') is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['floor','lighting','humidity','access','maneuver','observations'] loop if jsonb_typeof(p->'quality'->field) is distinct from 'string' or length(p->'quality'->>field)>(case when field='observations' then 4000 else 500 end) then raise exception 'VALIDATION_ERROR';end if;end loop;
 for u in select * from jsonb_array_elements(p->'spaces') loop
 if jsonb_typeof(u) is distinct from 'object' or coalesce(u->>'id','')!~'^[a-f0-9-]{36}$' or jsonb_typeof(u->'number') is distinct from 'string' or length(u->>'number')>30 or jsonb_typeof(u->'level') is distinct from 'number' or (u->>'level')::numeric not between -20 and 20 or trunc((u->>'level')::numeric)<>(u->>'level')::numeric then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['areaM2','lengthM','widthM','clearanceM'] loop if not(u ? field) then raise exception 'VALIDATION_ERROR';end if;if u->field<>'null'::jsonb then if jsonb_typeof(u->field) is distinct from 'number' then raise exception 'VALIDATION_ERROR';end if;n=(u->>field)::numeric;if n<=0 or n>(case when field='areaM2' then 500 when field='clearanceM' then 20 else 50 end) then raise exception 'VALIDATION_ERROR';end if;end if;end loop;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p->'spaces')) then raise exception 'VALIDATION_ERROR';end if;
 for photo in select jsonb_array_elements_text(p->'photos') loop if photo!~'^/api/media/[a-f0-9-]{36}$' or not exists(select 1 from media_assets where id::text=split_part(photo,'/',4) and owner_id=auth.uid() and listing_id=p_id) then raise exception 'MEDIA_NOT_OWNED';end if;end loop;
 if p ? 'occupancy' and p->>'occupancy' not in ('vacant','occupied','unknown') then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['annualChargesCents','propertyTaxCents'] loop if p ? field and p->field<>'null'::jsonb then if jsonb_typeof(p->field) is distinct from 'number' or (p->>field)::numeric<0 or (p->>field)::numeric>100000000 or trunc((p->>field)::numeric)<>(p->>field)::numeric then raise exception 'VALIDATION_ERROR';end if;end if;end loop;
 if p_submit and (length(p->>'title')<15 or length(p->>'description')<100 or length(p->>'city')<1 or length(p->>'district')<1 or (p->>'priceCents')::numeric<=0 or jsonb_array_length(p->'photos')<3 or exists(select 1 from jsonb_array_elements(p->'spaces') where length(value->>'number')<1)) then raise exception 'VALIDATION_ERROR';end if;
 end;$$;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare l listings; value jsonb; new_version integer; active_count integer; unit jsonb; photo text; field text;
 begin
 if not gp_active() then raise exception 'UNAUTHENTICATED'; end if;
 if p_action='create' then
 perform gp_limit('draft',10,86400);value=p_payload||jsonb_build_object('id',p_id,'isDemo',false,'status','draft','version',1,'sceneAvailable',false,'sellerName',(select name from profiles where user_id=auth.uid()),'createdAt',now(),'updatedAt',now());perform gp_validate_draft(value,p_id,false); insert into listings(id,seller_id,draft) values(p_id,auth.uid(),value) returning * into l;
 return l.draft; end if;
 select * into l from listings where id=p_id for update; if not found or l.seller_id<>auth.uid() then raise exception 'NOT_FOUND'; end if;
 if p_version is null or l.row_version<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 new_version=l.row_version+1;value=l.draft;
 if p_action='update' then
 if l.lifecycle_state='pending' then raise exception 'VERSION_CONFLICT'; end if;
 for field in select jsonb_object_keys(p_payload) loop if field not in ('title','description','city','district','priceCents','type','spaces','photos','quality','locationPrecision','coordinates','address','slug','occupancy','annualChargesCents','propertyTaxCents','observedAt') then raise exception 'VALIDATION_ERROR';end if;end loop;
 value=value||p_payload||jsonb_build_object('status','draft','sceneAvailable',false);perform gp_validate_draft(value,p_id,false); l.lifecycle_state='draft';
 elsif p_action='submit' then
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED'; end if;
 if p_payload->>'ownershipAttested' is distinct from 'true' then raise exception 'OWNERSHIP_ATTESTATION_REQUIRED';end if;
 if l.lifecycle_state not in ('draft','changes_requested','rejected') then raise exception 'VERSION_CONFLICT';end if;
 perform gp_validate_draft(value,p_id,true);if length(value->>'title')<15 or length(value->>'description')<100 or coalesce((value->>'priceCents')::bigint,0)<=0 or length(value->>'city')<1 or length(value->>'district')<1 or jsonb_array_length(value->'photos')<3 or jsonb_array_length(value->'spaces')<1 then raise exception 'VALIDATION_ERROR';end if;
 for unit in select * from jsonb_array_elements(value->'spaces') loop if length(unit->>'number')<1 then raise exception 'VALIDATION_ERROR'; end if;end loop;
 for photo in select jsonb_array_elements_text(value->'photos') loop if not exists(select 1 from media_assets where id::text=split_part(photo,'/',4) and owner_id=auth.uid() and listing_id=l.id) then raise exception 'MEDIA_NOT_OWNED';end if;end loop;
 perform gp_limit('submit',20,86400);perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select count(distinct id) into active_count from listings where seller_id=auth.uid() and id<>l.id and (last_published is not null or lifecycle_state='pending') and lifecycle_state not in ('sold','withdrawn');if active_count>=10 then raise exception 'QUOTA_EXCEEDED';end if;
 l.lifecycle_state='pending';value=jsonb_set(value,'{status}','"pending"');insert into listing_revisions(listing_id,revision_no,payload) values(l.id,new_version,jsonb_set(value,'{version}',to_jsonb(new_version)));
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'listing.submit',l.id::text,'ownership_attested=true');
 elsif p_action in ('pause','resume','sold','withdraw') then
 if l.lifecycle_state in ('sold','withdrawn') then raise exception 'VERSION_CONFLICT';end if;
 if p_action in ('pause','resume') and l.last_published is null then raise exception 'NOT_PUBLISHED';end if;
 if p_action='resume' and l.lifecycle_state<>'paused' then raise exception 'VERSION_CONFLICT';end if;
 l.lifecycle_state=case p_action when 'pause' then 'paused' when 'resume' then 'published' when 'sold' then 'sold' else 'withdrawn' end;
 if p_action='resume' then
 for unit in select * from jsonb_array_elements(l.last_published->'spaces') loop insert into active_space_claims values(unit->>'id',l.id) on conflict(space_id) do update set listing_id=case when active_space_claims.listing_id=excluded.listing_id then excluded.listing_id else null end;end loop;
 insert into published_listings(id,payload) values(l.id,gp_public_payload(l.last_published));
 else delete from published_listings where id=l.id;delete from active_space_claims where listing_id=l.id;end if;
 value=jsonb_set(value,'{status}',to_jsonb(l.lifecycle_state));
 else raise exception 'VALIDATION_ERROR';end if;
 value=value||jsonb_build_object('version',new_version,'updatedAt',now());update listings set draft=value,row_version=new_version,lifecycle_state=l.lifecycle_state,updated_at=now() where id=l.id;return value;
 end;$$;
create function public.gp_moderate(p_id uuid,p_decision text,p_version integer,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare l listings;value jsonb;unit jsonb;public_value jsonb;active_count integer;
 begin
 if not gp_verified() or gp_role() not in ('moderator','admin') then raise exception 'FORBIDDEN';end if;
 select * into l from listings where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;if p_version is null or l.row_version<>p_version or l.lifecycle_state<>'pending' then raise exception 'VERSION_CONFLICT';end if;
 if coalesce(p_decision,'') not in ('approve','changes_requested','reject') or length(p_reason)>2000 or (p_decision<>'approve' and coalesce(length(p_reason),0)<1) then raise exception 'VALIDATION_ERROR';end if;
 value=l.draft||jsonb_build_object('version',l.row_version+1,'updatedAt',now(),'rejectionReason',p_reason,'status',case p_decision when 'approve' then 'published' when 'reject' then 'rejected' else 'changes_requested' end);
 if p_decision='approve' then
 if not exists(select 1 from account_statuses where user_id=l.seller_id and status='active') or not exists(select 1 from auth.users where id=l.seller_id and email_confirmed_at is not null) then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(l.seller_id::text,0));select count(distinct id) into active_count from listings where seller_id=l.seller_id and id<>l.id and (last_published is not null or lifecycle_state='pending') and lifecycle_state not in ('sold','withdrawn');if active_count>=10 then raise exception 'QUOTA_EXCEEDED';end if;
 delete from active_space_claims where listing_id=l.id;for unit in select * from jsonb_array_elements(value->'spaces') loop insert into active_space_claims values(unit->>'id',l.id);end loop;
 public_value=gp_public_payload(value);insert into published_listings(id,payload,public_location) values(l.id,public_value,extensions.st_setsrid(extensions.st_makepoint((public_value->'coordinates'->>0)::float8,(public_value->'coordinates'->>1)::float8),4326)::extensions.geography) on conflict(id) do update set payload=excluded.payload,public_location=excluded.public_location;
 update listings set last_published=value where id=l.id;
 end if;
 update listings set draft=value,row_version=l.row_version+1,lifecycle_state=value->>'status',updated_at=now() where id=l.id;
 update listing_revisions set state=p_decision,reason=p_reason,actor_id=auth.uid() where listing_id=l.id and revision_no=p_version;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'moderation.'||p_decision,l.id::text,p_reason);
 insert into notification_outbox(user_id,type,target_id) values(l.seller_id,'moderation',l.id||':'||p_version) on conflict do nothing;
 return value;end;$$;
create function public.gp_contact(p_listing_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;cid uuid;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;select * into l from listings where id=p_listing_id;if not found or not exists(select 1 from published_listings where id=l.id) then raise exception 'NOT_FOUND';end if;if l.seller_id=auth.uid() then raise exception 'SELF_CONTACT';end if;
 select id into cid from conversations where listing_id=l.id and buyer_id=auth.uid() and seller_id=l.seller_id;if cid is not null then return cid;end if;perform gp_limit('contact',10,86400);
 insert into conversations(listing_id,buyer_id,seller_id) values(l.id,auth.uid(),l.seller_id) on conflict(listing_id,buyer_id,seller_id) do update set updated_at=conversations.updated_at returning id into cid;
 insert into notification_outbox(user_id,type,target_id) values(l.seller_id,'conversation',cid::text) on conflict do nothing;return cid;end;$$;
create function public.gp_message(p_conversation_id uuid,p_body text,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;m messages;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;select * into c from conversations where id=p_conversation_id;if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'NOT_FOUND';end if;
 select * into m from messages where sender_id=auth.uid() and client_request_id=p_request_id;if found then if m.conversation_id<>c.id then raise exception 'VERSION_CONFLICT';end if;return to_jsonb(m);end if;
 perform gp_limit('message',30,60);insert into messages(conversation_id,sender_id,body,client_request_id) values(c.id,auth.uid(),trim(p_body),p_request_id) returning * into m;update conversations set updated_at=now() where id=c.id;
 insert into notification_outbox(user_id,type,target_id) values(case when c.buyer_id=auth.uid() then c.seller_id else c.buyer_id end,'message',m.id::text);return to_jsonb(m);end;$$;
create function public.gp_visit(p_conversation_id uuid,p_request_id text,p_proposed_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;v visit_requests;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;select * into c from conversations where id=p_conversation_id;if not found or c.buyer_id<>auth.uid() then raise exception 'NOT_FOUND';end if;
 if p_proposed_at<=now() then raise exception 'VALIDATION_ERROR';end if;select * into v from visit_requests where client_request_id=auth.uid()||':'||p_request_id;if found then if v.conversation_id<>c.id then raise exception 'VERSION_CONFLICT';end if;return to_jsonb(v);end if;
 insert into visit_requests(conversation_id,client_request_id,proposed_at) values(c.id,auth.uid()||':'||p_request_id,p_proposed_at) returning * into v;insert into notification_outbox(user_id,type,target_id) values(c.seller_id,'visit',v.id::text);return to_jsonb(v);end;$$;
create function public.gp_visit_decision(p_id uuid,p_action text,p_version integer,p_confirmed_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;v visit_requests;new_status text;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;select * into v from visit_requests where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;select * into c from conversations where id=v.conversation_id;if auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'NOT_FOUND';end if;
 if p_version is null or v.row_version<>p_version or v.status in ('cancelled','declined') then raise exception 'VERSION_CONFLICT';end if;if coalesce(p_action,'') not in ('accept','decline','cancel') then raise exception 'VALIDATION_ERROR';end if;if p_action<>'cancel' and c.seller_id<>auth.uid() then raise exception 'FORBIDDEN';end if;if p_confirmed_at<=now() then raise exception 'VALIDATION_ERROR';end if;
 new_status=case when p_action='cancel' then 'cancelled' when p_action='decline' then 'declined' when p_confirmed_at is not null then 'confirmed' else 'accepted' end;
 update visit_requests set status=new_status,confirmed_at=case when p_action='accept' then p_confirmed_at else null end,row_version=row_version+1 where id=v.id returning * into v;return to_jsonb(v);end;$$;
create function public.gp_catalog(p_query text default '',p_type text default null,p_price_max bigint default null,p_area_min numeric default null,p_sort text default 'recent',p_offset integer default 0,p_limit integer default 24) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with filtered as(select payload,created_at,id from published_listings where (coalesce(p_query,'')='' or lower((payload->>'city')||' '||(payload->>'district')||' '||(payload->>'title')) like '%'||lower(p_query)||'%') and (p_type is null or payload->>'type'=p_type) and (p_price_max is null or (payload->>'priceCents')::bigint<=p_price_max) and (p_area_min is null or not exists(select 1 from jsonb_array_elements(payload->'spaces') u where u->>'areaM2' is null or (u->>'areaM2')::numeric<p_area_min))), page as(select * from filtered order by case when p_sort='price_asc' then (payload->>'priceCents')::bigint end asc,case when p_sort='price_desc' then (payload->>'priceCents')::bigint end desc,created_at desc,id limit least(50,greatest(1,p_limit)) offset greatest(0,p_offset)) select jsonb_build_object('items',coalesce((select jsonb_agg(payload) from page),'[]'),'total',(select count(*) from filtered))$$;
create function public.gp_conversations() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'listingId',c.listing_id,'listingTitle',coalesce(l.last_published->>'title',l.draft->>'title'),'otherName',p.name,'updatedAt',c.updated_at,'unread',0) order by c.updated_at desc),'[]') from conversations c join listings l on l.id=c.listing_id join profiles p on p.user_id=case when c.buyer_id=auth.uid() then c.seller_id else c.buyer_id end where gp_active() and auth.uid() in(c.buyer_id,c.seller_id) $$;
create function public.gp_delete_account() returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='password' and (a->>'timestamp')::bigint>=extract(epoch from now()-interval '5 minutes')) then raise exception 'REAUTH_REQUIRED';end if;delete from published_listings where id in(select id from listings where seller_id=auth.uid());delete from active_space_claims where listing_id in(select id from listings where seller_id=auth.uid());update listings set lifecycle_state='withdrawn' where seller_id=auth.uid();delete from favorites where user_id=auth.uid();update account_statuses set status='deletion_pending' where user_id=auth.uid();update profiles set name='Compte supprimé' where user_id=auth.uid();insert into audit_events(actor_id,action,target_id) values(auth.uid(),'account.deletion_pending',auth.uid()::text);end;$$;
create function public.gp_storage_allowed(p_name text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare pieces text[];begin
 if not gp_active() then return false;end if;pieces=string_to_array(p_name,'/');
 if array_length(pieces,1)<>3 or pieces[1]<>auth.uid()::text or pieces[2]!~'^[a-f0-9-]{36}$' or pieces[3]!~'^[a-f0-9-]{36}\.webp$' then return false;end if;
 if not exists(select 1 from listings where id::text=pieces[2] and seller_id=auth.uid() and lifecycle_state<>'pending') then return false;end if;
 if (select count(*) from media_assets where owner_id=auth.uid() and listing_id::text=pieces[2])>=120 then return false;end if;perform gp_limit('upload',60,3600);return true;end;$$;
-- Public can read only this curated projection. All private data is isolated by RLS.
alter table public.profiles enable row level security;alter table public.account_statuses enable row level security;alter table public.app_roles enable row level security;alter table public.listings enable row level security;alter table public.listing_revisions enable row level security;alter table public.published_listings enable row level security;alter table public.active_space_claims enable row level security;alter table public.favorites enable row level security;alter table public.conversations enable row level security;alter table public.messages enable row level security;alter table public.visit_requests enable row level security;alter table public.media_assets enable row level security;alter table public.reports enable row level security;alter table public.audit_events enable row level security;alter table public.notification_outbox enable row level security;alter table public.rate_limits enable row level security;
create policy public_catalog on public.published_listings for select using(true);
create policy own_profile on public.profiles for select to authenticated using(user_id=auth.uid() and gp_active());
create policy own_profile_update on public.profiles for update to authenticated using(user_id=auth.uid() and gp_active()) with check(user_id=auth.uid() and gp_active());
create policy own_status on public.account_statuses for select to authenticated using(user_id=auth.uid());create policy own_role on public.app_roles for select to authenticated using(user_id=auth.uid());
create policy own_listing on public.listings for select to authenticated using(gp_active() and (seller_id=auth.uid() or gp_role() in ('moderator','admin')));
create policy own_revision on public.listing_revisions for select to authenticated using(gp_active() and exists(select 1 from listings l where l.id=listing_id and (l.seller_id=auth.uid() or gp_role() in ('moderator','admin'))));
create policy own_favorite on public.favorites for all to authenticated using(user_id=auth.uid() and gp_active()) with check(user_id=auth.uid() and gp_active() and exists(select 1 from published_listings p where p.id=listing_id));
create policy participant_conversation on public.conversations for select to authenticated using(gp_active() and auth.uid() in(buyer_id,seller_id));
create policy participant_message on public.messages for select to authenticated using(gp_active() and exists(select 1 from conversations c where c.id=conversation_id and auth.uid() in(c.buyer_id,c.seller_id)));
create policy participant_visit on public.visit_requests for select to authenticated using(gp_active() and exists(select 1 from conversations c where c.id=conversation_id and auth.uid() in(c.buyer_id,c.seller_id)));
create policy own_media on public.media_assets for select to authenticated using(gp_active() and (owner_id=auth.uid() or gp_role() in ('moderator','admin')));
create policy own_media_insert on public.media_assets for insert to authenticated with check(owner_id=auth.uid() and gp_active() and exists(select 1 from listings l where l.id=listing_id and l.seller_id=auth.uid()) and object_key=auth.uid()||'/'||listing_id||'/'||id||'.webp');
create policy own_report on public.reports for insert to authenticated with check(user_id=auth.uid() and gp_verified());create policy own_report_read on public.reports for select to authenticated using(user_id=auth.uid() and gp_active());
revoke all on all tables in schema public from anon,authenticated;
grant select on published_listings to anon,authenticated;
grant select on profiles,account_statuses,app_roles,listings,listing_revisions,favorites,conversations,messages,visit_requests,media_assets,reports to authenticated;
grant update(name) on profiles to authenticated;grant insert,delete on favorites to authenticated;grant insert on media_assets,reports to authenticated;
revoke execute on all functions in schema public from public;
grant execute on function gp_active(),gp_role(),gp_verified(),gp_listing(uuid,text,jsonb,integer),gp_moderate(uuid,text,integer,text),gp_contact(uuid),gp_message(uuid,text,text),gp_visit(uuid,text,timestamptz),gp_visit_decision(uuid,text,integer,timestamptz) to authenticated;
grant execute on function gp_catalog(text,text,bigint,numeric,text,integer,integer) to anon,authenticated;grant execute on function gp_conversations(),gp_delete_account(),gp_storage_allowed(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('private-uploads','private-uploads',false,10485760,array['image/webp']),('public-approved','public-approved',false,10485760,array['image/webp']) on conflict(id) do nothing;
create policy gp_upload on storage.objects for insert to authenticated with check(bucket_id='private-uploads' and gp_storage_allowed(name));
create policy gp_private_read on storage.objects for select to authenticated using(bucket_id='private-uploads' and gp_active() and ((storage.foldername(name))[1]=auth.uid()::text or gp_role() in ('moderator','admin')));
create policy gp_reviewed_insert on storage.objects for insert to authenticated with check(bucket_id='public-approved' and gp_verified() and gp_role() in ('moderator','admin'));
create policy gp_reviewed_select on storage.objects for select using(bucket_id='public-approved' and exists(select 1 from public.published_listings p where p.payload->'photos' ? ('/api/media/'||split_part(name,'.',1))));
-- No public source bucket or browser-wide service role. Public-approved is populated only by a reviewed server workflow.
commit;
