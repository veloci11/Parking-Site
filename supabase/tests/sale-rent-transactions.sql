-- 024: isolated sale/monthly-rent RPC fixtures. No Auth network call, email or payments.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f2410000-0000-4000-8000-000000000001','{"name":"Transactions Seller"}',now()),
('f2410000-0000-4000-8000-000000000002','{"name":"Transactions Admin"}',now());
update app_roles set role='admin' where user_id='f2410000-0000-4000-8000-000000000002';
insert into entitlement_overrides(user_id,limits,starts_at,expires_at,reason,updated_by) values('f2410000-0000-4000-8000-000000000001','{"activeListings":10,"draftsPerDay":10,"submissionsPerDay":20}',now(),now()+interval '1 day','Prerequis de la recette transactionnelle.','f2410000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','f2410000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2410000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$declare n integer;p jsonb;listing_key uuid;begin
 for n in 1..3 loop
 listing_key=('f2420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 p=jsonb_build_object('slug','transaction-qa','title','Offre de parking de recette','description',repeat('Description factuelle de la place et de ses contraintes. ',4),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',case n when 1 then 2000000 when 2 then 15000 else 22000 end,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f2430000-0000-4000-8000-'||lpad(n::text,12,'0'),'number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":"Aucune expertise"}'::jsonb,'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée','sceneAvailable',false,'isDemo',false,'status','draft','version',1,'sellerName','QA','createdAt',now(),'updatedAt',now());
 if n>1 then p=p||'{"transactionType":"rent"}';end if;
 perform gp_listing(listing_key,'create',p,null);
 end loop;end;$$;
select 1/((select draft->>'transactionType'='sale' from listings where id='f2420000-0000-4000-8000-000000000001')::integer) as omitted_transaction_is_sale;
select 1/((select draft->>'transactionType'='rent' and draft->>'priceCents'='15000' from listings where id='f2420000-0000-4000-8000-000000000002')::integer) as rent_is_monthly_lot_cents;
do $$begin
 begin perform gp_listing('f2420000-0000-4000-8000-000000000002','update','{"transactionType":"both"}',1);raise exception 'Expected exclusive transaction';exception when others then if sqlerrm<>'TRANSACTION_TYPE_INVALID' then raise;end if;end;
 begin perform gp_listing('f2420000-0000-4000-8000-000000000002','update','{"transactionType":null}',1);raise exception 'Expected non-null transaction';exception when others then if sqlerrm<>'TRANSACTION_TYPE_INVALID' then raise;end if;end;
end;$$;
reset role;
insert into media_assets(id,owner_id,listing_id,object_key,mime)
select ('f2440000-0000-4000-8000-'||lpad((n*10+m)::text,12,'0'))::uuid,'f2410000-0000-4000-8000-000000000001',('f2420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f2410000-0000-4000-8000-000000000001/f2420000-0000-4000-8000-'||lpad(n::text,12,'0')||'/f2440000-0000-4000-8000-'||lpad((n*10+m)::text,12,'0')||'.webp','image/webp' from generate_series(1,3)n cross join generate_series(1,3)m;
set local role authenticated;
do $$declare n integer;listing_key uuid;begin
 for n in 1..3 loop
 listing_key=('f2420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 perform gp_listing(listing_key,'update',jsonb_build_object('photos',(select jsonb_agg('/api/media/'||a.id order by a.id) from media_assets a where a.listing_id=listing_key)),1);
 perform gp_listing(listing_key,'update','{"locationConfirmedAt":"2000-01-01T00:00:00Z"}',2);
 perform gp_listing(listing_key,'submit','{"ownershipAttested":true}',3);
 end loop;end;$$;
select 1/((select payload->>'transactionType'='rent' from listing_revisions where listing_id='f2420000-0000-4000-8000-000000000002' and revision_no=4)::integer) as submitted_revision_keeps_transaction;
reset role;
insert into parking_sites(id,public_name,internal_reference) values('f2450000-0000-4000-8000-000000000001','Parking QA','Transactions fixture');
insert into parking_levels(id,site_id,code,label,number) values('f2450000-0000-4000-8000-000000000002','f2450000-0000-4000-8000-000000000001','SS1','Sous-sol',-1);
insert into parking_spaces(id,level_id,number,dimensions) select ('f2450000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,'f2450000-0000-4000-8000-000000000002','12','{"areaM2":12,"lengthM":5,"widthM":2.4,"clearanceM":2.1}' from generate_series(1,3)n;
insert into registry_listing_units(listing_id,unit_id,space_id,signature) select ('f2420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f2430000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f2450000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,md5((l.draft->'spaces')::text) from generate_series(1,3)n join listings l on l.id=('f2420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2410000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2410000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select gp_moderate(('f2420000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approve',4) from generate_series(1,3)n;
set local role anon;
select 1/((gp_catalog_page_v2('{"ids":["f2420000-0000-4000-8000-000000000001","f2420000-0000-4000-8000-000000000002","f2420000-0000-4000-8000-000000000003"]}',null,1)->>'total'='1')::integer) as default_catalog_is_sale_only;
select 1/((gp_catalog_page_v2('{"ids":["f2420000-0000-4000-8000-000000000001","f2420000-0000-4000-8000-000000000002","f2420000-0000-4000-8000-000000000003"],"transactionType":"rent","sort":"price_asc"}',null,1)->>'total'='2')::integer) as rent_filter_counts_before_limit;
select set_config('gp.qa.rent_page',gp_catalog_page_v2('{"ids":["f2420000-0000-4000-8000-000000000001","f2420000-0000-4000-8000-000000000002","f2420000-0000-4000-8000-000000000003"],"transactionType":"rent","sort":"price_asc"}',null,1)::text,true);
select 1/(((current_setting('gp.qa.rent_page')::jsonb)->'items'->0->>'transactionType'='rent' and (current_setting('gp.qa.rent_page')::jsonb)->'items'->0->>'priceCents'='15000')::integer) as public_rent_price_keeps_monthly_units;
select 1/((gp_catalog_page_v2('{"ids":["f2420000-0000-4000-8000-000000000001","f2420000-0000-4000-8000-000000000002","f2420000-0000-4000-8000-000000000003"],"transactionType":"rent","sort":"price_asc"}',(current_setting('gp.qa.rent_page')::jsonb)->'nextPosition',1)->'items'->0->>'id'='f2420000-0000-4000-8000-000000000003')::integer) as rent_keyset_keeps_remaining_rent;
do $$begin begin perform gp_catalog_page_v2('{"transactionType":"all"}',null,1);raise exception 'Expected exclusive filter';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2410000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2410000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select gp_listing('f2420000-0000-4000-8000-000000000002','update','{"transactionType":"sale","priceCents":2200000}',5);
select 1/((gp_listing_preview('f2420000-0000-4000-8000-000000000002')->>'transactionType'='sale' and gp_listing_preview('f2420000-0000-4000-8000-000000000002')->>'priceCents'='2200000')::integer) as seller_preview_has_new_sale_draft;
select 1/((select payload->>'transactionType'='rent' and payload->>'priceCents'='15000' from published_listings where id='f2420000-0000-4000-8000-000000000002')::integer) as changing_transaction_never_rewrites_published_offer;
reset role;
select 1/((not has_function_privilege('authenticated','public.gp_listing_before_transactions(uuid,text,jsonb,integer)','execute') and not has_function_privilege('authenticated','public.gp_validate_draft_before_transactions(jsonb,uuid,boolean)','execute') and not has_function_privilege('anon','public.gp_public_payload_before_transactions(jsonb)','execute'))::integer) as transaction_core_bypasses_closed;
rollback;
