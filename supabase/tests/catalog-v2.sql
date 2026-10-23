-- Transaction-only fixtures, no auth user or application data persists.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values('fa000000-0000-4000-8000-000000000001','{"name":"Catalogue test"}',now());
do $$declare i integer;lid uuid;value jsonb;units jsonb;begin for i in 1..8 loop
 lid=('fb000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
 select jsonb_agg(jsonb_build_object('id','fixture-'||j,'number',j,'level',case when j=1 then -1 else 0 end,'areaM2',case when i>=7 then null when i<=3 then 12 else 16 end)) into units from generate_series(1,(i%3)+1) j;
 value=jsonb_build_object('id',lid,'title','Recherche V2 '||i,'city','Paris','district','Catalogue V2','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',i*100000,'type',case when i%3=0 then 'outdoor' when i%3=1 then 'covered' else 'box' end,'occupancy',case when i%3=0 then 'vacant' when i%3=1 then 'occupied' else 'unknown' end,'spaces',units,'coordinates','[2.37,48.84]'::jsonb,'locationPrecision','area','sceneAvailable',false,'isDemo',false);
 insert into listings(id,seller_id,draft,lifecycle_state,last_published,availability_confirmed_at,availability_expires_at) values(lid,'fa000000-0000-4000-8000-000000000001',value||'{"coordinates":[2.3739,48.8446]}'::jsonb,'published',value,now(),now()+interval '90 days');
 insert into published_listings(id,payload,created_at) values(lid,value,clock_timestamp()-make_interval(mins=>i));end loop;end;$$;
set local role anon;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","minPrice":200000,"maxPrice":500000,"covered":true,"closed":true}',null,1)->>'total')::integer=2)::integer) as all_filters_before_limit;
select 1/((jsonb_array_length(gp_catalog_page_v2('{"query":"Catalogue V2","minPrice":200000,"maxPrice":500000,"closed":true}',null,1)->'items')=1)::integer) as limit_after_filters;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","covered":false}',null,20)->>'total')::integer=2)::integer) as outdoor_only;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","occupancy":"unknown"}',null,20)->>'total')::integer=3)::integer) as unknown_occupancy;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","level":0}',null,20)->>'total')::integer=6)::integer) as any_unit_level;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","level":50}',null,20)->>'total')::integer=0)::integer) as maximum_level_valid;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","bbox":[2.36,48.83,2.39,48.86]}',null,1)->>'total')::integer=8)::integer) as bounds_before_limit;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","center":[2.37,48.84],"radiusKm":0.1}',null,1)->>'total')::integer=8)::integer) as public_radius_include;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","center":[2.3739,48.8446],"radiusKm":0.1}',null,1)->>'total')::integer=0)::integer) as private_coordinate_not_used;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","ids":["fb000000-0000-4000-8000-000000000008"]}',null,1)->'items'->0->>'id')='fb000000-0000-4000-8000-000000000008')::integer) as selected_favorites_before_limit;
do $$declare sort_order text;cursor jsonb;page jsonb;seen jsonb;expected jsonb;begin
 foreach sort_order in array array['area_asc','spaces_desc','price_asc','price_desc','recent'] loop
 expected=gp_catalog_page_v2(jsonb_build_object('query','Catalogue V2','sort',sort_order),null,50)->'items';cursor=null;seen='[]';
 loop page=gp_catalog_page_v2(jsonb_build_object('query','Catalogue V2','sort',sort_order),cursor,1);seen=seen||(page->'items');cursor=nullif(page->'nextPosition','null'::jsonb);exit when cursor is null;end loop;
 if seen<>expected or jsonb_array_length(seen)<>8 or (select count(distinct value->>'id') from jsonb_array_elements(seen))<>8 then raise exception 'Unstable sort %',sort_order;end if;
 if sort_order='area_asc' and (seen->7->'spaces'->0->'areaM2')<>'null'::jsonb then raise exception 'Unknown area must sort last';end if;
 end loop;
 begin perform gp_catalog_page_v2('{"radiusKm":1}',null,1);raise exception 'Missing center accepted';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
 begin perform gp_catalog_page_v2('{"bbox":[181,0,1,1]}',null,1);raise exception 'Bad bbox accepted';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
 end;$$;
-- A new publication between pages does not enter the established search snapshot.
select set_config('gp.qa_page',gp_catalog_page_v2('{"query":"Catalogue V2","sort":"area_asc"}',null,2)::text,true);
reset role;
insert into listings(id,seller_id,draft,lifecycle_state,last_published,availability_confirmed_at,availability_expires_at)
select 'fb000000-0000-4000-8000-000000000099',seller_id,draft||'{"id":"fb000000-0000-4000-8000-000000000099"}'::jsonb,'published',last_published||'{"id":"fb000000-0000-4000-8000-000000000099"}'::jsonb,now(),now()+interval '90 days' from listings where id='fb000000-0000-4000-8000-000000000001';
insert into published_listings(id,payload,created_at) values('fb000000-0000-4000-8000-000000000099','{"id":"fb000000-0000-4000-8000-000000000099","title":"Nouveau","city":"Paris","district":"Catalogue V2","priceCents":1,"spaces":[{"areaM2":1,"level":0}],"coordinates":[2.37,48.84]}',clock_timestamp()+interval '1 second');
set local role anon;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","sort":"area_asc"}',current_setting('gp.qa_page')::jsonb->'nextPosition',2)->>'total')::integer=8)::integer) as snapshot_excludes_new;
select 1/(((gp_catalog_page_v2('{"query":"Catalogue V2","sort":"area_asc"}',current_setting('gp.qa_page')::jsonb->'nextPosition',2)->'items'->0->>'id')='fb000000-0000-4000-8000-000000000003')::integer) as tie_keyset_continues;
reset role;
rollback;
