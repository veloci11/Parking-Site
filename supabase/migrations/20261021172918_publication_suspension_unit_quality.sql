-- 008: moderator suspension and independent per-unit condition declarations.
begin;
alter table public.listings drop constraint listings_lifecycle_state_check;
alter table public.listings add constraint listings_lifecycle_state_check check(lifecycle_state in ('draft','pending','published','changes_requested','rejected','paused','sold','withdrawn','suspended'));
alter function public.gp_validate_draft(jsonb,uuid,boolean) rename to gp_validate_draft_v7;
alter function public.gp_public_payload(jsonb) rename to gp_public_payload_v7;
create function public.gp_validate_quality_provenance(q jsonb) returns void language plpgsql stable set search_path=public,pg_temp as $$begin
 if q ? 'basis' and (jsonb_typeof(q->'basis') is distinct from 'string' or q->>'basis' not in ('seller_observation','provided_document','unknown')) then raise exception 'VALIDATION_ERROR';end if;
 if q ? 'observedAt' and q->'observedAt'<>'null'::jsonb then if jsonb_typeof(q->'observedAt') is distinct from 'string' or q->>'observedAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or (q->>'observedAt')::timestamptz>now()+interval '5 minutes' then raise exception 'VALIDATION_ERROR';end if;end if;
 end;$$;
