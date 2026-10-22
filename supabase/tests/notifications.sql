-- Destructive only within this rollback transaction. Use a dedicated development project.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','{"name":"Acheteur Test"}',now()),
 ('f1000000-0000-4000-8000-000000000002','{"name":"Vendeur Test"}',now()),
 ('f1000000-0000-4000-8000-000000000003','{"name":"Moderateur Test"}',now());
update public.app_roles set role='moderator' where user_id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select public.gp_listing('f2000000-0000-4000-8000-000000000001','create',jsonb_build_object(
'id','fake','slug','paris-test','title','Place privée de test','description',repeat('Description documentée de la place et de ses contraintes. ',3),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',1800000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Aucune expertise'),'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée','sceneAvailable',true,'isDemo',true,'status','published','version',999,'sellerName','Usurpation','createdAt',now(),'updatedAt',now()),null);
select 1/((select draft->>'sellerName'='Vendeur Test' and draft->>'isDemo'='false' and draft->>'status'='draft' and draft->>'id'=id::text from listings where id='f2000000-0000-4000-8000-000000000001')::int) as forced_metadata;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select id,'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000001/'||id||'.webp','image/webp' from unnest(array['f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003']::uuid[])id;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4000000-0000-4000-8000-000000000001","/api/media/f4000000-0000-4000-8000-000000000002","/api/media/f4000000-0000-4000-8000-000000000003"],"locationConfirmedAt":"2000-01-01T00:00:00Z"}',1);
select gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',2);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select 1/((select count(*)=0 from listings where id='f2000000-0000-4000-8000-000000000001')::int) as private_draft_rls;
do $$ begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);raise exception 'Expected FORBIDDEN';exception when others then if sqlerrm not in ('FORBIDDEN','MFA_OR_PERMISSION_REQUIRED') then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',null,null);raise exception 'Expected VERSION_CONFLICT';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
-- 019 fixture prerequisites for the unrelated publication-rule assertions below.
reset role;
insert into parking_sites(id,public_name,internal_reference) values('f1690000-0000-4000-8000-000000000001','Parking QA','Fixture historique');
insert into parking_levels(id,site_id,code,label,number,sort_order)
select gen_random_uuid(),'f1690000-0000-4000-8000-000000000001',value->>'level','Niveau QA',(value->>'level')::integer,(value->>'level')::integer from listings cross join lateral jsonb_array_elements(draft->'spaces') where listings.id='f2000000-0000-4000-8000-000000000001' group by value->>'level';
insert into parking_spaces(id,level_id,number,dimensions)
select (u.value->>'id')::uuid,l.id,u.value->>'number',jsonb_build_object('areaM2',u.value->'areaM2','lengthM',u.value->'lengthM','widthM',u.value->'widthM','clearanceM',u.value->'clearanceM') from listings cross join lateral jsonb_array_elements(draft->'spaces')u join parking_levels l on l.site_id='f1690000-0000-4000-8000-000000000001' and l.number=(u.value->>'level')::integer where listings.id='f2000000-0000-4000-8000-000000000001';
insert into registry_listing_units(listing_id,unit_id,space_id,signature) select listings.id,(u.value->>'id')::uuid,(u.value->>'id')::uuid,md5((draft->'spaces')::text) from listings cross join lateral jsonb_array_elements(draft->'spaces')u where listings.id='f2000000-0000-4000-8000-000000000001';
set local role authenticated;
select gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);
select 1/((select not(payload?'address') and not(payload?'sellerId') and payload->>'sceneAvailable'='false' and payload->'coordinates'='[2.37,48.84]'::jsonb from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as public_privacy;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('gp.qa_conversation',gp_contact('f2000000-0000-4000-8000-000000000001')::text,true);
select gp_message(current_setting('gp.qa_conversation')::uuid,'Bonjour pour une visite','idempotency-123');
select gp_message(current_setting('gp.qa_conversation')::uuid,'Bonjour pour une visite','idempotency-123');
select 1/((select count(*)=1 from messages where conversation_id=current_setting('gp.qa_conversation')::uuid)::int) as idempotent_messages;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select 1/(((gp_conversations()->0->>'unread')::integer=1)::integer) as unread_before_read;
select 1/((select count(*)>=2 from notifications where user_id=auth.uid())::integer) as private_inbox;
select gp_messages_read(current_setting('gp.qa_conversation')::uuid);
select 1/(((gp_conversations()->0->>'unread')::integer=0)::integer) as unread_after_read;
select 1/((select count(*)=0 from notifications where user_id=auth.uid() and read_at is null and url='/compte/messages/'||current_setting('gp.qa_conversation'))::integer) as inbox_marked_read;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select gp_visit(current_setting('gp.qa_conversation')::uuid,'visit-request-123',null);
do $$declare vid uuid;begin select id into vid from visit_requests limit 1;begin perform gp_visit_decision(vid,null,1,now()+interval '1 day');raise exception 'Expected VALIDATION_ERROR';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;begin perform gp_visit_decision(vid,'accept',1,now()+interval '1 day');raise exception 'Expected FORBIDDEN';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;end;$$;
select gp_conversations();
select gp_catalog('',null,2000000,12,'price_asc',0,24);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select 1/((select count(*)=0 from messages)::int) as moderator_no_message_access;
reset role;
update gp_private.configuration set value='true' where key='mfa_required';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"aal":"aal1","role":"authenticated"}',true);
select 1/((not gp_moderation_allowed())::integer) as mfa_blocks_aal1;
do $$begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',null,null);raise exception 'Expected MFA';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claims','{"aal":"aal2","role":"authenticated"}',true);
select 1/((gp_moderation_allowed())::integer) as mfa_accepts_aal2;
select 1/((not has_function_privilege('authenticated','public.gp_moderate_core(uuid,text,integer,text)','EXECUTE'))::integer) as no_core_bypass;
reset role;
rollback;
