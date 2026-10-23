-- 028: isolated synthetic region fixtures; no Auth network calls or human data. Always rollback.
begin;
select 1/((select count(*)=8 from gp_private.idf_departments)::integer) as eight_official_departments;
select 1/((select bool_and(gp_idf_payload_allowed(jsonb_build_object('city',city,'coordinates',coordinates,'commercialDetails',jsonb_build_object('postalCode',postal)),true)) from(values
('Paris','75012','[2.3739,48.8446]'::jsonb),('Melun','77000','[2.66,48.54]'),('Versailles','78000','[2.1362,48.7963]'),('Évry-Courcouronnes','91000','[2.429,48.629]'),('Boulogne-Billancourt','92100','[2.2402,48.8331]'),('Saint-Denis','93200','[2.3578,48.9274]'),('Créteil','94000','[2.4556,48.7904]'),('Pontoise','95000','[2.097,49.051]'))v(city,postal,coordinates))::integer) as all_eight_departments_publishable;
select 1/((not gp_idf_payload_allowed('{"city":"Lyon","coordinates":[4.859,45.76],"commercialDetails":{"postalCode":"69003"}}',true)
and not gp_idf_payload_allowed('{"city":"Paris","coordinates":[2.3739,48.8446],"commercialDetails":{"postalCode":"92100"}}',true)
and not gp_idf_payload_allowed('{"city":"Boulogne-Billancourt","coordinates":[2.3739,48.8446],"commercialDetails":{"postalCode":"92100"}}',true)
and not gp_idf_payload_allowed('{"city":"Paris","coordinates":[2.3739,48.8446],"commercialDetails":{"postalCode":"75099"}}',true)
and not gp_idf_payload_allowed('{"city":"Paris","coordinates":[2.3739,48.8446]}',true)
and gp_idf_payload_allowed('{"city":"Paris 12e","coordinates":[2.3739,48.8446]}',false))::integer) as outside_spoofed_department_and_missing_postal_refused;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values('f2810000-0000-4000-8000-000000000001','{"name":"Region Seller QA"}',now());
insert into listings(id,seller_id,draft,last_published,lifecycle_state,availability_confirmed_at,availability_expires_at)
select ('f2820000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f2810000-0000-4000-8000-000000000001',p,case when n=3 then null else p end,case when n in(1,5) then 'published' when n=4 then 'paused' else 'draft' end,now(),now()+interval '90 days'
from generate_series(1,6)n cross join lateral(select jsonb_build_object('id','f2820000-0000-4000-8000-'||lpad(n::text,12,'0'),'slug','region-qa','title','Place de parking de recette régionale','description',repeat('Description factuelle de recette. ',5),'city',case when n in(1,6) then 'Paris' when n=5 then 'Versailles' else 'Lyon' end,'district','Recette','priceCents',case when n in(2,6) then 1 else 2000000 end,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f2830000-0000-4000-8000-'||lpad(n::text,12,'0'),'number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":""}'::jsonb,'locationPrecision','exact_opt_in','coordinates',case when n in(1,6) then '[2.3739,48.8446]'::jsonb when n=5 then '[2.1362,48.7963]' else '[4.859,45.76]' end,'commercialDetails',jsonb_build_object('postalCode',case when n=1 then '75012' when n=5 then '78000' when n=6 then '92100' else '69003' end),'sceneAvailable',false,'isDemo',false,'status','draft','version',1,'sellerName','QA','createdAt',now(),'updatedAt',now())p)q;
-- Draft-state snapshots emulate historical rows without rewriting production records or disabling triggers.
insert into published_listings(id,payload) select id,gp_public_payload(last_published) from listings where id::text like 'f2820000-%' and last_published is not null and lifecycle_state<>'paused';
select 1/((select draft->>'city'='Lyon' from listings where id='f2820000-0000-4000-8000-000000000003')::integer) as incomplete_outside_draft_is_preserved;
do $$begin
 begin update listings set lifecycle_state='pending' where id='f2820000-0000-4000-8000-000000000003';raise exception 'Expected region submit guard';exception when others then if sqlerrm<>'REGION_OUTSIDE_IDF' then raise;end if;end;
 begin update listings set lifecycle_state='published',last_published=draft where id='f2820000-0000-4000-8000-000000000003';raise exception 'Expected region publication guard';exception when others then if sqlerrm<>'REGION_OUTSIDE_IDF' then raise;end if;end;
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2810000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2810000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$begin begin perform gp_listing('f2820000-0000-4000-8000-000000000004','resume','{}',1);raise exception 'Expected region resume guard';exception when others then if sqlerrm<>'REGION_OUTSIDE_IDF' then raise;end if;end;end;$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select 1/((select count(*)=2 from published_listings where id::text like 'f2820000-%')::integer) as direct_rest_rls_keeps_only_idf;
select 1/(((gp_catalog_page_v2('{"ids":["f2820000-0000-4000-8000-000000000001","f2820000-0000-4000-8000-000000000002","f2820000-0000-4000-8000-000000000005","f2820000-0000-4000-8000-000000000006"],"sort":"price_asc"}',null,1)->>'total')::integer=2)::integer) as scope_before_count_cursor_and_limit;
select 1/((gp_catalog_page_v2('{"ids":["f2820000-0000-4000-8000-000000000001","f2820000-0000-4000-8000-000000000002","f2820000-0000-4000-8000-000000000005","f2820000-0000-4000-8000-000000000006"],"sort":"price_asc"}',null,1)->'items'->0->>'id'='f2820000-0000-4000-8000-000000000001')::integer) as excluded_cheapest_outside_listing_cannot_starve_first_page;
select 1/((not gp_listing_available('f2820000-0000-4000-8000-000000000002') and not gp_effective_scene_available('f2820000-0000-4000-8000-000000000002') and gp_public_parking(null,'f2820000-0000-4000-8000-000000000002') is null)::integer) as outside_public_helpers_closed;
reset role;
select 1/((select count(*)=6 from listings where id::text like 'f2820000-%')::integer) as region_scope_never_deletes_existing_records;
select 1/((not has_table_privilege('authenticated','gp_private.idf_departments','update') and not has_function_privilege('authenticated','public.gp_idf_publication_guard()','execute') and not has_function_privilege('anon','public.gp_idf_payload_allowed(jsonb,boolean)','execute'))::integer) as region_internal_bypasses_closed;
rollback;
