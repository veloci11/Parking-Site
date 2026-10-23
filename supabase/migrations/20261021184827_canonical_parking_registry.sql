-- 019: administered physical identity; public aliases are independent opaque UUIDs.
begin;
create table public.parking_sites(id uuid primary key default gen_random_uuid(),public_alias uuid not null unique default gen_random_uuid(),public_name text not null,internal_reference text not null,private_location jsonb not null default '{}');
create table public.parking_levels(id uuid primary key default gen_random_uuid(),public_alias uuid not null unique default gen_random_uuid(),site_id uuid not null references parking_sites(id),code text not null,label text not null,number integer not null,sort_order integer not null default 0,unique(site_id,code));
create table public.parking_spaces(id uuid primary key default gen_random_uuid(),public_alias uuid not null unique default gen_random_uuid(),level_id uuid not null references parking_levels(id),number text not null default '',private_lot_reference text not null default '',dimensions jsonb not null);
create table public.parking_contributors(site_id uuid references parking_sites(id),user_id uuid references auth.users(id) on delete cascade,scope text not null check(scope='common_reference'),primary key(site_id,user_id));
create table public.registry_listing_units(listing_id uuid references listings(id),unit_id uuid not null,space_id uuid references parking_spaces(id),signature text not null,primary key(listing_id,unit_id),unique(listing_id,space_id));
create table public.registry_published_units(listing_id uuid references listings(id),unit_id uuid not null,space_id uuid references parking_spaces(id),primary key(listing_id,unit_id));
create table public.canonical_space_claims(space_id uuid primary key references parking_spaces(id),listing_id uuid references listings(id));
create table public.registry_identity_history(id uuid primary key default gen_random_uuid(),listing_id uuid not null references listings(id),revision_no integer not null,units jsonb not null,action text not null check(action in ('link','publish')),actor_id uuid references auth.users(id) on delete set null,reason text,created_at timestamptz not null default now());
create table public.registry_conflicts(id uuid primary key default gen_random_uuid(),listing_id uuid not null references listings(id),space_id uuid not null references parking_spaces(id),other_listing_id uuid not null references listings(id),status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now());
create unique index gp_registry_open_conflict on registry_conflicts(listing_id,space_id,other_listing_id) where status='open';
do $$declare t text;begin foreach t in array array['parking_sites','parking_levels','parking_spaces','parking_contributors','registry_listing_units','registry_published_units','canonical_space_claims','registry_conflicts','registry_identity_history'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end;$$;
create function public.gp_registry_conflict(p_listing_id uuid,p_units jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare seller uuid;u jsonb;other listings;begin
 select seller_id into seller from listings where id=p_listing_id;
 if exists(select 1 from listings l where l.id<>p_listing_id and l.seller_id=seller and (exists(select 1 from canonical_space_claims c where c.listing_id=l.id and c.space_id in(select (identity_unit.value->>'spaceId')::uuid from jsonb_array_elements(p_units)identity_unit)) or (l.lifecycle_state not in ('paused','sold','withdrawn','expired','suspended') and exists(select 1 from registry_listing_units b where b.listing_id=l.id and b.space_id in(select (identity_unit.value->>'spaceId')::uuid from jsonb_array_elements(p_units)identity_unit))))) then raise exception 'REGISTRY_DUPLICATE_SAME_SELLER';end if;
 for u in select * from jsonb_array_elements(p_units) loop
 select l.* into other from registry_listing_units b join listings l on l.id=b.listing_id where b.space_id=(u->>'spaceId')::uuid and l.id<>p_listing_id and l.lifecycle_state not in ('paused','sold','withdrawn','expired','suspended') order by (l.seller_id=seller) desc,l.id limit 1;
 if not found then select l.* into other from canonical_space_claims c join listings l on l.id=c.listing_id where c.space_id=(u->>'spaceId')::uuid and c.listing_id<>p_listing_id;end if;
 if found then
 if other.seller_id=seller then raise exception 'REGISTRY_DUPLICATE_SAME_SELLER';end if;
 insert into registry_conflicts(listing_id,space_id,other_listing_id) values(p_listing_id,(u->>'spaceId')::uuid,other.id) on conflict do nothing;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'registry.conflict',p_listing_id::text,'Physical identity requires independent review.');return true;
 end if;end loop;return false;end;$$;
create function public.gp_registry_mapped(p_id uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if jsonb_typeof(p_snapshot->'spaces') is distinct from 'array' or jsonb_array_length(p_snapshot->'spaces') not between 1 and 500 then raise exception 'REGISTRY_LINK_REQUIRED';end if;
 if (select count(*) from registry_listing_units where listing_id=p_id)<>jsonb_array_length(p_snapshot->'spaces') or exists(select 1 from registry_listing_units where listing_id=p_id and signature<>md5((p_snapshot->'spaces')::text)) or exists(select 1 from jsonb_array_elements(p_snapshot->'spaces')u where not exists(select 1 from registry_listing_units b where b.listing_id=p_id and b.unit_id::text=u->>'id')) then raise exception 'REGISTRY_LINK_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('unitId',unit_id,'spaceId',space_id)),'[]') into result from registry_listing_units where listing_id=p_id;return result;end;$$;
create function public.gp_registry_publish(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare snapshot jsonb;units jsonb;u jsonb;begin
 select last_published into snapshot from listings where id=p_id;units=gp_registry_mapped(p_id,snapshot);
 delete from canonical_space_claims where listing_id=p_id;delete from registry_published_units where listing_id=p_id;
 for u in select * from jsonb_array_elements(units) loop insert into canonical_space_claims values((u->>'spaceId')::uuid,p_id);insert into registry_published_units values(p_id,(u->>'unitId')::uuid,(u->>'spaceId')::uuid);end loop;insert into registry_identity_history(listing_id,revision_no,units,action,actor_id) values(p_id,(snapshot->>'version')::integer,units,'publish',auth.uid());end;$$;
create function public.gp_registry_hide() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin delete from canonical_space_claims where listing_id=old.id;delete from registry_published_units where listing_id=old.id;return old;end;$$;
create trigger gp_registry_hide after delete on public.published_listings for each row execute function gp_registry_hide();
create function public.gp_admin_parking_registry(p_listing_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare sites jsonb='[]';site parking_sites;levels jsonb;begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 for site in select * from parking_sites order by id limit 100 loop
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'publicAlias',l.public_alias,'code',l.code,'label',l.label,'number',l.number,'sortOrder',l.sort_order,'spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'publicAlias',s.public_alias,'number',s.number,'privateLotReference',s.private_lot_reference)||s.dimensions order by s.id) from parking_spaces s where s.level_id=l.id),'[]')) order by l.sort_order,l.id),'[]') into levels from parking_levels l where l.site_id=site.id;
 sites=sites||jsonb_build_array(jsonb_build_object('id',site.id,'publicAlias',site.public_alias,'publicName',site.public_name,'internalReference',site.internal_reference,'levels',levels,'contributors',coalesce((select jsonb_agg(jsonb_build_object('userId',user_id,'scope',scope)) from parking_contributors where site_id=site.id),'[]'))||site.private_location);
 end loop;
 return jsonb_build_object('sites',sites,'links',coalesce((select jsonb_agg(jsonb_build_object('listingId',u.listing_id,'unitId',u.unit_id,'spaceId',u.space_id,'siteId',l.site_id)) from registry_listing_units u join parking_spaces s on s.id=u.space_id join parking_levels l on l.id=s.level_id where u.listing_id=p_listing_id),'[]'),'conflicts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'listingId',listing_id,'status',status,'createdAt',created_at)) from(select id,listing_id,status,created_at from registry_conflicts order by created_at desc limit 100)q),'[]'));
 end;$$;
create function public.gp_registry_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare action text;field text;result_id uuid=gen_random_uuid();l listings;candidate jsonb;u jsonb;physical parking_spaces;level_record parking_levels;space_unit jsonb;dims jsonb;site uuid;begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'REGISTRY_INVALID';end if;action=p_command->>'action';
 perform pg_advisory_xact_lock(hashtextextended('gp:canonical-registry',0));
 if action='create_site' then
 if jsonb_typeof(p_command->'publicName') is distinct from 'string' or length(trim(p_command->>'publicName')) not between 2 and 100 or jsonb_typeof(p_command->'internalReference') is distinct from 'string' or length(trim(p_command->>'internalReference')) not between 1 and 100 or (p_command ? 'exactAddress' and (jsonb_typeof(p_command->'exactAddress') is distinct from 'string' or length(p_command->>'exactAddress')>250)) then raise exception 'REGISTRY_INVALID';end if;
 if p_command ? 'coordinates' then if jsonb_typeof(p_command->'coordinates') is distinct from 'array' or jsonb_array_length(p_command->'coordinates')<>2 or jsonb_typeof(p_command->'coordinates'->0) is distinct from 'number' or jsonb_typeof(p_command->'coordinates'->1) is distinct from 'number' or (p_command->'coordinates'->>0)::numeric not between -180 and 180 or (p_command->'coordinates'->>1)::numeric not between -90 and 90 then raise exception 'REGISTRY_INVALID';end if;end if;
 insert into parking_sites(id,public_name,internal_reference,private_location) values(result_id,trim(p_command->>'publicName'),trim(p_command->>'internalReference'),jsonb_strip_nulls(jsonb_build_object('exactAddress',p_command->'exactAddress','coordinates',p_command->'coordinates')));
 elsif action='add_level' then
 site=(p_command->>'siteId')::uuid;if not exists(select 1 from parking_sites where id=site) then raise exception 'NOT_FOUND';end if;
 if jsonb_typeof(p_command->'code') is distinct from 'string' or length(trim(p_command->>'code')) not between 1 and 30 or jsonb_typeof(p_command->'label') is distinct from 'string' or length(p_command->>'label')>100 or jsonb_typeof(p_command->'number') is distinct from 'number' or (p_command->>'number')::numeric not between -20 and 50 or trunc((p_command->>'number')::numeric)<>(p_command->>'number')::numeric or (p_command ? 'sortOrder' and (jsonb_typeof(p_command->'sortOrder') is distinct from 'number' or (p_command->>'sortOrder')::numeric not between -100 and 100 or trunc((p_command->>'sortOrder')::numeric)<>(p_command->>'sortOrder')::numeric)) then raise exception 'REGISTRY_INVALID';end if;
 insert into parking_levels(id,site_id,code,label,number,sort_order) values(result_id,site,trim(p_command->>'code'),trim(p_command->>'label'),(p_command->>'number')::integer,coalesce((p_command->>'sortOrder')::integer,0));
 elsif action='add_space' then
 if not exists(select 1 from parking_levels where id=(p_command->>'levelId')::uuid) then raise exception 'NOT_FOUND';end if;
 if (p_command ? 'number' and (jsonb_typeof(p_command->'number') is distinct from 'string' or length(p_command->>'number')>40)) or (p_command ? 'privateLotReference' and (jsonb_typeof(p_command->'privateLotReference') is distinct from 'string' or length(p_command->>'privateLotReference')>80)) then raise exception 'REGISTRY_INVALID';end if;dims='{}';
 foreach field in array array['areaM2','lengthM','widthM','clearanceM'] loop if p_command->>field is not null and (jsonb_typeof(p_command->field) is distinct from 'number' or (p_command->>field)::numeric<=0 or (p_command->>field)::numeric>(case when field='areaM2' then 500 when field='clearanceM' then 20 else 50 end)) then raise exception 'REGISTRY_INVALID';end if;dims=dims||jsonb_build_object(field,coalesce(p_command->field,'null'));end loop;
 insert into parking_spaces(id,level_id,number,private_lot_reference,dimensions) values(result_id,(p_command->>'levelId')::uuid,coalesce(p_command->>'number',''),coalesce(p_command->>'privateLotReference',''),dims);
 elsif action='set_contributor' then
 site=(p_command->>'siteId')::uuid;if not exists(select 1 from parking_sites where id=site) or not exists(select 1 from account_statuses where user_id=(p_command->>'userId')::uuid and status='active') then raise exception 'NOT_FOUND';end if;
 if not(p_command ? 'scope') or (p_command->'scope'<>'null'::jsonb and p_command->>'scope' is distinct from 'common_reference') then raise exception 'REGISTRY_INVALID';end if;
 if p_command->'scope'='null'::jsonb then delete from parking_contributors where site_id=site and user_id=(p_command->>'userId')::uuid;else insert into parking_contributors values(site,(p_command->>'userId')::uuid,'common_reference') on conflict(site_id,user_id)do update set scope=excluded.scope;end if;result_id=site;
 elsif action='link_listing' then
 select * into l from listings where id=(p_command->>'listingId')::uuid for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_command->>'version' is null or l.row_version<>(p_command->>'version')::integer then raise exception 'VERSION_CONFLICT';end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(trim(p_command->>'reason')) not between 15 and 2000 or jsonb_typeof(p_command->'units') is distinct from 'array' or jsonb_array_length(p_command->'units') not between 1 and 500 or jsonb_array_length(p_command->'units')<>jsonb_array_length(l.draft->'spaces') or (select count(*)<>count(distinct value->>'unitId') or count(*)<>count(distinct value->>'spaceId') from jsonb_array_elements(p_command->'units')) then raise exception 'REGISTRY_INVALID';end if;
 site=(p_command->>'siteId')::uuid;
 for u in select * from jsonb_array_elements(p_command->'units') loop
 select value into space_unit from jsonb_array_elements(l.draft->'spaces') where value->>'id'=u->>'unitId';select * into physical from parking_spaces where id=(u->>'spaceId')::uuid;select * into level_record from parking_levels where id=physical.level_id;
 if space_unit is null or physical.id is null or level_record.site_id is distinct from site or (space_unit->>'level')::integer is distinct from level_record.number then raise exception 'REGISTRY_INVALID';end if;
 foreach field in array array['areaM2','lengthM','widthM','clearanceM'] loop if space_unit->>field is not null and physical.dimensions->>field is not null and abs((space_unit->>field)::numeric-(physical.dimensions->>field)::numeric)>0.05 then raise exception 'REGISTRY_INVALID';end if;end loop;
 end loop;
 if gp_registry_conflict(l.id,p_command->'units') then return jsonb_build_object('status','conflict','listingId',l.id,'version',l.row_version,'message','Le rattachement physique nécessite un examen indépendant.');end if;
 delete from registry_listing_units where listing_id=l.id;insert into registry_listing_units(listing_id,unit_id,space_id,signature) select l.id,(value->>'unitId')::uuid,(value->>'spaceId')::uuid,md5((l.draft->'spaces')::text) from jsonb_array_elements(p_command->'units');
 insert into registry_identity_history(listing_id,revision_no,units,action,actor_id,reason) values(l.id,l.row_version+1,p_command->'units','link',auth.uid(),p_command->>'reason');
 candidate=l.draft||jsonb_build_object('version',l.row_version+1,'updatedAt',now());update listings set draft=candidate,row_version=l.row_version+1,updated_at=now() where id=l.id;
 if l.lifecycle_state='pending' then update listing_revisions set state='superseded',reason='Canonical identity linked by administrator.',actor_id=auth.uid() where listing_id=l.id and revision_no=l.row_version and state='pending';insert into listing_revisions(listing_id,revision_no,payload) values(l.id,l.row_version+1,candidate);end if;
 if exists(select 1 from published_listings where id=l.id) and l.last_published->'spaces'=l.draft->'spaces' then perform gp_registry_publish(l.id);end if;
 update registry_conflicts set status='resolved' where listing_id=l.id and status='open';insert into audit_events(actor_id,action,target_id,detail)values(auth.uid(),'registry.link_listing',l.id::text,p_command->>'reason');return jsonb_build_object('status','saved','listingId',l.id,'version',l.row_version+1);
 else raise exception 'REGISTRY_INVALID';end if;
 insert into audit_events(actor_id,action,target_id)values(auth.uid(),'registry.'||action,result_id::text);return jsonb_build_object('status','saved','id',result_id);
 end;$$;
alter function public.gp_moderate(uuid,text,integer,text) rename to gp_moderate_before_registry;
create function public.gp_moderate(p_id uuid,p_decision text,p_version integer,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;units jsonb;result jsonb;begin
 if not gp_moderation_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:canonical-registry',0));select * into l from listings where id=p_id;if not found then raise exception 'NOT_FOUND';end if;perform 1 from account_statuses where user_id=l.seller_id for update;select * into l from listings where id=p_id for update;
 if p_version is null or l.row_version<>p_version or l.lifecycle_state<>'pending' then raise exception 'VERSION_CONFLICT';end if;
 if p_decision='approve' then
 units=gp_registry_mapped(l.id,l.draft);
 if gp_registry_conflict(l.id,units) then
 result=l.draft||jsonb_build_object('status','changes_requested','version',l.row_version+1,'rejectionReason','Le rattachement physique nécessite un examen indépendant.','updatedAt',now());update listings set draft=result,lifecycle_state='changes_requested',row_version=l.row_version+1,updated_at=now()where id=l.id;update listing_revisions set state='changes_requested',reason='Le rattachement physique nécessite un examen indépendant.',actor_id=auth.uid()where listing_id=l.id and revision_no=l.row_version;insert into notification_outbox(user_id,type,target_id)values(l.seller_id,'moderation',l.id||':'||(l.row_version+1))on conflict do nothing;return result;end if;
 end if;
 result=gp_moderate_before_registry(p_id,p_decision,p_version,p_reason);if p_decision='approve' then perform gp_registry_publish(p_id);end if;return result;end;$$;
-- Resume is another publication boundary: reacquire canonical claims transactionally.
alter function public.gp_listing(uuid,text,jsonb,integer) rename to gp_listing_before_registry;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;units jsonb;result jsonb;registered boolean;begin
 if p_action='resume' then
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:canonical-registry',0));
 select * into l from listings where id=p_id and seller_id=auth.uid() for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_version is null or p_version<>l.row_version or l.lifecycle_state<>'paused' then raise exception 'VERSION_CONFLICT';end if;
 registered=exists(select 1 from registry_listing_units where listing_id=l.id);
 if registered then
 units=gp_registry_mapped(l.id,l.last_published);
 if gp_registry_conflict(l.id,units) then
 result=l.draft||jsonb_build_object('status','changes_requested','version',l.row_version+1,'rejectionReason','Le rattachement physique nécessite un examen indépendant.','updatedAt',now());update listings set draft=result,lifecycle_state='changes_requested',row_version=l.row_version+1,updated_at=now() where id=l.id;return result;
 end if;end if;
 end if;
 result=gp_listing_before_registry(p_id,p_action,p_payload,p_version);
 if p_action='resume' and registered then perform gp_registry_publish(p_id);end if;
 return result;end;$$;
create function public.gp_my_parking_registry() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'publicName',s.public_name,'scope',c.scope,'levels',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'code',l.code,'label',l.label,'number',l.number,'sortOrder',l.sort_order)order by l.sort_order,l.id)from parking_levels l where l.site_id=s.id),'[]'))order by s.id),'[]') into result from parking_contributors c join parking_sites s on s.id=c.site_id where c.user_id=auth.uid();return result;end;$$;
create function public.gp_public_parking(p_alias uuid default null,p_listing_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare site parking_sites;levels jsonb='[]';lev parking_levels;units jsonb;ids uuid[]='{}';scenes jsonb;visible uuid[];begin
 select array_agg(p.id) into visible from published_listings p where p.payload->>'locationPrecision'='exact_opt_in' and gp_listing_available(p.id);
 if p_listing_id is not null and not coalesce(p_listing_id=any(visible),false) then return null;end if;
 if p_alias is not null then select * into site from parking_sites where public_alias=p_alias;
 elsif p_listing_id is not null then select s.* into site from parking_sites s join parking_levels l on l.site_id=s.id join parking_spaces sp on sp.level_id=l.id join registry_published_units u on u.space_id=sp.id where u.listing_id=p_listing_id limit 1;else return null;end if;if site.id is null then return null;end if;
 for lev in select * from parking_levels where site_id=site.id order by sort_order,id loop
 select coalesce(jsonb_agg(jsonb_build_object('id',s.public_alias,'number',unit.value->'number','listingId',u.listing_id,'listingUnitId',u.listing_id||':unit:'||unit.ordinality)order by s.id),'[]')into units from registry_published_units u join parking_spaces s on s.id=u.space_id join listings l on l.id=u.listing_id cross join lateral jsonb_array_elements(l.last_published->'spaces')with ordinality unit where s.level_id=lev.id and u.listing_id=any(visible) and unit.value->>'id'=u.unit_id::text;
 if jsonb_array_length(units)=0 then continue;end if;
 select coalesce(jsonb_agg(jsonb_build_object('listingId',id,'level',lev.number,'sceneAvailable',gp_scene_public(id,lev.number)is not null)),'[]')into scenes from(select distinct(value->>'listingId')::uuid id from jsonb_array_elements(units))q;
 ids=ids||array(select distinct(value->>'listingId')::uuid from jsonb_array_elements(units));levels=levels||jsonb_build_array(jsonb_build_object('id',lev.public_alias,'code',lev.code,'label',lev.label,'number',lev.number,'spaces',units,'scenes',scenes));end loop;
 if jsonb_array_length(levels)=0 then return null;end if;return jsonb_build_object('id',site.public_alias,'publicName',site.public_name,'levels',levels,'listings',coalesce((select jsonb_agg(p.payload||jsonb_build_object('sceneAvailable',gp_scene_public(p.id,null)is not null)order by p.id)from published_listings p where p.id=any(ids)),'[]'));end;$$;
revoke all on function public.gp_registry_conflict(uuid,jsonb),public.gp_registry_mapped(uuid,jsonb),public.gp_registry_publish(uuid),public.gp_registry_hide(),public.gp_admin_parking_registry(uuid),public.gp_registry_command(jsonb),public.gp_moderate_before_registry(uuid,text,integer,text),public.gp_listing_before_registry(uuid,text,jsonb,integer),public.gp_listing(uuid,text,jsonb,integer),public.gp_moderate(uuid,text,integer,text),public.gp_my_parking_registry(),public.gp_public_parking(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gp_admin_parking_registry(uuid),public.gp_registry_command(jsonb),public.gp_moderate(uuid,text,integer,text),public.gp_listing(uuid,text,jsonb,integer),public.gp_my_parking_registry() to authenticated;
grant execute on function public.gp_public_parking(uuid,uuid)to anon,authenticated;
commit;
