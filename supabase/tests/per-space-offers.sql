-- 030 synthetic RPC/public-catalog fixtures only; no Auth network, real email or payments.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f3010000-0000-4000-8000-000000000001','{"name":"Per-space seller QA"}',now()),
('f3010000-0000-4000-8000-000000000002','{"name":"Per-space admin QA"}',now());
update app_roles set role='admin' where user_id='f3010000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f3010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f3010000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$declare n integer;j integer;p jsonb;spaces jsonb;s jsonb;listing_key uuid;begin
 for n in 1..3 loop
 listing_key=('f3020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;spaces='[]';
 for j in 1..(case when n=1 then 5 else 1 end) loop
 s=jsonb_build_object('id','f3030000-0000-4000-8000-'||lpad((n*10+j)::text,12,'0'),'number',(11+j)::text,'level',case when j in(3,5) or n=2 then -2 else -1 end,'areaM2',case when n=2 then 14 when j=5 then 20 when j=4 then 11 when j=3 then 16 when j=2 then 15 else 12 end,'lengthM',5,'widthM',2.4,'clearanceM',2.1);
 if n<3 then s=s||jsonb_build_object('offer',jsonb_build_object('transactionType',case when n=2 or j>=4 then 'rent' else 'sale' end,'priceCents',case when n=2 then 20000 when j=1 then 3000000 when j=2 then 2000000 when j=3 then 4000000 when j=4 then 10000 else 15000 end,'status',case when j=2 then 'reserved' else 'available' end));end if;spaces=spaces||jsonb_build_array(s);end loop;
 p=jsonb_build_object('slug','per-space-qa','title','Offres par place de recette','description',repeat('Description factuelle des places et de leurs contraintes. ',4),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',case when n=3 then 22000 else 999999999 end,'transactionType','rent','type','covered','spaces',spaces,'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":"Aucune expertise"}'::jsonb,'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée','sceneAvailable',false,'isDemo',false,'status','draft','version',1,'sellerName','QA','createdAt',now(),'updatedAt',now());
 if n<3 then p=p||'{"pricingMode":"per_space"}';end if;
 perform gp_listing(listing_key,'create',p,null);end loop;end;$$;
select 1/((select draft->>'pricingMode'='per_space' and draft->>'transactionType'='sale' and draft->>'priceCents'='3000000' and jsonb_array_length(draft->'spaces')=5 from listings where id='f3020000-0000-4000-8000-000000000001')::integer) as five_offers_never_sum_sale_and_monthly_rent;
select 1/((select draft->>'transactionType'='rent' and draft->>'priceCents'='22000' and not(draft ? 'pricingMode') from listings where id='f3020000-0000-4000-8000-000000000003')::integer) as legacy_whole_lot_rent_preserved;
do $$declare base jsonb=(select draft from listings where id='f3020000-0000-4000-8000-000000000001');patch jsonb;begin
 foreach patch in array array['{"pricingMode":null}'::jsonb,'{"catalogMatch":{"priceCents":1}}'::jsonb,jsonb_build_object('spaces',jsonb_set(base->'spaces','{0,offer,status}','"rented"')),jsonb_build_object('spaces',jsonb_set(base->'spaces','{0,offer,role}','"admin"')),jsonb_build_object('spaces',jsonb_set(base->'spaces','{0,offer,priceCents}','null')),'{"pricingMode":"lot"}'::jsonb] loop
 begin perform gp_listing('f3020000-0000-4000-8000-000000000001','update',patch,1);raise exception 'Expected strict offer refusal';exception when others then if sqlerrm<>'OFFER_INVALID' then raise;end if;end;end loop;
 begin perform gp_listing('f3020000-0000-4000-8000-000000000001','update','{"transactionType":"both"}',1);raise exception 'Expected invalid global type refusal';exception when others then if sqlerrm<>'TRANSACTION_TYPE_INVALID' then raise;end if;end;
 end;$$;
reset role;
insert into media_assets(id,owner_id,listing_id,object_key,mime)
select ('f3040000-0000-4000-8000-'||lpad((n*10+m)::text,12,'0'))::uuid,'f3010000-0000-4000-8000-000000000001',('f3020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f3010000-0000-4000-8000-000000000001/f3020000-0000-4000-8000-'||lpad(n::text,12,'0')||'/f3040000-0000-4000-8000-'||lpad((n*10+m)::text,12,'0')||'.webp','image/webp' from generate_series(1,3)n cross join generate_series(1,3)m;
set local role authenticated;
do $$declare n integer;listing_key uuid;begin for n in 1..3 loop
 listing_key=('f3020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 perform gp_listing(listing_key,'update',jsonb_build_object('photos',(select jsonb_agg('/api/media/'||a.id order by a.id) from media_assets a where a.listing_id=listing_key)),1);
 perform gp_listing(listing_key,'update','{"locationConfirmedAt":"2000-01-01T00:00:00Z"}',2);
 perform gp_listing(listing_key,'submit','{"ownershipAttested":true}',3);end loop;end;$$;
select 1/((select payload->'spaces'->4->'offer'='{"transactionType":"rent","priceCents":15000,"status":"available"}'::jsonb from listing_revisions where listing_id='f3020000-0000-4000-8000-000000000001' and revision_no=4)::integer) as submitted_revision_keeps_exact_unit_offers;
reset role;
insert into parking_sites(id,public_name,internal_reference) values('f3050000-0000-4000-8000-000000000001','Parking QA','Per-space fixture');
insert into parking_levels(id,site_id,code,label,number) values
('f3050000-0000-4000-8000-000000000002','f3050000-0000-4000-8000-000000000001','SS1','Sous-sol1',-1),
('f3050000-0000-4000-8000-000000000003','f3050000-0000-4000-8000-000000000001','SS2','Sous-sol2',-2);
insert into parking_spaces(id,level_id,number,dimensions)
select (s->>'id')::uuid,case when s->>'level'='-1' then 'f3050000-0000-4000-8000-000000000002' else 'f3050000-0000-4000-8000-000000000003' end::uuid,s->>'number',jsonb_build_object('areaM2',s->'areaM2','lengthM',s->'lengthM','widthM',s->'widthM','clearanceM',s->'clearanceM') from listings l cross join lateral jsonb_array_elements(l.draft->'spaces')s where l.id::text like 'f3020000-%';
insert into registry_listing_units(listing_id,unit_id,space_id,signature) select l.id,(s->>'id')::uuid,(s->>'id')::uuid,md5((gp_offers_core(l.draft)->'spaces')::text) from listings l cross join lateral jsonb_array_elements(l.draft->'spaces')s where l.id::text like 'f3020000-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','f3010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f3010000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select gp_moderate(('f3020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approve',4) from generate_series(1,3)n;
set local role anon;
select 1/((select payload->>'pricingMode'='per_space' and payload->'spaces'->4->>'id'='f3020000-0000-4000-8000-000000000001:unit:5' and payload->'spaces'->4->'offer'->>'priceCents'='15000' and payload::text not like '%f3030000-%' and not(payload ? 'catalogMatch') from published_listings where id='f3020000-0000-4000-8000-000000000001')::integer) as public_aliases_keep_offers_without_private_ids_or_catalog_state;
select 1/((gp_catalog_page_v2('{"ids":["f3020000-0000-4000-8000-000000000001"],"transactionType":"rent","maxPrice":12000,"minArea":15}',null,1)->>'total'='0')::integer) as budget_and_area_require_the_same_place;
select 1/((gp_catalog_page_v2('{"ids":["f3020000-0000-4000-8000-000000000001"],"transactionType":"sale","maxPrice":2500000}',null,1)->>'total'='0')::integer) as reserved_offer_never_satisfies_budget;
select 1/((gp_catalog_page_v2('{"ids":["f3020000-0000-4000-8000-000000000001"],"transactionType":"rent","minPrice":12000,"minArea":15,"level":-2}',null,1)->'items'->0->'catalogMatch'='{"transactionType":"rent","priceCents":15000,"spaceIds":["f3020000-0000-4000-8000-000000000001:unit:5"]}'::jsonb)::integer) as contextual_price_and_alias_belong_to_matching_offer;
select set_config('gp.qa.offers_page',gp_catalog_page_v2('{"ids":["f3020000-0000-4000-8000-000000000001","f3020000-0000-4000-8000-000000000002","f3020000-0000-4000-8000-000000000003"],"transactionType":"rent","sort":"price_asc"}',null,1)::text,true);
select 1/(((current_setting('gp.qa.offers_page')::jsonb)->>'total'='3' and (current_setting('gp.qa.offers_page')::jsonb)->'items'->0->'catalogMatch'->>'priceCents'='10000' and jsonb_array_length((current_setting('gp.qa.offers_page')::jsonb)->'items')=1)::integer) as unique_listing_count_and_matching_price_before_limit;
select 1/((gp_catalog_page_v2('{"ids":["f3020000-0000-4000-8000-000000000001","f3020000-0000-4000-8000-000000000002","f3020000-0000-4000-8000-000000000003"],"transactionType":"rent","sort":"price_asc"}',current_setting('gp.qa.offers_page')::jsonb->'nextPosition',1)->'items'->0->>'id'='f3020000-0000-4000-8000-000000000002')::integer) as keyset_continues_by_filtered_offer_price;
set local role authenticated;
select set_config('request.jwt.claim.sub','f3010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f3010000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select gp_listing('f3020000-0000-4000-8000-000000000001','update',jsonb_build_object('spaces',(select jsonb_set(draft->'spaces','{0,offer,status}','"sold"') from listings where id='f3020000-0000-4000-8000-000000000001'),'priceCents',1,'transactionType','rent'),5);
select 1/((gp_listing_preview('f3020000-0000-4000-8000-000000000001')->>'priceCents'='4000000' and (select payload->'spaces'->0->'offer'->>'status'='available' from published_listings where id='f3020000-0000-4000-8000-000000000001'))::integer) as editing_offer_never_changes_published_snapshot;
do $$begin
 begin perform gp_listing('f3020000-0000-4000-8000-000000000001','update','{}',5);raise exception 'Expected optimistic version';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 begin perform gp_listing('f3020000-0000-4000-8000-000000000001','update',jsonb_build_object('spaces',(select jsonb_agg(jsonb_set(s,'{offer,status}','"withdrawn"')) from listings l cross join lateral jsonb_array_elements(l.draft->'spaces')s where l.id='f3020000-0000-4000-8000-000000000001')),6);perform gp_listing('f3020000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',7);raise exception 'Expected at least one available offer';exception when others then if sqlerrm<>'OFFER_INVALID' then raise;end if;end;
 end;$$;
select gp_listing('f3020000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',6);
select set_config('request.jwt.claim.sub','f3010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f3010000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select gp_moderate('f3020000-0000-4000-8000-000000000001','approve',7);
reset role;
select 1/((select count(*)=5 and bool_and(unit_id=space_id) from registry_listing_units where listing_id='f3020000-0000-4000-8000-000000000001')::integer) as commercial_revision_reuses_administered_physical_links;
set local role anon;
select 1/((gp_catalog_page_v2('{"ids":["f3020000-0000-4000-8000-000000000001"],"transactionType":"sale","maxPrice":3500000}',null,1)->>'total'='0' and (select payload->'spaces'->0->'offer'->>'status'='sold' from published_listings where id='f3020000-0000-4000-8000-000000000001'))::integer) as only_moderation_publishes_status_and_recomputes_catalog;
set local role authenticated;
select set_config('request.jwt.claim.sub','f3010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f3010000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select gp_listing('f3020000-0000-4000-8000-000000000001','update',jsonb_build_object('spaces',(select jsonb_set(draft->'spaces','{0,widthM}','2.5') from listings where id='f3020000-0000-4000-8000-000000000001')),8);
select gp_listing('f3020000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',9);
select set_config('request.jwt.claim.sub','f3010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f3010000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_moderate('f3020000-0000-4000-8000-000000000001','approve',10);raise exception 'Expected new physical mapping for dimensions';exception when others then if sqlerrm<>'REGISTRY_LINK_REQUIRED' then raise;end if;end;end;$$;
select 1/((select payload->'spaces'->0->>'widthM'='2.4' from published_listings where id='f3020000-0000-4000-8000-000000000001')::integer) as geometric_change_still_requires_administered_mapping;
reset role;
select 1/((not has_function_privilege('authenticated','public.gp_listing_before_offers(uuid,text,jsonb,integer)','execute') and not has_function_privilege('authenticated','public.gp_validate_draft_before_offers(jsonb,uuid,boolean)','execute') and not has_function_privilege('anon','public.gp_public_payload_before_offers(jsonb)','execute') and not has_function_privilege('authenticated','public.gp_offers_restore(jsonb,jsonb)','execute') and not has_function_privilege('anon','public.gp_offers_core(jsonb)','execute'))::integer) as per_space_offers_internal_bypasses_closed;
rollback;
