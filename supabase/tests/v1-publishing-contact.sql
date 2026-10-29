-- F05/F06/F17/F19: exercise publication/contact RPCs with distinct database roles.
-- SQL-only fixture metadata: no Auth network, Storage bytes, email or remote worker.
-- Every fixture, entitlement override and RPC mutation is rolled back.
begin;

insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
 ('f4910000-0000-4000-8000-000000000001','{"name":"V1 Seller","sellerType":"private"}',now()),
 ('f4910000-0000-4000-8000-000000000002','{"name":"V1 Buyer"}',now()),
 ('f4910000-0000-4000-8000-000000000003','{"name":"V1 Moderator"}',now()),
 ('f4910000-0000-4000-8000-000000000004','{"name":"V1 Admin"}',now()),
 ('f4910000-0000-4000-8000-000000000005','{"name":"V1 Outsider"}',now());
update app_roles set role='moderator' where user_id='f4910000-0000-4000-8000-000000000003';
update app_roles set role='admin' where user_id='f4910000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
-- A one-slot override makes the quota boundary explicit without artificial pending rows.
select gp_entitlement_command(jsonb_build_object(
 'action','set_user_override','userId','f4910000-0000-4000-8000-000000000001',
 'version',0,'limits','{"activeListings":1}'::jsonb,
 'expiresAt',now()+interval '1 day','reason','One-slot quota for rollback-only V1 acceptance.'));

