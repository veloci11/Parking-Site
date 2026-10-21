-- Per-unit galleries: private keys are listing-space IDs, public keys are presentation aliases.
begin;
create or replace function public.gp_all_photo_urls(p jsonb) returns setof text language sql immutable security invoker set search_path=public,pg_temp as $$select distinct value from (select jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) as value union all select jsonb_array_elements_text(g.value) from jsonb_each(coalesce(p->'spacePhotos','{}'::jsonb))g)urls$$;
create or replace function public.gp_public_payload(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$ declare result jsonb;units jsonb;q jsonb;galleries jsonb;begin
 select jsonb_agg(jsonb_build_object('id',(p->>'id')||':unit:'||ordinality,'number',value->'number','level',value->'level','areaM2',value->'areaM2','lengthM',value->'lengthM','widthM',value->'widthM','clearanceM',value->'clearanceM')) into units from jsonb_array_elements(p->'spaces') with ordinality;
 q=p->'quality';
 result=jsonb_build_object('id',p->'id','slug',p->'slug','title',p->'title','description',p->'description','city',p->'city','district',p->'district','priceCents',p->'priceCents','type',p->'type','spaces',coalesce(units,'[]'),'photos',p->'photos','quality',jsonb_build_object('floor',q->'floor','lighting',q->'lighting','humidity',q->'humidity','access',q->'access','maneuver',q->'maneuver','observations',q->'observations'),'locationPrecision',p->'locationPrecision','coordinates',p->'coordinates','sceneAvailable',false,'isDemo',false,'status','published','version',p->'version','sellerName',p->'sellerName','createdAt',p->'createdAt','updatedAt',p->'updatedAt');
 select coalesce(jsonb_object_agg((p->>'id')||':unit:'||ordinality,p->'spacePhotos'->(value->>'id')),'{}'::jsonb) into galleries from jsonb_array_elements(p->'spaces') with ordinality where jsonb_typeof(p->'spacePhotos'->(value->>'id'))='array';result=jsonb_set(result,'{spacePhotos}',galleries);
 if p->>'locationPrecision'='exact_opt_in' then if p ? 'address' then result=jsonb_set(result,'{address}',p->'address');end if;
 else result=jsonb_set(result,'{coordinates}',jsonb_build_array(round((p->'coordinates'->>0)::numeric,2),round((p->'coordinates'->>1)::numeric,2)));end if;
 if p ? 'occupancy' then result=jsonb_set(result,'{occupancy}',p->'occupancy');end if;if p ? 'annualChargesCents' then result=jsonb_set(result,'{annualChargesCents}',p->'annualChargesCents');end if;if p ? 'propertyTaxCents' then result=jsonb_set(result,'{propertyTaxCents}',p->'propertyTaxCents');end if;if p ? 'observedAt' then result=jsonb_set(result,'{observedAt}',p->'observedAt');end if;return result;end;$$;
create or replace function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare field text;u jsonb;photo text;n numeric;begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 for field in select jsonb_object_keys(p) loop if field not in ('id','slug','title','description','city','district','priceCents','type','spaces','photos','quality','locationPrecision','coordinates','address','sceneAvailable','isDemo','status','version','sellerName','createdAt','updatedAt','rejectionReason','spacePhotos','occupancy','annualChargesCents','propertyTaxCents','observedAt') then raise exception 'VALIDATION_ERROR';end if;end loop;
 foreach field in array array['title','description','city','district'] loop if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'VALIDATION_ERROR';end if;end loop;
 if length(p->>'title')>90 or length(p->>'description')>5000 or length(p->>'city')>80 or length(p->>'district')>100 or jsonb_typeof(p->'priceCents') is distinct from 'number' or (p->>'priceCents')::numeric<0 or (p->>'priceCents')::numeric>10000000000 or trunc((p->>'priceCents')::numeric)<>(p->>'priceCents')::numeric or coalesce(p->>'type','') not in ('covered','box','outdoor') or coalesce(p->>'locationPrecision','') not in ('area','exact_opt_in') then raise exception 'VALIDATION_ERROR';end if;
 if jsonb_typeof(p->'spaces') is distinct from 'array' or jsonb_array_length(p->'spaces') not between 1 and 500 or jsonb_typeof(p->'photos') is distinct from 'array' or jsonb_array_length(p->'photos')>20 or jsonb_typeof(p->'coordinates') is distinct from 'array' or jsonb_array_length(p->'coordinates')<>2 then raise exception 'VALIDATION_ERROR';end if;
 if jsonb_typeof(p->'coordinates'->0) is distinct from 'number' or jsonb_typeof(p->'coordinates'->1) is distinct from 'number' or (p->'coordinates'->>0)::numeric not between -180 and 180 or (p->'coordinates'->>1)::numeric not between -90 and 90 then raise exception 'VALIDATION_ERROR';end if;
 if jsonb_typeof(p->'quality') is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['floor','lighting','humidity','access','maneuver','observations'] loop if jsonb_typeof(p->'quality'->field) is distinct from 'string' or length(p->'quality'->>field)>(case when field='observations' then 4000 else 500 end) then raise exception 'VALIDATION_ERROR';end if;end loop;
 for u in select * from jsonb_array_elements(p->'spaces') loop
 if jsonb_typeof(u) is distinct from 'object' or coalesce(u->>'id','')!~'^[a-f0-9-]{36}$' or jsonb_typeof(u->'number') is distinct from 'string' or length(u->>'number')>30 or jsonb_typeof(u->'level') is distinct from 'number' or (u->>'level')::numeric not between -20 and 20 or trunc((u->>'level')::numeric)<>(u->>'level')::numeric then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['areaM2','lengthM','widthM','clearanceM'] loop if not(u ? field) then raise exception 'VALIDATION_ERROR';end if;if u->field<>'null'::jsonb then if jsonb_typeof(u->field) is distinct from 'number' then raise exception 'VALIDATION_ERROR';end if;n=(u->>field)::numeric;if n<=0 or n>(case when field='areaM2' then 500 when field='clearanceM' then 20 else 50 end) then raise exception 'VALIDATION_ERROR';end if;end if;end loop;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p->'spaces')) then raise exception 'VALIDATION_ERROR';end if;
 if p ? 'spacePhotos' then
 if jsonb_typeof(p->'spacePhotos') is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 for field,u in select key,value from jsonb_each(p->'spacePhotos') loop
 if not exists(select 1 from jsonb_array_elements(p->'spaces') where value->>'id'=field) or jsonb_typeof(u) is distinct from 'array' or jsonb_array_length(u)>6 then raise exception 'VALIDATION_ERROR';end if;
 end loop;
 end if;
 if (select count(*) from gp_all_photo_urls(p))>120 then raise exception 'VALIDATION_ERROR';end if;
 for photo in select * from gp_all_photo_urls(p) loop if photo!~'^/api/media/[a-f0-9-]{36}$' or not exists(select 1 from media_assets where id::text=split_part(photo,'/',4) and owner_id=auth.uid() and listing_id=p_id) then raise exception 'MEDIA_NOT_OWNED';end if;end loop;
 if p ? 'address' and (jsonb_typeof(p->'address') is distinct from 'string' or length(p->>'address')>200) then raise exception 'VALIDATION_ERROR';end if;
 if p ? 'observedAt' and p->'observedAt'<>'null'::jsonb then if jsonb_typeof(p->'observedAt') is distinct from 'string' or (p->>'observedAt')::timestamptz>now()+interval '5 minutes' then raise exception 'VALIDATION_ERROR';end if;end if;
 if p ? 'occupancy' and (jsonb_typeof(p->'occupancy') is distinct from 'string' or coalesce(p->>'occupancy','') not in ('vacant','occupied','unknown')) then raise exception 'VALIDATION_ERROR';end if;
 foreach field in array array['annualChargesCents','propertyTaxCents'] loop if p ? field and p->field<>'null'::jsonb then if jsonb_typeof(p->field) is distinct from 'number' or (p->>field)::numeric<0 or (p->>field)::numeric>100000000 or trunc((p->>field)::numeric)<>(p->>field)::numeric then raise exception 'VALIDATION_ERROR';end if;end if;end loop;
 if p_submit and (length(p->>'title')<15 or length(p->>'description')<100 or length(p->>'city')<1 or length(p->>'district')<1 or (p->>'priceCents')::numeric<=0 or jsonb_array_length(p->'photos')<3 or exists(select 1 from jsonb_array_elements(p->'spaces') where length(value->>'number')<1)) then raise exception 'VALIDATION_ERROR';end if;
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
 for field in select jsonb_object_keys(p_payload) loop if field not in ('title','description','city','district','priceCents','type','spaces','photos','quality','locationPrecision','coordinates','address','slug','spacePhotos','occupancy','annualChargesCents','propertyTaxCents','observedAt') then raise exception 'VALIDATION_ERROR';end if;end loop;
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

