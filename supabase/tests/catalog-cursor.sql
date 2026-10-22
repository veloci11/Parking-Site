-- Rollback-only keyset test. Scene availability is checked separately by scene integration tests.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values('f7000000-0000-4000-8000-000000000001','{"name":"Vendeur pagination"}',now());
do $$declare i integer;lid uuid;value jsonb;begin for i in 1..6 loop
 lid=('f8000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
 value=jsonb_build_object('id',lid,'title','Annonce pagination '||i,'city','Paris','district','Pagination','commercialDetails',jsonb_build_object('postalCode','75012'),'coordinates','[2.3739,48.8446]'::jsonb,'locationPrecision','area','priceCents',i*100000,'spaces',jsonb_build_array(jsonb_build_object('areaM2',12)),'sceneAvailable',false,'isDemo',true);
 insert into listings(id,seller_id,draft,lifecycle_state,last_published,availability_confirmed_at,availability_expires_at) values(lid,'f7000000-0000-4000-8000-000000000001',value,'published',value,now(),now()+interval '90 days');
 insert into published_listings(id,payload,created_at) values(lid,value,clock_timestamp()-make_interval(mins=>i));end loop;end;$$;
set local role anon;
select gp_catalog_page('Pagination',null,null,null,'price_asc',null,2,false)->'nextPosition' as page_cursor \gset
reset role;
insert into listings(id,seller_id,draft,lifecycle_state,last_published,availability_confirmed_at,availability_expires_at)
select 'f8000000-0000-4000-8000-000000000099',seller_id,draft||'{"id":"f8000000-0000-4000-8000-000000000099","title":"Nouveau bien","priceCents":1}'::jsonb,'published',last_published||'{"id":"f8000000-0000-4000-8000-000000000099","title":"Nouveau bien","priceCents":1}'::jsonb,now(),now()+interval '90 days' from listings where id='f8000000-0000-4000-8000-000000000001';
insert into published_listings(id,payload,created_at) select id,gp_public_payload(last_published),clock_timestamp()+interval '1 second' from listings where id='f8000000-0000-4000-8000-000000000099';
set local role anon;
select 1/(((gp_catalog_page('Pagination',null,null,null,'price_asc',:'page_cursor'::jsonb,2,false)->'items'->0->>'id')='f8000000-0000-4000-8000-000000000003')::integer) as no_duplicate_after_insert;
select 1/(((gp_catalog_page('Pagination',null,null,null,'price_asc',:'page_cursor'::jsonb,2,false)->>'total')::integer=6)::integer) as creation_cutoff_preserved;
select gp_catalog_page('Pagination',null,null,null,'price_asc',:'page_cursor'::jsonb,2,false)->'nextPosition' as next_cursor \gset
select 1/(((gp_catalog_page('Pagination',null,null,null,'price_asc',:'next_cursor'::jsonb,2,false)->'items'->1->>'id')='f8000000-0000-4000-8000-000000000006')::integer) as no_missing_existing_listing;
select 1/(((gp_catalog_page('Pagination',null,null,null,'price_asc',:'next_cursor'::jsonb,2,false)->'nextPosition')='null'::jsonb)::integer) as final_cursor_null;
reset role;
rollback;
