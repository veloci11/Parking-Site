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
'id','fake','slug','paris-test','title','Place privée de test','description',repeat('Description documentée de la place et de ses contraintes. ',3),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',1800000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'unitQuality',jsonb_build_object('f3000000-0000-4000-8000-000000000001',jsonb_build_object('floor','Fissure visible','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Observation spécifique à cette place','observedAt','2026-01-01T00:00:00Z','basis','seller_observation')),'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Aucune expertise'),'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée','sceneAvailable',true,'isDemo',true,'status','published','version',999,'sellerName','Usurpation','createdAt',now(),'updatedAt',now()),null);
select 1/((select draft->>'sellerName'='Vendeur Test' and draft->>'isDemo'='false' and draft->>'status'='draft' and draft->>'id'=id::text from listings where id='f2000000-0000-4000-8000-000000000001')::int) as forced_metadata;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select id,'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000001/'||id||'.webp','image/webp' from unnest(array['f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000004']::uuid[])id;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4000000-0000-4000-8000-000000000001","/api/media/f4000000-0000-4000-8000-000000000002","/api/media/f4000000-0000-4000-8000-000000000003"],"spacePhotos":{"f3000000-0000-4000-8000-000000000001":["/api/media/f4000000-0000-4000-8000-000000000004"]},"locationConfirmedAt":"2000-01-01T00:00:00Z"}',1);
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
select 1/((select payload->'spacePhotos' ? (id::text||':unit:1') and not(payload->'spacePhotos' ? 'f3000000-0000-4000-8000-000000000001') and not(payload?'address') and not(payload?'sellerId') and payload->>'sceneAvailable'='false' and payload->'coordinates'='[2.37,48.84]'::jsonb from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as public_privacy;

select 1/((select payload->'unitQuality' ? (id::text||':unit:1') and not(payload->'unitQuality' ? 'f3000000-0000-4000-8000-000000000001') and payload->'unitQuality'->(id::text||':unit:1')->>'floor'='Fissure visible' and payload->'unitQuality'->(id::text||':unit:1')->>'basis'='seller_observation' and payload->'quality'->>'basis'='unknown' from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as independent_quality_aliased;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('gp.qa_conversation',gp_contact('f2000000-0000-4000-8000-000000000001')::text,true);
select gp_message(current_setting('gp.qa_conversation')::uuid,'Historique à conserver après suspension','suspension-message-test');

select gp_visit(current_setting('gp.qa_conversation')::uuid,'block-visit-test',null) as visit_created;
select gp_set_conversation_block(current_setting('gp.qa_conversation')::uuid,true);
select 1/((select (value->>'blocked')::boolean and (value->>'blockedByMe')::boolean from jsonb_array_elements(gp_conversations()) where (value->>'id')::uuid=current_setting('gp.qa_conversation')::uuid)::integer) as buyer_block_persisted;
do $$begin begin perform gp_message(current_setting('gp.qa_conversation')::uuid,'Message interdit','block-message-123');raise exception 'Expected block';exception when others then if sqlerrm<>'CONVERSATION_BLOCKED' then raise;end if;end;begin perform gp_visit(current_setting('gp.qa_conversation')::uuid,'blocked-visit-123',null);raise exception 'Expected block';exception when others then if sqlerrm<>'CONVERSATION_BLOCKED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_set_conversation_block(current_setting('gp.qa_conversation')::uuid,false);raise exception 'Expected third party refusal';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;begin perform gp_conversation_block_state(current_setting('gp.qa_conversation')::uuid);raise exception 'Expected third party read refusal';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;end;$$;
select 1/((select count(*)=0 from conversation_blocks)::integer) as no_moderator_block_access;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select 1/((not(gp_conversation_block_state(current_setting('gp.qa_conversation')::uuid)->>'blockedByMe')::boolean and (gp_conversation_block_state(current_setting('gp.qa_conversation')::uuid)->>'blocked')::boolean)::integer) as seller_only_aggregate;
select gp_set_conversation_block(current_setting('gp.qa_conversation')::uuid,true);
do $$begin begin perform gp_message(current_setting('gp.qa_conversation')::uuid,'Message vendeur interdit','block-message-seller123');raise exception 'Expected block';exception when others then if sqlerrm<>'CONVERSATION_BLOCKED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select gp_set_conversation_block(current_setting('gp.qa_conversation')::uuid,false);
select 1/(((gp_conversation_block_state(current_setting('gp.qa_conversation')::uuid)->>'blocked')::boolean)::integer) as other_participant_block_remains;
select gp_visit_decision((select id from visit_requests where conversation_id=current_setting('gp.qa_conversation')::uuid),'cancel',1,null);
select 1/((select count(*)=1 from messages where conversation_id=current_setting('gp.qa_conversation')::uuid)::integer) as history_preserved;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select gp_set_conversation_block(current_setting('gp.qa_conversation')::uuid,false);
select 1/((not(gp_conversation_block_state(current_setting('gp.qa_conversation')::uuid)->>'blocked')::boolean)::integer) as mutual_unblock;
select gp_message(current_setting('gp.qa_conversation')::uuid,'Message après déblocage','unblock-message-123');
reset role;
select 1/((not has_function_privilege('anon','public.gp_set_conversation_block(uuid,boolean)','execute') and not has_function_privilege('authenticated','public.gp_message_v8(uuid,text,text)','execute') and not has_function_privilege('authenticated','public.gp_conversation_send_guard(uuid)','execute'))::integer) as internal_functions_denied;
rollback;