alter policy gp_reviewed_select on storage.objects using(bucket_id='public-approved' and exists(select 1 from public.published_listings p where exists(select 1 from public.gp_all_photo_urls(p.payload)photo where photo='/api/media/'||split_part(name,'.',1))));
alter policy gp_approved_cleanup_read on storage.objects using(bucket_id='public-approved' and public.gp_moderation_allowed() and not exists(select 1 from public.published_listings p where exists(select 1 from public.gp_all_photo_urls(p.payload)photo where photo='/api/media/'||split_part(name,'.',1))));
alter policy gp_approved_cleanup on storage.objects using(bucket_id='public-approved' and public.gp_moderation_allowed() and not exists(select 1 from public.published_listings p where exists(select 1 from public.gp_all_photo_urls(p.payload)photo where photo='/api/media/'||split_part(name,'.',1))));
alter policy gp_private_cleanup on storage.objects using(bucket_id='private-uploads' and (storage.foldername(name))[1]=auth.uid()::text and public.gp_active() and not exists(select 1 from public.media_assets a join public.listings l on l.id=a.listing_id where a.object_key=name and (exists(select 1 from public.gp_all_photo_urls(l.draft)photo where photo='/api/media/'||a.id) or exists(select 1 from public.gp_all_photo_urls(coalesce(l.last_published,'{}'))photo where photo='/api/media/'||a.id) or exists(select 1 from public.listing_revisions r where r.listing_id=l.id and exists(select 1 from public.gp_all_photo_urls(r.payload)photo where photo='/api/media/'||a.id)))));
revoke execute on function public.gp_all_photo_urls(jsonb) from public,anon,authenticated;
grant execute on function public.gp_all_photo_urls(jsonb) to anon,authenticated,service_role;
-- Pure JSON URL enumerator only; no database reads or authorization decisions.
commit;