create function public.gp_quality_provenance(q jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$select jsonb_build_object('observedAt',coalesce(q->'observedAt','null'::jsonb),'basis',coalesce(q->'basis','"unknown"'::jsonb))$$;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare k text;q jsonb;field text;begin
 perform gp_validate_draft_v7(p-'unitQuality',p_id,p_submit);
 perform gp_validate_quality_provenance(p->'quality');
 if p ? 'unitQuality' then
 if jsonb_typeof(p->'unitQuality') is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 for k,q in select key,value from jsonb_each(p->'unitQuality') loop
 if not exists(select 1 from jsonb_array_elements(p->'spaces') where value->>'id'=k) or jsonb_typeof(q) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 perform gp_validate_quality_provenance(q);
 for field in select jsonb_object_keys(q) loop if field not in ('floor','lighting','humidity','access','maneuver','observations','observedAt','basis') then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['floor','lighting','humidity','access','maneuver','observations'] loop
 if jsonb_typeof(q->field) is distinct from 'string' or length(q->>field)>(case when field='observations' then 4000 else 500 end) then raise exception 'VALIDATION_ERROR';end if;
 end loop;end loop;end if;end;$$;
create function public.gp_public_payload(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$declare result jsonb;qualities jsonb;begin
 result=gp_public_payload_v7(p);
 result=jsonb_set(result,'{quality}',(result->'quality')||gp_quality_provenance(p->'quality'));
 select coalesce(jsonb_object_agg((p->>'id')||':unit:'||s.ordinality,jsonb_build_object('floor',q->'floor','lighting',q->'lighting','humidity',q->'humidity','access',q->'access','maneuver',q->'maneuver','observations',q->'observations')||gp_quality_provenance(q)),'{}'::jsonb) into qualities from jsonb_array_elements(p->'spaces') with ordinality s cross join lateral (select p->'unitQuality'->(s.value->>'id') q) v where jsonb_typeof(q)='object';
 return result||jsonb_build_object('unitQuality',qualities);
 end;$$;
create or replace function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare l listings; value jsonb; new_version integer; active_count integer; unit jsonb; photo text; field text;
 begin
 if not gp_active() then raise exception 'UNAUTHENTICATED'; end if;
 if p_action='create' then
 perform gp_limit('draft',10,86400);value=p_payload||jsonb_build_object('id',p_id,'isDemo',false,'status','draft','version',1,'sceneAvailable',false,'sellerName',(select name from profiles where user_id=auth.uid()),'createdAt',now(),'updatedAt',now());perform gp_validate_draft(value,p_id,false); insert into listings(id,seller_id,draft) values(p_id,auth.uid(),value) returning * into l;
 return l.draft; end if;
 select * into l from listings where id=p_id for update; if not found or l.seller_id<>auth.uid() then raise exception 'NOT_FOUND'; end if;
 if p_version is null or l.row_version<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 new_version=l.row_version+1;value=l.draft;
 if p_action='update' then
 if l.lifecycle_state='pending' then raise exception 'VERSION_CONFLICT'; end if;
 for field in select jsonb_object_keys(p_payload) loop if field not in ('title','description','city','district','priceCents','type','spaces','photos','quality','locationPrecision','coordinates','address','slug','spacePhotos','occupancy','annualChargesCents','propertyTaxCents','observedAt','unitQuality') then raise exception 'VALIDATION_ERROR';end if;end loop;
 value=value||p_payload||jsonb_build_object('status','draft','sceneAvailable',false);perform gp_validate_draft(value,p_id,false); l.lifecycle_state='draft';
 elsif p_action='submit' then
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED'; end if;
 if p_payload->>'ownershipAttested' is distinct from 'true' then raise exception 'OWNERSHIP_ATTESTATION_REQUIRED';end if;
 if l.lifecycle_state not in ('draft','changes_requested','rejected') then raise exception 'VERSION_CONFLICT';end if;
 perform gp_validate_draft(value,p_id,true);if length(value->>'title')<15 or length(value->>'description')<100 or coalesce((value->>'priceCents')::bigint,0)<=0 or length(value->>'city')<1 or length(value->>'district')<1 or jsonb_array_length(value->'photos')<3 or jsonb_array_length(value->'spaces')<1 then raise exception 'VALIDATION_ERROR';end if;
 for unit in select * from jsonb_array_elements(value->'spaces') loop if length(unit->>'number')<1 then raise exception 'VALIDATION_ERROR'; end if;end loop;
 for photo in select jsonb_array_elements_text(value->'photos') loop if not exists(select 1 from media_assets where id::text=split_part(photo,'/',4) and owner_id=auth.uid() and listing_id=l.id) then raise exception 'MEDIA_NOT_OWNED';end if;end loop;
 perform gp_limit('submit',20,86400);perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select count(distinct id) into active_count from listings where seller_id=auth.uid() and id<>l.id and (last_published is not null or lifecycle_state='pending') and lifecycle_state not in ('sold','withdrawn');if active_count>=10 then raise exception 'QUOTA_EXCEEDED';end if;
 l.lifecycle_state='pending';value=jsonb_set(value,'{status}','"pending"');insert into listing_revisions(listing_id,revision_no,payload) values(l.id,new_version,jsonb_set(value,'{version}',to_jsonb(new_version)));
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'listing.submit',l.id::text,'ownership_attested=true');
 elsif p_action in ('pause','resume','sold','withdraw') then
 if l.lifecycle_state in ('sold','withdrawn') then raise exception 'VERSION_CONFLICT';end if;
 if p_action in ('pause','resume') and l.last_published is null then raise exception 'NOT_PUBLISHED';end if;
 if p_action='resume' and l.lifecycle_state<>'paused' then raise exception 'VERSION_CONFLICT';end if;
 l.lifecycle_state=case p_action when 'pause' then 'paused' when 'resume' then 'published' when 'sold' then 'sold' else 'withdrawn' end;
 if p_action='resume' then
 for unit in select * from jsonb_array_elements(l.last_published->'spaces') loop insert into active_space_claims values(unit->>'id',l.id) on conflict(space_id) do update set listing_id=case when active_space_claims.listing_id=excluded.listing_id then excluded.listing_id else null end;end loop;
 insert into published_listings(id,payload) values(l.id,gp_public_payload(l.last_published));
 else delete from published_listings where id=l.id;delete from active_space_claims where listing_id=l.id;end if;
 value=jsonb_set(value,'{status}',to_jsonb(l.lifecycle_state));
 else raise exception 'VALIDATION_ERROR';end if;
 value=value||jsonb_build_object('version',new_version,'updatedAt',now());update listings set draft=value,row_version=new_version,lifecycle_state=l.lifecycle_state,updated_at=now() where id=l.id;return value;
 end;$$;

create function public.gp_suspend_publication(p_id uuid,p_version integer,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;value jsonb;begin
 if not gp_moderation_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 15 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 select * into l from listings where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_version is null or p_version<>l.row_version or l.last_published is null or l.lifecycle_state in ('sold','withdrawn','suspended') then raise exception 'VERSION_CONFLICT';end if;
 value=l.draft||jsonb_build_object('status','suspended','version',l.row_version+1,'updatedAt',now(),'sceneAvailable',false,'rejectionReason',btrim(p_reason));
 -- Historical listing_revisions remain available; the resumable snapshot is removed.
 delete from published_listings where id=l.id;delete from active_space_claims where listing_id=l.id;
 update listings set lifecycle_state='suspended',draft=value,last_published=null,row_version=l.row_version+1,updated_at=now() where id=l.id;
 update listing_revisions set state='suspended',reason=btrim(p_reason),actor_id=auth.uid() where listing_id=l.id and state='pending';
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'moderation.suspend',l.id::text,btrim(p_reason));
 insert into notification_outbox(user_id,type,target_id) values(l.seller_id,'moderation',l.id||':'||(l.row_version+1));
 return value;end;$$;
revoke all on function public.gp_validate_quality_provenance(jsonb),public.gp_quality_provenance(jsonb),public.gp_validate_draft_v7(jsonb,uuid,boolean),public.gp_validate_draft(jsonb,uuid,boolean),public.gp_public_payload_v7(jsonb),public.gp_public_payload(jsonb),public.gp_suspend_publication(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.gp_suspend_publication(uuid,integer,text) to authenticated;
commit;
