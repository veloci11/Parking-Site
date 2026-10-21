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
do $$begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',null,null);raise exception 'Expected VERSION_CONFLICT';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);
select 1/((select payload->'spacePhotos' ? (id::text||':unit:1') and not(payload->'spacePhotos' ? 'f3000000-0000-4000-8000-000000000001') and not(payload?'address') and not(payload?'sellerId') and payload->>'sceneAvailable'='false' and payload->'coordinates'='[4.86,45.76]'::jsonb from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as public_privacy;

select 1/((select payload->'unitQuality' ? (id::text||':unit:1') and not(payload->'unitQuality' ? 'f3000000-0000-4000-8000-000000000001') and payload->'unitQuality'->(id::text||':unit:1')->>'floor'='Fissure visible' and payload->'unitQuality'->(id::text||':unit:1')->>'basis'='seller_observation' and payload->'quality'->>'basis'='unknown' from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as independent_quality_aliased;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('gp.qa_conversation',gp_contact('f2000000-0000-4000-8000-000000000001')::text,true);
select gp_message(current_setting('gp.qa_conversation')::uuid,'Historique à conserver après suspension','suspension-message-test');
do $$begin begin perform gp_suspend_publication('f2000000-0000-4000-8000-000000000001',4,'Motif de suspension documenté');raise exception 'Expected role refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
do $$begin begin perform gp_suspend_publication('f2000000-0000-4000-8000-000000000001',null,'Motif de suspension documenté');raise exception 'Expected version refusal';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;begin perform gp_suspend_publication('f2000000-0000-4000-8000-000000000001',4,null);raise exception 'Expected reason refusal';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;end;$$;
select gp_suspend_publication('f2000000-0000-4000-8000-000000000001',4,'Infiltration constatée, vérification requise');
select 1/((select lifecycle_state='suspended' and row_version=5 and last_published is null from listings where id='f2000000-0000-4000-8000-000000000001')::int) as suspended_versioned;
select 1/((select count(*)=0 from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as publication_hidden;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$begin begin perform gp_listing('f2000000-0000-4000-8000-000000000001','resume','{}',5);raise exception 'Expected resume refusal';exception when others then if sqlerrm<>'NOT_PUBLISHED' then raise;end if;end;begin perform gp_listing('f2000000-0000-4000-8000-000000000001','update','{"unitQuality":{"foreign":{"floor":"Inconnu"}}}',5);raise exception 'Expected foreign unit refusal';exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;end;$$;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"title":"Place après inspection complémentaire"}',5);
do $$begin begin perform gp_listing('f2000000-0000-4000-8000-000000000001','pause','{}',6);raise exception 'Expected pause bypass refusal';exception when others then if sqlerrm<>'NOT_PUBLISHED' then raise;end if;end;end;$$;
select gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',6);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select gp_moderate('f2000000-0000-4000-8000-000000000001','approve',7,null);
select 1/((select count(*)=1 from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as only_moderation_republishes;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select 1/((select count(*)=1 from messages where conversation_id=current_setting('gp.qa_conversation')::uuid)::int) as conversation_preserved;
reset role;
select 1/((select count(*)=1 from audit_events where action='moderation.suspend')::int) as suspension_audited;
select 1/((select count(*)=1 from notification_outbox where target_id='f2000000-0000-4000-8000-000000000001:5')::int) as seller_notified;
rollback;