select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select gp_listing('f4920000-0000-4000-8000-000000000001','create',jsonb_build_object(
 'slug','v1-publication-test','title','Place couverte de recette V1',
 'description',repeat('Description documentée de la place et de ses contraintes. ',3),
 'city','Paris','district','Recette','priceCents',3100000,'type','covered',
 'commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,
 'spaces',jsonb_build_array(jsonb_build_object('id','f4930000-0000-4000-8000-000000000001','number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),
 'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":"Aucune expertise"}'::jsonb,
 'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée de recette'),null);
insert into media_assets(id,owner_id,listing_id,object_key,mime) values
 ('f4940000-0000-4000-8000-000000000001','f4910000-0000-4000-8000-000000000001','f4920000-0000-4000-8000-000000000001','f4910000-0000-4000-8000-000000000001/f4920000-0000-4000-8000-000000000001/f4940000-0000-4000-8000-000000000001.webp','image/webp');
select gp_listing('f4920000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4940000-0000-4000-8000-000000000001"],"locationConfirmedAt":"2000-01-01T00:00:00Z"}',1);
select gp_listing('f4920000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',2);

-- A seller cannot decide their own pending revision.
do $$begin
 begin
  perform gp_moderate('f4920000-0000-4000-8000-000000000001','approve',3,null);
  raise exception 'Expected member moderation refusal';
 exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
end;$$;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin
 begin
  perform gp_moderate('f4920000-0000-4000-8000-000000000001','changes_requested',3,null);
  raise exception 'Expected correction reason requirement';
 exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
end;$$;
select gp_moderate('f4920000-0000-4000-8000-000000000001','changes_requested',3,'Précisez les contraintes de manoeuvre.');

select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/coalesce((select lifecycle_state='changes_requested' and row_version=4 and draft->>'rejectionReason'='Précisez les contraintes de manoeuvre.' from listings where id='f4920000-0000-4000-8000-000000000001')::integer,0) as seller_reads_correction_reason;
select 1/coalesce((select state='changes_requested' and reason='Précisez les contraintes de manoeuvre.' and actor_id='f4910000-0000-4000-8000-000000000003' from listing_revisions where listing_id='f4920000-0000-4000-8000-000000000001' and revision_no=3)::integer,0) as correction_keeps_original_revision;
select 1/((select count(*)=0 from published_listings where id='f4920000-0000-4000-8000-000000000001')::integer) as correction_does_not_publish;
select gp_listing('f4920000-0000-4000-8000-000000000001','update',jsonb_build_object('description',repeat('Manoeuvre nécessitant une marche arrière ; contraintes décrites pour la recette. ',3)),4);
select gp_listing('f4920000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',5);
select 1/((select count(*)=2 from listing_revisions where listing_id='f4920000-0000-4000-8000-000000000001')::integer) as resubmission_appends_history;

-- Physical registry prerequisite, following the existing SQL publication fixtures.
reset role;
insert into parking_sites(id,public_name,internal_reference) values('f4950000-0000-4000-8000-000000000001','Parking V1 QA','Rollback publication fixture');
insert into parking_levels(id,site_id,code,label,number) values('f4950000-0000-4000-8000-000000000002','f4950000-0000-4000-8000-000000000001','SS1','Sous-sol',-1);
insert into parking_spaces(id,level_id,number,dimensions) values('f4950000-0000-4000-8000-000000000003','f4950000-0000-4000-8000-000000000002','12','{"areaM2":12,"lengthM":5,"widthM":2.4,"clearanceM":2.1}');
insert into registry_listing_units(listing_id,unit_id,space_id,signature)
 select id,'f4930000-0000-4000-8000-000000000001','f4950000-0000-4000-8000-000000000003',md5((draft->'spaces')::text) from listings where id='f4920000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin
 begin
  perform gp_moderate('f4920000-0000-4000-8000-000000000001','approve',3,null);
  raise exception 'Expected obsolete review version refusal';
 exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
end;$$;
select gp_moderate('f4920000-0000-4000-8000-000000000001','approve',6,null);
select set_config('gp.qa_v1_public',(select payload::text from published_listings where id='f4920000-0000-4000-8000-000000000001'),true);

-- Anonymous reads must retain the accepted price and exclude the private address.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select 1/coalesce((select payload->>'priceCents'='3100000' and payload->>'version'='7' and not(payload?'address') from published_listings where id='f4920000-0000-4000-8000-000000000001')::integer,0) as approved_public_projection;

set local role authenticated;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/coalesce((gp_entitlements()->'usage'->'activeListings'='{"limit":1,"used":1,"remaining":0,"resetsAt":null}'::jsonb)::integer,0) as published_listing_fills_quota;
-- Prepare a distinct complete draft to prove that the cap really blocks a new listing.
select gp_listing('f4920000-0000-4000-8000-000000000002','create',(
 select draft||jsonb_build_object('photos','[]'::jsonb,'spacePhotos','{}'::jsonb,
 'spaces',jsonb_build_array(jsonb_build_object('id','f4930000-0000-4000-8000-000000000002','number','13','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)))
 from listings where id='f4920000-0000-4000-8000-000000000001'),null);
insert into media_assets(id,owner_id,listing_id,object_key,mime) values
 ('f4940000-0000-4000-8000-000000000002','f4910000-0000-4000-8000-000000000001','f4920000-0000-4000-8000-000000000002','f4910000-0000-4000-8000-000000000001/f4920000-0000-4000-8000-000000000002/f4940000-0000-4000-8000-000000000002.webp','image/webp');
select gp_listing('f4920000-0000-4000-8000-000000000002','update','{"photos":["/api/media/f4940000-0000-4000-8000-000000000002"],"locationConfirmedAt":"2000-01-01T00:00:00Z"}',1);
do $$begin
 begin
  perform gp_listing('f4920000-0000-4000-8000-000000000002','submit','{"ownershipAttested":true}',2);
  raise exception 'Expected full active quota refusal';
 exception when others then if sqlerrm<>'QUOTA_EXCEEDED' then raise;end if;end;
end;$$;
select 1/coalesce((select row_version=2 and lifecycle_state='draft' from listings where id='f4920000-0000-4000-8000-000000000002')::integer,0) as quota_refusal_rolls_back_listing;
select 1/((select count(*)=0 from listing_revisions where listing_id='f4920000-0000-4000-8000-000000000002')::integer) as quota_refusal_has_no_revision;

-- F17: editing and submitting the existing publication still consumes one slot.
select gp_listing('f4920000-0000-4000-8000-000000000001','update','{"priceCents":3500000}',7);
select gp_listing('f4920000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',8);
select 1/coalesce((gp_entitlements()->'usage'->'activeListings'='{"limit":1,"used":1,"remaining":0,"resetsAt":null}'::jsonb)::integer,0) as pending_revision_does_not_consume_second_slot;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select 1/coalesce((select payload=current_setting('gp.qa_v1_public')::jsonb from published_listings where id='f4920000-0000-4000-8000-000000000001')::integer,0) as pending_revision_preserves_public_snapshot;

set local role authenticated;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select gp_moderate('f4920000-0000-4000-8000-000000000001','reject',9,'Nouveau prix à justifier avant publication.');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select 1/coalesce((select payload=current_setting('gp.qa_v1_public')::jsonb from published_listings where id='f4920000-0000-4000-8000-000000000001')::integer,0) as rejected_revision_preserves_public_snapshot;

set local role authenticated;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/coalesce((select row_version=10 and lifecycle_state='rejected' and draft->>'priceCents'='3500000' and last_published->>'priceCents'='3100000' and draft->>'rejectionReason'='Nouveau prix à justifier avant publication.' from listings where id='f4920000-0000-4000-8000-000000000001')::integer,0) as rejected_work_remains_private_and_readable;
select 1/((select count(*)=3 and count(*) filter(where revision_no=3 and state='changes_requested')=1 and count(*) filter(where revision_no=6 and state='approve')=1 and count(*) filter(where revision_no=9 and state='reject' and reason='Nouveau prix à justifier avant publication.')=1 from listing_revisions where listing_id='f4920000-0000-4000-8000-000000000001')::integer) as correction_approval_rejection_history_preserved;

-- F11/F12: a retry returns the same requested visit; no confirmation is inferred.
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select set_config('gp.qa_v1_conversation',gp_contact('f4920000-0000-4000-8000-000000000001')::text,true);
select set_config('gp.qa_v1_visit',gp_visit(current_setting('gp.qa_v1_conversation')::uuid,'v1-visit-request',null)->>'id',true);
select 1/coalesce(((gp_visit(current_setting('gp.qa_v1_conversation')::uuid,'v1-visit-request',null)->>'id')=current_setting('gp.qa_v1_visit'))::integer,0) as retry_returns_same_visit;
select 1/((select count(*)=1 and bool_and(status='requested' and confirmed_at is null and row_version=1) from visit_requests where conversation_id=current_setting('gp.qa_v1_conversation')::uuid)::integer) as retry_keeps_one_unconfirmed_request;
do $$begin
 begin
  perform gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'accept',1,null);
  raise exception 'Expected buyer acceptance refusal';
 exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end;$$;
reset role;
select 1/((select count(*)=1 from notification_outbox where user_id='f4910000-0000-4000-8000-000000000001' and type='visit' and target_id=current_setting('gp.qa_v1_visit'))::integer) as retry_does_not_duplicate_visit_notice;

set local role authenticated;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}',true);
select 1/((select count(*)=0 from visit_requests where id=current_setting('gp.qa_v1_visit')::uuid)::integer) as outsider_cannot_read_visit;
do $$begin
 begin
  perform gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'cancel',1,null);
  raise exception 'Expected outsider cancellation refusal';
 exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
end;$$;

-- F19: only the seller accepts, a date confirms, and versions govern cancellation.
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'accept',1,null);
select 1/coalesce((select status='accepted' and confirmed_at is null and row_version=2 from visit_requests where id=current_setting('gp.qa_v1_visit')::uuid)::integer,0) as accepted_without_time_is_not_confirmed;
do $$begin
 begin
  perform gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'accept',1,now()+interval '1 day');
  raise exception 'Expected stale visit version refusal';
 exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
end;$$;
select gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'accept',2,now()+interval '1 day');
select 1/coalesce((select status='confirmed' and confirmed_at=now()+interval '1 day' and row_version=3 from visit_requests where id=current_setting('gp.qa_v1_visit')::uuid)::integer,0) as seller_schedules_confirmed_visit;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $$begin
 begin
  perform gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'cancel',2,null);
  raise exception 'Expected stale cancellation refusal';
 exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
end;$$;
select gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'cancel',3,null);
select 1/coalesce((select status='cancelled' and confirmed_at is null and row_version=4 from visit_requests where id=current_setting('gp.qa_v1_visit')::uuid)::integer,0) as buyer_cancels_current_visit;
select set_config('request.jwt.claim.sub','f4910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f4910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$begin
 begin
  perform gp_visit_decision(current_setting('gp.qa_v1_visit')::uuid,'accept',4,now()+interval '2 days');
  raise exception 'Expected terminal visit refusal';
 exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
end;$$;
reset role;
rollback;
