-- Destructive only within this rollback transaction. Use a dedicated development project.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','{"name":"Acheteur Test"}',now()),
 ('f1000000-0000-4000-8000-000000000002','{"name":"Vendeur Test"}',now()),
 ('f1000000-0000-4000-8000-000000000003','{"name":"Moderateur Test"}',now());
update public.app_roles set role='moderator' where user_id='f1000000-0000-4000-8000-000000000003';
update public.app_roles set role='admin' where user_id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
update profiles set seller_type='professional' where user_id='f1000000-0000-4000-8000-000000000002';
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

select 1/((select payload->>'sellerTypeSnapshot'='professional' from published_listings where id='f2000000-0000-4000-8000-000000000001')::integer) as server_snapshot;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
update profiles set seller_type='private' where user_id='f1000000-0000-4000-8000-000000000002';
select 1/((select payload->>'sellerTypeSnapshot'='professional' from published_listings where id='f2000000-0000-4000-8000-000000000001')::integer) as publication_snapshot_immutable;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('gp.qa_history',gp_contact('f2000000-0000-4000-8000-000000000001')::text,true);
do $$begin begin perform gp_admin_users();raise exception 'Expected admin refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
reset role;
insert into messages(id,conversation_id,sender_id,body,client_request_id,created_at) select ('fc000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,current_setting('gp.qa_history')::uuid,'f1000000-0000-4000-8000-000000000001','Private text never in audit','history-'||i,'2026-01-01T00:00:00Z'::timestamptz from generate_series(1,105)i;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select 1/((jsonb_array_length(gp_messages_page(current_setting('gp.qa_history')::uuid,null,100)->'items')=101)::integer) as history_bounded_lookahead;
select 1/((jsonb_array_length(gp_messages_page(current_setting('gp.qa_history')::uuid,'{"id":"fc000000-0000-4000-8000-000000000006","createdAt":"2026-01-01T00:00:00Z"}',100)->'items')=5)::integer) as remaining_ties_without_loss;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select 1/((not exists(select 1 from jsonb_array_elements(gp_admin_users()) where value ? 'email'))::integer) as admin_roster_no_email;
do $$begin begin perform gp_messages_page(current_setting('gp.qa_history')::uuid,null,100);raise exception 'Expected nonparticipant refusal';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;begin perform gp_admin_user_decision('f1000000-0000-4000-8000-000000000003',1,'Auto changement interdit',null,'member');raise exception 'Expected self refusal';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;begin perform gp_admin_user_decision('f1000000-0000-4000-8000-000000000002',null,'Version manquante refusée','suspended',null);raise exception 'Expected version refusal';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select gp_admin_user_decision('f1000000-0000-4000-8000-000000000002',1,'Suspension pour vérification','suspended',null);
select 1/((select count(*)=0 from published_listings where id='f2000000-0000-4000-8000-000000000001')::integer) as suspended_publications_hidden;
select gp_admin_user_decision('f1000000-0000-4000-8000-000000000002',2,'Réactivation après vérification','active',null);
select 1/((select count(*)=0 from published_listings where id='f2000000-0000-4000-8000-000000000001')::integer) as reactivation_not_publication;
select 1/((not exists(select 1 from jsonb_array_elements(gp_admin_audit_page(null,100)->'items') where value ? 'detail' or value ? 'body'))::integer) as journal_sanitized;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select 1/((jsonb_array_length(gp_messages_page(current_setting('gp.qa_history')::uuid,null,100)->'items')=101)::integer) as history_preserved;
reset role;
select 1/((not has_function_privilege('authenticated','public.gp_listing_v11(uuid,text,jsonb,integer)','execute') and not has_function_privilege('anon','public.gp_admin_users()','execute'))::integer) as privileged_functions_closed;
rollback;
