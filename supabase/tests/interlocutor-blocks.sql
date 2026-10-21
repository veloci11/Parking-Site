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
'id','fake','slug','lyon-test','title','Place privée de test','description',repeat('Description documentée de la place et de ses contraintes. ',3),'city','Lyon','district','Test','priceCents',1800000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'unitQuality',jsonb_build_object('f3000000-0000-4000-8000-000000000001',jsonb_build_object('floor','Fissure visible','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Observation spécifique à cette place','observedAt','2026-01-01T00:00:00Z','basis','seller_observation')),'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Aucune expertise'),'locationPrecision','area','coordinates','[4.8597,45.7612]'::jsonb,'address','Adresse privée','sceneAvailable',true,'isDemo',true,'status','published','version',999,'sellerName','Usurpation','createdAt',now(),'updatedAt',now()),null);
select 1/((select draft->>'sellerName'='Vendeur Test' and draft->>'isDemo'='false' and draft->>'status'='draft' and draft->>'id'=id::text from listings where id='f2000000-0000-4000-8000-000000000001')::int) as forced_metadata;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select id,'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000001/'||id||'.webp','image/webp' from unnest(array['f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000004']::uuid[])id;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4000000-0000-4000-8000-000000000001","/api/media/f4000000-0000-4000-8000-000000000002","/api/media/f4000000-0000-4000-8000-000000000003"],"spacePhotos":{"f3000000-0000-4000-8000-000000000001":["/api/media/f4000000-0000-4000-8000-000000000004"]}}',1);
select gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',2);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select 1/((select count(*)=0 from listings where id='f2000000-0000-4000-8000-000000000001')::int) as private_draft_rls;
do $$ begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);raise exception 'Expected FORBIDDEN';exception when others then if sqlerrm not in ('FORBIDDEN','MFA_OR_PERMISSION_REQUIRED') then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',null,null);raise exception 'Expected VERSION_CONFLICT';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);
select 1/((select payload->'spacePhotos' ? (id::text||':unit:1') and not(payload->'spacePhotos' ? 'f3000000-0000-4000-8000-000000000001') and not(payload?'address') and not(payload?'sellerId') and payload->>'sceneAvailable'='false' and payload->'coordinates'='[4.86,45.76]'::jsonb from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as public_privacy;

select 1/((select payload->'unitQuality' ? (id::text||':unit:1') and not(payload->'unitQuality' ? 'f3000000-0000-4000-8000-000000000001') and payload->'unitQuality'->(id::text||':unit:1')->>'floor'='Fissure visible' and payload->'unitQuality'->(id::text||':unit:1')->>'basis'='seller_observation' and payload->'quality'->>'basis'='unknown' from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as independent_quality_aliased;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('gp.qa_conversation',gp_contact('f2000000-0000-4000-8000-000000000001')::text,true);
select gp_message(current_setting('gp.qa_conversation')::uuid,'Historique à conserver après suspension','suspension-message-test');

select gp_visit(current_setting('gp.qa_conversation')::uuid,'block-visit-test',null) as visit_created;
reset role;
-- Additional public fixtures for the same interlocutors, entirely rolled back.
insert into listings(id,seller_id,draft,lifecycle_state,row_version,last_published)
 select n.id,l.seller_id,l.draft||jsonb_build_object('id',n.id),'published',4,l.last_published||jsonb_build_object('id',n.id) from listings l cross join (values('f2000000-0000-4000-8000-000000000002'::uuid),('f2000000-0000-4000-8000-000000000003'::uuid))n(id) where l.id='f2000000-0000-4000-8000-000000000001';
insert into published_listings(id,payload)select id,gp_public_payload(last_published) from listings where id in('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000003');
insert into listings(id,seller_id,draft,lifecycle_state,row_version,last_published) select 'f2000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001',draft||'{"id":"f2000000-0000-4000-8000-000000000004"}'::jsonb,'published',4,last_published||'{"id":"f2000000-0000-4000-8000-000000000004"}'::jsonb from listings where id='f2000000-0000-4000-8000-000000000001';
insert into published_listings(id,payload) select id,gp_public_payload(last_published) from listings where id='f2000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('gp.qa_second',gp_contact('f2000000-0000-4000-8000-000000000002')::text,true);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select set_config('gp.qa_reverse',gp_contact('f2000000-0000-4000-8000-000000000004')::text,true);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select gp_set_conversation_block(current_setting('gp.qa_conversation')::uuid,true);
select 1/(((gp_conversation_block_state(current_setting('gp.qa_second')::uuid)->>'blockedByMe')::boolean)::integer) as second_thread_blocked;
select 1/(((gp_conversation_block_state(current_setting('gp.qa_reverse')::uuid)->>'blockedByMe')::boolean)::integer) as inverse_roles_blocked;
do $$begin
 begin perform gp_contact('f2000000-0000-4000-8000-000000000003');raise exception 'Expected contact block';exception when others then if sqlerrm<>'CONVERSATION_BLOCKED' then raise;end if;end;
 begin perform gp_message(current_setting('gp.qa_second')::uuid,'Contournement autre annonce','cross-thread-123');raise exception 'Expected cross thread block';exception when others then if sqlerrm<>'CONVERSATION_BLOCKED' then raise;end if;end;
 begin perform gp_visit(current_setting('gp.qa_second')::uuid,'cross-thread-visit',null);raise exception 'Expected cross thread visit block';exception when others then if sqlerrm<>'CONVERSATION_BLOCKED' then raise;end if;end;
 end;$$;
select gp_set_conversation_block(current_setting('gp.qa_second')::uuid,true);
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
select 1/((not(gp_conversation_block_state(current_setting('gp.qa_second')::uuid)->>'blocked')::boolean)::integer) as mutual_unblock_all_threads;
select 1/((not(gp_conversation_block_state(current_setting('gp.qa_reverse')::uuid)->>'blocked')::boolean)::integer) as mutual_unblock_reverse_roles;
select gp_message(current_setting('gp.qa_conversation')::uuid,'Message après déblocage','unblock-message-123');
reset role;
select 1/((not has_function_privilege('anon','public.gp_set_conversation_block(uuid,boolean)','execute') and not has_function_privilege('authenticated','public.gp_message_v8(uuid,text,text)','execute') and not has_function_privilege('authenticated','public.gp_conversation_send_guard(uuid)','execute'))::integer) as internal_functions_denied;
select 1/((not has_function_privilege('authenticated','public.gp_pair_blocked(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.gp_contact_v9(uuid)','execute'))::integer) as pair_internal_denied;
rollback;
