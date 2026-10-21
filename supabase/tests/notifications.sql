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
'id','fake','slug','lyon-test','title','Place privée de test','description',repeat('Description documentée de la place et de ses contraintes. ',3),'city','Lyon','district','Test','priceCents',1800000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Aucune expertise'),'locationPrecision','area','coordinates','[4.8597,45.7612]'::jsonb,'address','Adresse privée','sceneAvailable',true,'isDemo',true,'status','published','version',999,'sellerName','Usurpation','createdAt',now(),'updatedAt',now()),null);
select 1/((select draft->>'sellerName'='Vendeur Test' and draft->>'isDemo'='false' and draft->>'status'='draft' and draft->>'id'=id::text from listings where id='f2000000-0000-4000-8000-000000000001')::int) as forced_metadata;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select id,'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000001/'||id||'.webp','image/webp' from unnest(array['f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003']::uuid[])id;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4000000-0000-4000-8000-000000000001","/api/media/f4000000-0000-4000-8000-000000000002","/api/media/f4000000-0000-4000-8000-000000000003"]}',1);
select gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',2);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select 1/((select count(*)=0 from listings where id='f2000000-0000-4000-8000-000000000001')::int) as private_draft_rls;
do $$ begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);raise exception 'Expected FORBIDDEN';exception when others then if sqlerrm not in ('FORBIDDEN','MFA_OR_PERMISSION_REQUIRED') then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_moderate('f2000000-0000-4000-8000-000000000001','approve',null,null);raise exception 'Expected VERSION_CONFLICT';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select gp_moderate('f2000000-0000-4000-8000-000000000001','approve',3,null);
select 1/((select not(payload?'address') and not(payload?'sellerId') and payload->>'sceneAvailable'='false' and payload->'coordinates'='[4.86,45.76]'::jsonb from published_listings where id='f2000000-0000-4000-8000-000000000001')::int) as public_privacy;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select gp_contact('f2000000-0000-4000-8000-000000000001') as conversation_id \gset
select gp_message(:'conversation_id','Bonjour pour une visite','idempotency-123');
select gp_message(:'conversation_id','Bonjour pour une visite','idempotency-123');
select 1/((select count(*)=1 from messages where conversation_id=:'conversation_id')::int) as idempotent_messages;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select 1/(((gp_conversations()->0->>'unread')::integer=1)::integer) as unread_before_read;
select 1/((select count(*)>=2 from notifications where user_id=auth.uid())::integer) as private_inbox;
select gp_messages_read(:'conversation_id');
select 1/(((gp_conversations()->0->>'unread')::integer=0)::integer) as unread_after_read;
select 1/((select count(*)=0 from notifications where user_id=auth.uid() and read_at is null and url='/compte/messages/'||:'conversation_id')::integer) as inbox_marked_read;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select gp_visit(:'conversation_id','visit-request-123',null);
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
