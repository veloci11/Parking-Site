-- 022 RPC/Storage fixtures only. No Auth network calls, email or billing; always rollback.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f2210000-0000-4000-8000-000000000001','{"name":"Quota Seller"}',now()),
('f2210000-0000-4000-8000-000000000002','{"name":"Quota Buyer"}',now()),
('f2210000-0000-4000-8000-000000000003','{"name":"Quota Admin"}',now());
update app_roles set role='admin' where user_id='f2210000-0000-4000-8000-000000000003';
select 1/((select count(*)=3 from user_entitlements where user_id::text like 'f2210000-%')::integer) as automatic_free_assignments;
-- Ten existing pending units plus an eleventh complete draft exercise both original cores.
insert into listings(id,seller_id,draft,lifecycle_state,row_version)
select ('f2220000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f2210000-0000-4000-8000-000000000001',
jsonb_build_object('id','f2220000-0000-4000-8000-'||lpad(n::text,12,'0'),'slug','quota-test','title','Place de recette de quota','description',repeat('Description factuelle de la place et de ses contraintes. ',4),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',2000000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f2230000-0000-4000-8000-'||lpad(n::text,12,'0'),'number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":"Aucune expertise"}'::jsonb,'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée','sceneAvailable',false,'isDemo',false,'status',case when n=11 then 'draft' else 'pending' end,'version',1,'sellerName','QA','createdAt',now(),'updatedAt',now()),case when n=11 then 'draft' else 'pending' end,1 from generate_series(1,11)n;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select ('f2240000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f2210000-0000-4000-8000-000000000001','f2220000-0000-4000-8000-000000000011','f2210000-0000-4000-8000-000000000001/f2220000-0000-4000-8000-000000000011/f2240000-0000-4000-8000-'||lpad(n::text,12,'0')||'.webp','image/webp' from generate_series(1,3)n;
update listings set draft=draft||jsonb_build_object('photos','["/api/media/f2240000-0000-4000-8000-000000000001","/api/media/f2240000-0000-4000-8000-000000000002","/api/media/f2240000-0000-4000-8000-000000000003"]'::jsonb,'locationConfirmedAt',now()) where id='f2220000-0000-4000-8000-000000000011';
update listings set location_confirmation_hash=gp_location_hash(draft) where id='f2220000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
do $$begin begin perform gp_admin_entitlements();raise exception 'Expected AAL2';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select gp_entitlement_command(jsonb_build_object('action','set_free_limits','version',(gp_admin_entitlements()->'freePlan'->>'version')::integer,'limits','{"activeListings":10,"draftsPerDay":1,"submissionsPerDay":20,"contactsPerDay":10,"messagesPerMinute":30,"messagesBurst":5,"uploadsPerHour":60,"uploadBytesPerDay":262144000}'::jsonb,'reason','Limites gratuites de recette isolée.'));
do $$begin
 begin perform gp_entitlement_command(jsonb_build_object('action','set_free_limits','version',(gp_admin_entitlements()->'freePlan'->>'version')::integer-1,'limits',gp_admin_entitlements()->'freePlan'->'limits','reason','Version périmée de recette isolée.'));raise exception 'Expected version';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 begin perform gp_entitlement_command(jsonb_build_object('action','set_user_override','userId','f2210000-0000-4000-8000-000000000001','version',0,'limits','{"activeListings":20}','expiresAt',now()+interval '91 days','reason','Dérogation trop longue de recette.'));raise exception 'Expected duration bound';exception when others then if sqlerrm<>'LIMITS_INVALID' then raise;end if;end;
 begin perform gp_entitlement_command(jsonb_build_object('action','set_user_override','userId','f2210000-0000-4000-8000-000000000001','version',0,'limits','{"activeListings":501}','expiresAt',now()+interval '1 day','reason','Dérogation hors bornes de recette.'));raise exception 'Expected cap bound';exception when others then if sqlerrm<>'LIMITS_INVALID' then raise;end if;end;
 begin perform gp_entitlement_command(jsonb_build_object('action','set_user_override','userId','f2210000-0000-4000-8000-000000000001','version',0,'limits','{"activeListings":20}','role','admin','expiresAt',now()+interval '1 day','reason','Escalade interdite de recette.'));raise exception 'Expected role field refusal';exception when others then if sqlerrm<>'LIMITS_INVALID' then raise;end if;end;
end;$$;
select gp_entitlement_command(jsonb_build_object('action','set_user_override','userId','f2210000-0000-4000-8000-000000000001','version',0,'limits','{"activeListings":20,"uploadBytesPerDay":100,"uploadsPerHour":3}'::jsonb,'expiresAt',now()+interval '1 day','reason','Dérogation bornée et temporaire de recette.'));
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/((gp_entitlements()->'usage'->'activeListings'->>'remaining'='10' and gp_entitlements()->>'billingEnabled'='false')::integer) as real_active_remaining;
select gp_listing('f2220000-0000-4000-8000-000000000011','submit','{"ownershipAttested":true}',1);
select gp_listing('f2250000-0000-4000-8000-000000000001','create',(select draft||'{"photos":[],"spacePhotos":{}}'::jsonb from listings where id='f2220000-0000-4000-8000-000000000011'),null);
do $$begin
 begin perform gp_listing('f2250000-0000-4000-8000-000000000002','create',(select draft||'{"photos":[],"spacePhotos":{}}'::jsonb from listings where id='f2220000-0000-4000-8000-000000000011'),null);raise exception 'Expected draft cap';exception when others then if sqlerrm<>'RATE_LIMITED' then raise;end if;end;
 begin perform gp_limit('message',300,60);raise exception 'Expected no quota bypass RPC';exception when insufficient_privilege then null;end;
 begin perform gp_entitlement_command(jsonb_build_object('action','clear_user_override','userId',auth.uid(),'version',1,'reason','Tentative non autorisée de recette.'));raise exception 'Expected admin only';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
end;$$;
select 1/((gp_entitlements()->'usage'->'drafts'->>'used'='1' and gp_entitlements()->'usage'->'drafts'->>'remaining'='0' and gp_entitlements()->'usage'->'drafts'->>'resetsAt' is not null)::integer) as actual_draft_window;
reset role;
insert into parking_sites(id,public_name,internal_reference) values('f2260000-0000-4000-8000-000000000001','Parking QA','Quota fixture');
insert into parking_levels(id,site_id,code,label,number) values('f2260000-0000-4000-8000-000000000002','f2260000-0000-4000-8000-000000000001','SS1','Sous-sol',-1);
insert into parking_spaces(id,level_id,number,dimensions) values('f2260000-0000-4000-8000-000000000003','f2260000-0000-4000-8000-000000000002','12','{"areaM2":12,"lengthM":5,"widthM":2.4,"clearanceM":2.1}');
insert into registry_listing_units(listing_id,unit_id,space_id,signature) select id,'f2230000-0000-4000-8000-000000000011','f2260000-0000-4000-8000-000000000003',md5((draft->'spaces')::text) from listings where id='f2220000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select gp_moderate('f2220000-0000-4000-8000-000000000011','approve',2);
select 1/((gp_admin_entitlements('f2210000-0000-4000-8000-000000000001')->'user'->'usage'->'activeListings'->>'used'='11')::integer) as original_approval_core_uses_override_above_ten;
reset role;
insert into conversations(id,listing_id,buyer_id,seller_id) values('f2270000-0000-4000-8000-000000000001','f2220000-0000-4000-8000-000000000011','f2210000-0000-4000-8000-000000000002','f2210000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select gp_message('f2270000-0000-4000-8000-000000000001','Message de recette','quota-message-'||n) from generate_series(1,5)n;
select gp_message('f2270000-0000-4000-8000-000000000001','Message de recette','quota-message-1');
do $$begin begin perform gp_message('f2270000-0000-4000-8000-000000000001','Sixième message','quota-message-6');raise exception 'Expected burst cap';exception when others then if sqlerrm<>'RATE_LIMITED' then raise;end if;end;end;$$;
select 1/((gp_entitlements()->'usage'->'messages'->>'used'='5' and gp_entitlements()->'usage'->'messageBurst'->>'used'='5')::integer) as retries_do_not_consume_and_failed_burst_is_atomic;
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000001',true);
insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000001','private-uploads','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000001.webp','{"size":50}');
-- Metadata finalization/replay must not charge the object twice.
reset role;
update storage.objects set metadata='{"size":50}' where id='f2280000-0000-4000-8000-000000000001';
insert into storage.objects(id,bucket_id,name) values('f2280000-0000-4000-8000-000000000002','private-uploads','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000002.webp');
-- Actual Storage finalization writes as superuser after its RLS probe.
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
update storage.objects set metadata='{"size":20}' where id='f2280000-0000-4000-8000-000000000002';
do $$begin
 begin insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000003','private-uploads','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000003.webp','{"size":31}');raise exception 'Expected byte cap';exception when others then if sqlerrm<>'RATE_LIMITED' then raise;end if;end;
end;$$;
select 1/((select count=2 from rate_limits where bucket='f2210000-0000-4000-8000-000000000001:upload')::integer) as failed_byte_limit_does_not_consume_count;
select 1/((select count=70 from rate_limits where bucket='f2210000-0000-4000-8000-000000000001:upload_bytes')::integer) as stored_bytes_are_real_and_idempotent;
select 1/((select count(*)=2 from private_upload_receipts where user_id='f2210000-0000-4000-8000-000000000001')::integer) as failed_upload_rolls_back_receipt;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin begin insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000004','private-uploads','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000004.webp','{"size":31}');raise exception 'Expected signed upload byte cap';exception when others then if sqlerrm<>'RATE_LIMITED' then raise;end if;end;end;$$;
select 1/((select count=70 from rate_limits where bucket='f2210000-0000-4000-8000-000000000001:upload_bytes')::integer) as signed_upload_without_uid_cannot_bypass_bytes;
-- A signed delegation may carry another logged-in actor; the validated path owns the quota.
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000004','private-uploads','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000004.webp','{"size":1}');
select 1/((select count=71 from rate_limits where bucket='f2210000-0000-4000-8000-000000000001:upload_bytes')::integer) as delegated_signed_upload_charges_signer;
select 1/((not exists(select 1 from rate_limits where bucket='f2210000-0000-4000-8000-000000000002:upload_bytes'))::integer) as delegated_signed_upload_does_not_charge_buyer;
set local role authenticated;
do $$begin begin insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000006','private-uploads','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000006.webp','{"size":1}');raise exception 'Expected cross-account SDK refusal';exception when insufficient_privilege then null;end;end;$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256) values('f2280000-0000-4000-8000-000000000005','f2250000-0000-4000-8000-000000000001','f2210000-0000-4000-8000-000000000001','f2210000-0000-4000-8000-000000000001','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000005.pdf','application/pdf',20,repeat('a',64));
select set_config('request.jwt.claims','{}',true);
insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000005','scene-sources','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000005.preview-1.png','{"size":1000}');
select 1/((select count=71 from rate_limits where bucket='f2210000-0000-4000-8000-000000000001:upload_bytes')::integer) as operator_previews_are_not_seller_uploads;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$begin begin insert into storage.objects(id,bucket_id,name,metadata) values('f2280000-0000-4000-8000-000000000007','scene-sources','f2210000-0000-4000-8000-000000000001/f2250000-0000-4000-8000-000000000001/f2280000-0000-4000-8000-000000000005.preview-2.png','{"size":1000}');raise exception 'Expected client preview refusal';exception when insufficient_privilege then null;end;end;$$;
reset role;
update entitlement_overrides set starts_at=now()-interval '1 day',expires_at=now()-interval '1 second' where user_id='f2210000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f2210000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2210000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/((gp_entitlements()->'limits'->>'activeListings'='10' and gp_entitlements()->'override'->>'active'='false')::integer) as expired_override_has_no_effect;
reset role;
select 1/((not has_table_privilege('authenticated','public.plan_definitions','update') and not has_table_privilege('authenticated','public.user_entitlements','insert') and not has_table_privilege('authenticated','public.entitlement_overrides','select') and not has_table_privilege('authenticated','public.private_upload_receipts','select') and not has_function_privilege('authenticated','public.gp_limit(text,integer,integer)','execute') and not has_function_privilege('authenticated','public.gp_consume_user_limit(uuid,text,bigint,integer,bigint)','execute') and not has_function_privilege('authenticated','public.gp_message_before_entitlements(uuid,text,text)','execute') and not has_function_privilege('anon','public.gp_entitlements()','execute'))::integer) as quota_internal_privileges_closed;
select 1/((not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'gp_listing%' or p.proname like 'gp_moderate%') and p.prosrc~'active_count[[:space:]]*>=[[:space:]]*10'))::integer) as no_legacy_hardcoded_active_core;
rollback;
