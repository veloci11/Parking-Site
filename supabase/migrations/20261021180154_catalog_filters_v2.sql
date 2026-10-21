-- 011: public-only spatial search and all catalog filters before keyset pagination.
begin;
create function public.gp_catalog_page_v2(p_filters jsonb default '{}',p_cursor jsonb default null,p_limit integer default 24) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f jsonb;field text;entry jsonb;ordering text;q text;kind text;occupancy text;minimum bigint;maximum bigint;minimum_area numeric;covered boolean;closed boolean;level_no integer;scene boolean;bounds jsonb;center jsonb;radius numeric;ids jsonb;snapshot_at timestamptz;after_id uuid;after_date timestamptz;after_price bigint;after_area numeric;after_count integer;result jsonb;
begin
 f=coalesce(p_filters,'{}');if jsonb_typeof(f) is distinct from 'object' or p_limit is null or p_limit not between 1 and 50 then raise exception 'VALIDATION_ERROR';end if;
 for field in select jsonb_object_keys(f) loop if field not in ('query','type','maxPrice','minPrice','minArea','sort','scene','covered','closed','occupancy','level','bbox','center','radiusKm','ids') then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['query','type','sort','occupancy'] loop if f ? field and f->field<>'null'::jsonb and jsonb_typeof(f->field) is distinct from 'string' then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['scene','covered','closed'] loop if f ? field and f->field<>'null'::jsonb and jsonb_typeof(f->field) is distinct from 'boolean' then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['maxPrice','minPrice','minArea','level','radiusKm'] loop if f ? field and f->field<>'null'::jsonb and jsonb_typeof(f->field) is distinct from 'number' then raise exception 'VALIDATION_ERROR';end if;end loop;
 ordering=coalesce(f->>'sort','recent');q=coalesce(f->>'query','');kind=f->>'type';occupancy=f->>'occupancy';
 if ordering not in ('recent','price_asc','price_desc','area_asc','spaces_desc') or length(q)>200 or (kind is not null and kind not in ('covered','box','outdoor')) or (occupancy is not null and occupancy not in ('vacant','occupied','unknown')) then raise exception 'VALIDATION_ERROR';end if;
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
 and (kind is null or p.payload->>'type'=kind)
 and (minimum is null or (p.payload->>'priceCents')::bigint>=minimum) and (maximum is null or (p.payload->>'priceCents')::bigint<=maximum)
 and (covered is null or (p.payload->>'type' in ('covered','box'))=covered) and (closed is null or (p.payload->>'type'='box')=closed)
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
revoke execute on function public.gp_catalog_page_v2(jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.gp_catalog_page_v2(jsonb,jsonb,integer) to anon,authenticated;
commit;
