-- 016: structured lot details, explicit public-location confirmation and faithful preview.
begin;
alter table public.listings add column location_confirmation_hash text;
create function public.gp_location_hash(p jsonb) returns text language sql immutable set search_path=public,pg_temp as $$select md5(jsonb_build_array(p->'city',p->'district',p->'address',p->'locationPrecision',p->'coordinates',p->'publicCoordinates')::text)$$;
create function public.gp_commercial_date(v jsonb) returns void language plpgsql stable set search_path=public,pg_temp as $$begin if v is null or (v<>'null'::jsonb and (jsonb_typeof(v) is distinct from 'string' or v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or (v#>>'{}')::timestamptz>now()+interval '5 minutes')) then raise exception 'COMMERCIAL_INVALID';end if;end;$$;
create function public.gp_commercial_documents(v jsonb,p_id uuid,p_required boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare d jsonb;begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>10 or (p_required and jsonb_array_length(v)=0) then raise exception 'COMMERCIAL_INVALID';end if;
 for d in select * from jsonb_array_elements(v) loop if jsonb_typeof(d) is distinct from 'string' or not exists(select 1 from parking_scene_sources s where s.id::text=d#>>'{}' and s.owner_id=auth.uid() and s.listing_id=p_id) then raise exception 'COMMERCIAL_INVALID';end if;end loop;end;$$;
create function public.gp_validate_commercial(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c jsonb;u jsonb;v jsonb;field text;k text;f jsonb;begin
 for u in select * from jsonb_array_elements(p->'spaces') loop foreach field in array array['lengthM','widthM','clearanceM'] loop if u->>field is not null and abs((u->>field)::numeric*1000-round((u->>field)::numeric*1000))>0.000001 then raise exception 'COMMERCIAL_INVALID';end if;end loop;end loop;
 if p ? 'publicCoordinates' then if jsonb_typeof(p->'publicCoordinates') is distinct from 'array' or jsonb_array_length(p->'publicCoordinates')<>2 or jsonb_typeof(p->'publicCoordinates'->0) is distinct from 'number' or jsonb_typeof(p->'publicCoordinates'->1) is distinct from 'number' or (p->'publicCoordinates'->>0)::numeric not between -180 and 180 or (p->'publicCoordinates'->>1)::numeric not between -90 and 90 then raise exception 'COMMERCIAL_INVALID';end if;end if;
 if not(p ? 'commercialDetails') then if p_submit and p->>'type'='mixed' then raise exception 'COMMERCIAL_INVALID';end if;return;end if;
 c=p->'commercialDetails';if jsonb_typeof(c) is distinct from 'object' then raise exception 'COMMERCIAL_INVALID';end if;
 for field in select jsonb_object_keys(c) loop if field not in ('postalCode','units','access','chargesSource','taxSource','rentalIncome','photoMetadata') then raise exception 'COMMERCIAL_INVALID';end if;end loop;
 if jsonb_typeof(c->'postalCode') is distinct from 'string' or length(c->>'postalCode')>16 or jsonb_typeof(c->'units') is distinct from 'object' or jsonb_typeof(c->'access') is distinct from 'object' or jsonb_typeof(c->'photoMetadata') is distinct from 'object' or not(c ? 'rentalIncome') then raise exception 'COMMERCIAL_INVALID';end if;
 for k,u in select key,value from jsonb_each(c->'units') loop
 if not exists(select 1 from jsonb_array_elements(p->'spaces')s where s->>'id'=k) or jsonb_typeof(u) is distinct from 'object' then raise exception 'COMMERCIAL_INVALID';end if;
 for field in select jsonb_object_keys(u) loop if field not in ('type','levelLabel','privateLotReference','dimensionSource','dimensionObservedAt','sourceDocumentIds','limitingPoint') then raise exception 'COMMERCIAL_INVALID';end if;end loop;
 if jsonb_typeof(u->'levelLabel') is distinct from 'string' or length(u->>'levelLabel')>40 or jsonb_typeof(u->'limitingPoint') is distinct from 'string' or length(u->>'limitingPoint')>500 or coalesce(u->>'dimensionSource','') not in ('unknown','seller_declared','measured','plan_derived') or (u ? 'type' and coalesce(u->>'type','') not in ('covered','box','outdoor')) or (u ? 'privateLotReference' and (jsonb_typeof(u->'privateLotReference') is distinct from 'string' or length(u->>'privateLotReference')>40)) then raise exception 'COMMERCIAL_INVALID';end if;
 perform gp_commercial_date(u->'dimensionObservedAt');perform gp_commercial_documents(coalesce(u->'sourceDocumentIds','[]'),p_id,p_submit and u->>'dimensionSource'='plan_derived');
 end loop;
 for field in select jsonb_object_keys(c->'access') loop if field not in ('gate','door','badge','key','lift') then raise exception 'COMMERCIAL_INVALID';end if;end loop;
 foreach field in array array['gate','door','badge','key','lift'] loop if coalesce(c->'access'->>field,'') not in ('unknown','present','absent') then raise exception 'COMMERCIAL_INVALID';end if;end loop;
 foreach field in array array['chargesSource','taxSource','rentalIncome'] loop
 f=c->field;if field='rentalIncome' and f='null'::jsonb then continue;end if;if jsonb_typeof(f) is distinct from 'object' then raise exception 'COMMERCIAL_INVALID';end if;
 for k in select jsonb_object_keys(f) loop if (field='rentalIncome' and k not in ('amountCents','period','observedAt','sourceKind','sourceDocumentIds')) or (field<>'rentalIncome' and k not in ('year','scope','sourceKind','sourceDocumentIds')) then raise exception 'COMMERCIAL_INVALID';end if;end loop;
 if coalesce(f->>'sourceKind','') not in ('unknown','seller_declared','provided_document') then raise exception 'COMMERCIAL_INVALID';end if;
 perform gp_commercial_documents(f->'sourceDocumentIds',p_id,p_submit and f->>'sourceKind'='provided_document');
 if field='rentalIncome' then
 if not(f ? 'amountCents') or (f->'amountCents'<>'null'::jsonb and (jsonb_typeof(f->'amountCents') is distinct from 'number' or (f->>'amountCents')::numeric not between 0 and 100000000 or trunc((f->>'amountCents')::numeric)<>(f->>'amountCents')::numeric)) or coalesce(f->>'period','') not in ('month','year') then raise exception 'COMMERCIAL_INVALID';end if;perform gp_commercial_date(f->'observedAt');
 else if not(f ? 'year') or (f->'year'<>'null'::jsonb and (jsonb_typeof(f->'year') is distinct from 'number' or (f->>'year')::numeric not between 1900 and extract(year from now())+1 or trunc((f->>'year')::numeric)<>(f->>'year')::numeric)) or jsonb_typeof(f->'scope') is distinct from 'string' or length(f->>'scope')>300 then raise exception 'COMMERCIAL_INVALID';end if;end if;
 end loop;
 for k,v in select key,value from jsonb_each(c->'photoMetadata') loop
 if not exists(select 1 from gp_all_photo_urls(p)photo where photo='/api/media/'||k) or not exists(select 1 from media_assets m where m.id::text=k and m.owner_id=auth.uid() and m.listing_id=p_id) or jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'caption') is distinct from 'string' or length(v->>'caption')>300 or exists(select 1 from jsonb_object_keys(v) keys(key) where keys.key not in ('caption','takenAt')) then raise exception 'COMMERCIAL_INVALID';end if;perform gp_commercial_date(v->'takenAt');end loop;
 if p_submit and p->>'type'='mixed' and (jsonb_array_length(p->'spaces')<2 or exists(select 1 from jsonb_array_elements(p->'spaces')s where c->'units'->(s->>'id')->>'type' is null)) then raise exception 'COMMERCIAL_INVALID';end if;
 end;$$;
alter function public.gp_validate_draft(jsonb,uuid,boolean) rename to gp_validate_draft_before_commercial;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare core jsonb;begin
 if exists(select 1 from jsonb_array_elements(p->'spaces')u where jsonb_typeof(u->'number') is distinct from 'string' or length(u->>'number')>40) then raise exception 'VALIDATION_ERROR';end if;
 core=p-'commercialDetails'-'publicCoordinates'-'locationConfirmedAt';if p->>'type'='mixed' then core=jsonb_set(core,'{type}','"covered"');end if;
 select jsonb_set(core,'{spaces}',coalesce(jsonb_agg(jsonb_set(u,'{number}',to_jsonb(case when length(u->>'number')=0 then 'Unité' else left(u->>'number',30) end))),'[]')) into core from jsonb_array_elements(core->'spaces')u;
 perform gp_validate_draft_before_commercial(core,p_id,p_submit);perform gp_validate_commercial(p,p_id,p_submit);end;$$;
alter function public.gp_listing(uuid,text,jsonb,integer) rename to gp_listing_before_commercial;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;candidate jsonb;result jsonb;confirmation_hash text;field text;stage jsonb;original_spaces jsonb;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 if p_action in ('update','submit') then
 select * into l from listings where id=p_id for update;if not found or l.seller_id<>auth.uid() then raise exception 'NOT_FOUND';end if;if p_version is null or l.row_version<>p_version then raise exception 'VERSION_CONFLICT';end if;
 candidate=l.draft||p_payload;
 if p_action='submit' then if l.draft->>'locationConfirmedAt' is null or l.location_confirmation_hash is distinct from gp_location_hash(l.draft) then raise exception 'LOCATION_CONFIRMATION_REQUIRED';end if;
 original_spaces=l.draft->'spaces';update listings set draft=jsonb_set(draft,'{spaces}',(select jsonb_agg(case when length(u->>'number')=0 then jsonb_set(u,'{number}','"Unité"') else u end) from jsonb_array_elements(l.draft->'spaces')u)) where id=p_id;
 else
 stage=l.draft;confirmation_hash=l.location_confirmation_hash;
 foreach field in array array['commercialDetails','publicCoordinates'] loop if p_payload ? field then stage=jsonb_set(stage,array[field],p_payload->field);end if;end loop;
 if gp_location_hash(l.draft) is distinct from gp_location_hash(candidate) then stage=jsonb_set(stage,'{locationConfirmedAt}','null');confirmation_hash=null;
 elsif p_payload ? 'locationConfirmedAt' then
 if p_payload->'locationConfirmedAt'='null'::jsonb then stage=jsonb_set(stage,'{locationConfirmedAt}','null');confirmation_hash=null;
 else if jsonb_typeof(p_payload->'locationConfirmedAt') is distinct from 'string' then raise exception 'COMMERCIAL_INVALID';end if;perform (p_payload->>'locationConfirmedAt')::timestamptz;if l.draft->'locationConfirmedAt' is distinct from p_payload->'locationConfirmedAt' or confirmation_hash is distinct from gp_location_hash(candidate) then stage=jsonb_set(stage,'{locationConfirmedAt}',to_jsonb(now()));end if;confirmation_hash=gp_location_hash(candidate);end if;end if;
 update listings set draft=stage,location_confirmation_hash=confirmation_hash where id=p_id;
 end if;end if;
 result=gp_listing_before_commercial(p_id,p_action,p_payload-'commercialDetails'-'publicCoordinates'-'locationConfirmedAt',p_version);
 if p_action='submit' then result=jsonb_set(result,'{spaces}',original_spaces);update listings set draft=result where id=p_id;update listing_revisions set payload=result where listing_id=p_id and revision_no=(result->>'version')::integer;end if;
 if p_action='create' then
 foreach field in array array['commercialDetails','publicCoordinates'] loop if p_payload ? field then result=jsonb_set(result,array[field],p_payload->field);end if;end loop;result=result||'{"locationConfirmedAt":null}'::jsonb;perform gp_validate_draft(result,p_id,false);update listings set draft=result,location_confirmation_hash=null where id=p_id;end if;
 return result;end;$$;
alter function public.gp_public_payload(jsonb) rename to gp_public_payload_before_commercial;
create function public.gp_public_payload(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$declare result jsonb;c jsonb;units jsonb;access jsonb;photos jsonb;f jsonb;field text;details jsonb;begin
 result=gp_public_payload_before_commercial(p);if p->>'locationPrecision'='area' and p ? 'publicCoordinates' then result=jsonb_set(result,'{coordinates}',p->'publicCoordinates');end if;
 if p ? 'publicCoordinates' then result=jsonb_set(result,'{publicCoordinates}',p->'publicCoordinates');end if;
 result=jsonb_set(result,'{locationConfirmedAt}',coalesce(p->'locationConfirmedAt','null'));
 if not(p ? 'commercialDetails') then return result;end if;c=p->'commercialDetails';
 select coalesce(jsonb_object_agg((p->>'id')||':unit:'||s.ordinality,(jsonb_build_object('levelLabel',u->'levelLabel','dimensionSource',u->'dimensionSource','dimensionObservedAt',u->'dimensionObservedAt','limitingPoint',u->'limitingPoint')||case when u ? 'type' then jsonb_build_object('type',u->'type') else '{}'::jsonb end)),'{}') into units from jsonb_array_elements(p->'spaces') with ordinality s cross join lateral(select c->'units'->(s.value->>'id')u)v where jsonb_typeof(u)='object';
 access=jsonb_build_object('gate',c->'access'->'gate','door',c->'access'->'door','badge',c->'access'->'badge','key',c->'access'->'key','lift',c->'access'->'lift');
 details=jsonb_build_object('postalCode',c->'postalCode','units',units,'access',access);
 foreach field in array array['chargesSource','taxSource'] loop f=c->field;details=jsonb_set(details,array[field],jsonb_build_object('year',f->'year','scope',f->'scope','sourceKind',f->'sourceKind','sourceDocumentIds','[]'::jsonb));end loop;
 f=c->'rentalIncome';details=jsonb_set(details,'{rentalIncome}',case when f='null'::jsonb then 'null'::jsonb else jsonb_build_object('amountCents',f->'amountCents','period',f->'period','observedAt',f->'observedAt','sourceKind',f->'sourceKind','sourceDocumentIds','[]'::jsonb)end);
 select coalesce(jsonb_object_agg(key,jsonb_build_object('caption',value->'caption','takenAt',value->'takenAt')),'{}') into photos from jsonb_each(c->'photoMetadata') where exists(select 1 from gp_all_photo_urls(p)photo where photo='/api/media/'||key);details=jsonb_set(details,'{photoMetadata}',photos);
 return result||jsonb_build_object('commercialDetails',details);end;$$;
create function public.gp_listing_preview(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare value jsonb;begin if not gp_active() then raise exception 'UNAUTHENTICATED';end if;select draft into value from listings where id=p_id and seller_id=auth.uid();if not found then raise exception 'NOT_FOUND';end if;return gp_public_payload(value);end;$$;
create or replace function public.gp_catalog_page_v2(p_filters jsonb default '{}',p_cursor jsonb default null,p_limit integer default 24) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f jsonb;field text;entry jsonb;ordering text;q text;kind text;occupancy text;minimum bigint;maximum bigint;minimum_area numeric;covered boolean;closed boolean;level_no integer;scene boolean;bounds jsonb;center jsonb;radius numeric;ids jsonb;snapshot_at timestamptz;after_id uuid;after_date timestamptz;after_price bigint;after_area numeric;after_count integer;result jsonb;
begin
 f=coalesce(p_filters,'{}');if jsonb_typeof(f) is distinct from 'object' or p_limit is null or p_limit not between 1 and 50 then raise exception 'VALIDATION_ERROR';end if;
 for field in select jsonb_object_keys(f) loop if field not in ('query','type','maxPrice','minPrice','minArea','sort','scene','covered','closed','occupancy','level','bbox','center','radiusKm','ids') then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['query','type','sort','occupancy'] loop if f ? field and f->field<>'null'::jsonb and jsonb_typeof(f->field) is distinct from 'string' then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['scene','covered','closed'] loop if f ? field and f->field<>'null'::jsonb and jsonb_typeof(f->field) is distinct from 'boolean' then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['maxPrice','minPrice','minArea','level','radiusKm'] loop if f ? field and f->field<>'null'::jsonb and jsonb_typeof(f->field) is distinct from 'number' then raise exception 'VALIDATION_ERROR';end if;end loop;
 ordering=coalesce(f->>'sort','recent');q=coalesce(f->>'query','');kind=f->>'type';occupancy=f->>'occupancy';
 if ordering not in ('recent','price_asc','price_desc','area_asc','spaces_desc') or length(q)>200 or (kind is not null and kind not in ('covered','box','outdoor','mixed')) or (occupancy is not null and occupancy not in ('vacant','occupied','unknown')) then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['maxPrice','minPrice'] loop if f->>field is not null and ((f->>field)::numeric not between 0 and 10000000000 or trunc((f->>field)::numeric)<>(f->>field)::numeric) then raise exception 'VALIDATION_ERROR';end if;end loop;
 if f->>'level' is not null and ((f->>'level')::numeric not between -20 and 50 or trunc((f->>'level')::numeric)<>(f->>'level')::numeric) then raise exception 'VALIDATION_ERROR';end if;
 minimum=(f->>'minPrice')::bigint;maximum=(f->>'maxPrice')::bigint;minimum_area=(f->>'minArea')::numeric;level_no=(f->>'level')::integer;scene=coalesce((f->>'scene')::boolean,false);covered=(f->>'covered')::boolean;closed=(f->>'closed')::boolean;radius=(f->>'radiusKm')::numeric;
 if (minimum is not null and maximum is not null and minimum>maximum) or minimum_area not between 0 and 500 or radius not between 0.1 and 200 then raise exception 'VALIDATION_ERROR';end if;
 bounds=nullif(f->'bbox','null'::jsonb);center=nullif(f->'center','null'::jsonb);ids=nullif(f->'ids','null'::jsonb);
 foreach field in array array['bbox','center'] loop
 entry=nullif(f->field,'null'::jsonb);if entry is not null then
 if jsonb_typeof(entry) is distinct from 'array' or jsonb_array_length(entry)<>(case when field='bbox' then 4 else 2 end) or exists(select 1 from jsonb_array_elements(entry) with ordinality e where jsonb_typeof(value) is distinct from 'number' or (value::text)::numeric < -(case when ordinality%2=1 then 180 else 90 end) or (value::text)::numeric > (case when ordinality%2=1 then 180 else 90 end)) then raise exception 'VALIDATION_ERROR';end if;end if;end loop;
 if (bounds is not null and (bounds->>1)::numeric>(bounds->>3)::numeric) or (center is null)<>(radius is null) then raise exception 'VALIDATION_ERROR';end if;
 if ids is not null then if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) not between 1 and 100 or exists(select 1 from jsonb_array_elements(ids) e where jsonb_typeof(value) is distinct from 'string' or value#>>'{}'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'VALIDATION_ERROR';end if;end if;
 snapshot_at=statement_timestamp();
 if p_cursor is not null then
 if jsonb_typeof(p_cursor) is distinct from 'object' or p_cursor->>'version' is distinct from '2' or jsonb_typeof(p_cursor->'asOf') is distinct from 'string' or jsonb_typeof(p_cursor->'after') is distinct from 'object' or coalesce(p_cursor->'after'->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_cursor->'after'->'createdAt') is distinct from 'string' or jsonb_typeof(p_cursor->'after'->'priceCents') is distinct from 'number' or not(p_cursor->'after' ? 'areaM2') or (p_cursor->'after'->'areaM2'<>'null'::jsonb and jsonb_typeof(p_cursor->'after'->'areaM2') is distinct from 'number') or jsonb_typeof(p_cursor->'after'->'spaceCount') is distinct from 'number' then raise exception 'INVALID_CURSOR';end if;
 begin snapshot_at=(p_cursor->>'asOf')::timestamptz;after_id=(p_cursor->'after'->>'id')::uuid;after_date=(p_cursor->'after'->>'createdAt')::timestamptz;after_price=(p_cursor->'after'->>'priceCents')::bigint;after_area=(p_cursor->'after'->>'areaM2')::numeric;after_count=(p_cursor->'after'->>'spaceCount')::integer;exception when others then raise exception 'INVALID_CURSOR';end;
 if snapshot_at>statement_timestamp()+interval '5 minutes' or snapshot_at<statement_timestamp()-interval '1 day' or after_price not between 0 and 10000000000 or after_count not between 1 and 500 or after_area<=0 or after_area>500 then raise exception 'INVALID_CURSOR';end if;
 end if;
 with base as materialized(
 select p.id,p.created_at,p.payload,(p.payload->>'priceCents')::bigint price_cents,jsonb_array_length(p.payload->'spaces') space_count,
 case when exists(select 1 from jsonb_array_elements(p.payload->'spaces')u where u->>'areaM2' is null) then null else (select min((u->>'areaM2')::numeric) from jsonb_array_elements(p.payload->'spaces')u) end area_m2,
 (p.payload->'coordinates'->>0)::double precision lon,(p.payload->'coordinates'->>1)::double precision lat
 from published_listings p where p.created_at<=snapshot_at
 and (q='' or lower((p.payload->>'city')||' '||(p.payload->>'district')||' '||(p.payload->>'title')) like '%'||lower(q)||'%')
 and (kind is null or p.payload->>'type'=kind or (p.payload->>'type'='mixed' and exists(select 1 from jsonb_array_elements(p.payload->'spaces')s where p.payload->'commercialDetails'->'units'->(s->>'id')->>'type'=kind)))
 and (minimum is null or (p.payload->>'priceCents')::bigint>=minimum) and (maximum is null or (p.payload->>'priceCents')::bigint<=maximum)
 and (covered is null or (case when p.payload->>'type'='mixed' then not exists(select 1 from jsonb_array_elements(p.payload->'spaces')s where coalesce(p.payload->'commercialDetails'->'units'->(s->>'id')->>'type','unknown') not in ('covered','box')) else p.payload->>'type' in ('covered','box') end)=covered) and (closed is null or (case when p.payload->>'type'='mixed' then not exists(select 1 from jsonb_array_elements(p.payload->'spaces')s where coalesce(p.payload->'commercialDetails'->'units'->(s->>'id')->>'type','unknown')<>'box') else p.payload->>'type'='box' end)=closed)
 and (occupancy is null or coalesce(p.payload->>'occupancy','unknown')=occupancy)
 and (level_no is null or exists(select 1 from jsonb_array_elements(p.payload->'spaces')u where (u->>'level')::integer=level_no))
 and (ids is null or ids ? p.id::text)
 ),filtered as materialized(
 select *,gp_scene_public(id,null) is not null scene_ready from base where (minimum_area is null or area_m2>=minimum_area)
 and (bounds is null or lat between (bounds->>1)::double precision and (bounds->>3)::double precision and (case when (bounds->>0)::numeric<=(bounds->>2)::numeric then lon between (bounds->>0)::double precision and (bounds->>2)::double precision else lon>=(bounds->>0)::double precision or lon<=(bounds->>2)::double precision end))
 -- Haversine reads the sanitized public payload; private plans, exact source coordinates and public_location are never consulted.
 and (center is null or 6371.0088*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(lat-(center->>1)::double precision)/2),2)+cos(radians(lat))*cos(radians((center->>1)::double precision))*power(sin(radians(lon-(center->>0)::double precision)/2),2)))))<=radius)
 ),matching as materialized(select * from filtered where not scene or scene_ready),ranked as(
 select *,row_number() over(order by case when ordering='price_asc' then price_cents end asc,case when ordering='price_desc' then price_cents end desc,case when ordering='area_asc' then area_m2 end asc nulls last,case when ordering='spaces_desc' then space_count end desc,case when ordering='recent' then created_at end desc,id asc) rn
 from matching where after_id is null
 or (ordering='recent' and (created_at<after_date or created_at=after_date and id>after_id))
 or (ordering='price_asc' and (price_cents>after_price or price_cents=after_price and id>after_id))
 or (ordering='price_desc' and (price_cents<after_price or price_cents=after_price and id>after_id))
 or (ordering='spaces_desc' and (space_count<after_count or space_count=after_count and id>after_id))
 or (ordering='area_asc' and (after_area is not null and (area_m2>after_area or area_m2 is null or area_m2=after_area and id>after_id) or after_area is null and area_m2 is null and id>after_id))
 order by rn limit p_limit+1
 ),visible as(select * from ranked where rn<=p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_set(payload,'{sceneAvailable}',to_jsonb(scene_ready)) order by rn) from visible),'[]'),'total',(select count(*) from matching),'nextPosition',case when (select count(*) from ranked)>p_limit then (select jsonb_build_object('version',2,'asOf',snapshot_at,'after',jsonb_build_object('id',id,'createdAt',created_at,'priceCents',price_cents,'areaM2',area_m2,'spaceCount',space_count)) from visible order by rn desc limit 1) else null end) into result;
 return result;
 exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then raise exception 'VALIDATION_ERROR';
 end;$$;
revoke all on function public.gp_location_hash(jsonb),public.gp_commercial_date(jsonb),public.gp_commercial_documents(jsonb,uuid,boolean),public.gp_validate_commercial(jsonb,uuid,boolean),public.gp_validate_draft_before_commercial(jsonb,uuid,boolean),public.gp_validate_draft(jsonb,uuid,boolean),public.gp_listing_before_commercial(uuid,text,jsonb,integer),public.gp_listing(uuid,text,jsonb,integer),public.gp_public_payload_before_commercial(jsonb),public.gp_public_payload(jsonb),public.gp_listing_preview(uuid) from public,anon,authenticated;
grant execute on function public.gp_listing(uuid,text,jsonb,integer),public.gp_listing_preview(uuid) to authenticated;
commit;
