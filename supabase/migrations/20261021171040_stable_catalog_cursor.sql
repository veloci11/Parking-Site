-- Keyset pagination. Existing gp_catalog remains available for compatibility.
begin;
create index gp_catalog_created_cursor on public.published_listings(created_at desc,id);
create index gp_catalog_price_cursor on public.published_listings(((payload->>'priceCents')::bigint),id);
create function public.gp_catalog_page(p_query text default '',p_type text default null,p_price_max bigint default null,p_area_min numeric default null,p_sort text default 'recent',p_cursor jsonb default null,p_limit integer default 24,p_scene boolean default false) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare snapshot_at timestamptz;after_id uuid;after_date timestamptz;after_price bigint;take integer;ordering text;result jsonb;
begin
 ordering=coalesce(p_sort,'recent');take=least(50,greatest(1,p_limit));if ordering not in ('recent','price_asc','price_desc') then raise exception 'VALIDATION_ERROR';end if;
 snapshot_at=statement_timestamp();
 if p_cursor is not null then
 if jsonb_typeof(p_cursor) is distinct from 'object' or p_cursor->>'version' is distinct from '1' or jsonb_typeof(p_cursor->'asOf') is distinct from 'string' or jsonb_typeof(p_cursor->'after') is distinct from 'object' or coalesce(p_cursor->'after'->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_cursor->'after'->'createdAt') is distinct from 'string' or jsonb_typeof(p_cursor->'after'->'priceCents') is distinct from 'number' then raise exception 'INVALID_CURSOR';end if;
 begin snapshot_at=(p_cursor->>'asOf')::timestamptz;after_id=(p_cursor->'after'->>'id')::uuid;after_date=(p_cursor->'after'->>'createdAt')::timestamptz;after_price=(p_cursor->'after'->>'priceCents')::bigint;exception when others then raise exception 'INVALID_CURSOR';end;
 if snapshot_at>statement_timestamp()+interval '5 minutes' or snapshot_at<statement_timestamp()-interval '1 day' or after_price<0 or after_price>10000000000 then raise exception 'INVALID_CURSOR';end if;
 end if;
 with filtered as materialized(
 select p.id,p.created_at,p.payload,(p.payload->>'priceCents')::bigint as price_cents,public.gp_scene_public(p.id,null) is not null as scene_ready
 from public.published_listings p where p.created_at<=snapshot_at
 and (coalesce(p_query,'')='' or lower((p.payload->>'city')||' '||(p.payload->>'district')||' '||(p.payload->>'title')) like '%'||lower(p_query)||'%')
 and (p_type is null or p.payload->>'type'=p_type)
 and (p_price_max is null or (p.payload->>'priceCents')::bigint<=p_price_max)
 and (p_area_min is null or not exists(select 1 from jsonb_array_elements(p.payload->'spaces')u where u->>'areaM2' is null or (u->>'areaM2')::numeric<p_area_min))
 ),matching as materialized(select * from filtered where not coalesce(p_scene,false) or scene_ready),ranked as(
 select *,row_number() over(order by case when ordering='price_asc' then price_cents end asc,case when ordering='price_desc' then price_cents end desc,case when ordering='recent' then created_at end desc,id asc) as rn
 from matching where after_id is null or (ordering='recent' and (created_at<after_date or created_at=after_date and id>after_id)) or (ordering='price_asc' and (price_cents>after_price or price_cents=after_price and id>after_id)) or (ordering='price_desc' and (price_cents<after_price or price_cents=after_price and id>after_id))
 order by case when ordering='price_asc' then price_cents end asc,case when ordering='price_desc' then price_cents end desc,case when ordering='recent' then created_at end desc,id asc limit take+1
 ),visible as(select * from ranked where rn<=take)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_set(payload,'{sceneAvailable}',to_jsonb(scene_ready)) order by rn) from visible),'[]'),'total',(select count(*) from matching),'nextPosition',case when (select count(*) from ranked)>take then (select jsonb_build_object('version',1,'asOf',snapshot_at,'after',jsonb_build_object('id',id,'createdAt',created_at,'priceCents',price_cents)) from visible order by rn desc limit 1) else null end) into result;
 return result;
end;$$;
revoke execute on function public.gp_catalog_page(text,text,bigint,numeric,text,jsonb,integer,boolean) from public,anon,authenticated;
grant execute on function public.gp_catalog_page(text,text,bigint,numeric,text,jsonb,integer,boolean) to anon,authenticated;
commit;
