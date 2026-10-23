-- Additive availability lifecycle. Operator jobs are service-role-only and ID-bounded.
begin;
alter table public.listings add column availability_confirmed_at timestamptz;
alter table public.listings add column availability_expires_at timestamptz;
alter table public.listings add column availability_cleanup_pending boolean not null default false;
alter table public.listings drop constraint listings_lifecycle_state_check;
alter table public.listings add constraint listings_lifecycle_state_check check(lifecycle_state in ('draft','pending','published','changes_requested','rejected','paused','sold','withdrawn','suspended','expired'));
create index gp_availability_due on public.listings(availability_expires_at) where availability_expires_at is not null;
-- Read-only availability metadata is server-managed, never a seller-editable field.
alter function public.gp_validate_draft(jsonb,uuid,boolean) rename to gp_validate_draft_before_availability;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin perform gp_validate_draft_before_availability(p-'availabilityConfirmedAt'-'availabilityExpiresAt',p_id,p_submit);end;$$;
revoke all on function public.gp_validate_draft_before_availability(jsonb,uuid,boolean),public.gp_validate_draft(jsonb,uuid,boolean) from public,anon,authenticated;
create function public.gp_availability_stamp() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.lifecycle_state='published' and new.availability_cleanup_pending then raise exception 'AVAILABILITY_CLEANUP_PENDING';end if;
 if new.lifecycle_state='published' and (tg_op='INSERT' or old.lifecycle_state<>'published') and (new.availability_expires_at is null or new.availability_expires_at<=now()) then
  if tg_op='UPDATE' and old.lifecycle_state='pending' and gp_moderation_allowed() then
   new.availability_confirmed_at=now();new.availability_expires_at=now()+interval '90 days';
  else raise exception 'AVAILABILITY_REVIEW_REQUIRED';end if;
 end if;
 new.draft=new.draft||jsonb_build_object('availabilityConfirmedAt',new.availability_confirmed_at,'availabilityExpiresAt',new.availability_expires_at);
 if new.last_published is not null then new.last_published=new.last_published||jsonb_build_object('availabilityConfirmedAt',new.availability_confirmed_at,'availabilityExpiresAt',new.availability_expires_at);end if;
 return new;end;$$;
create trigger gp_availability_stamp before insert or update on public.listings for each row execute function public.gp_availability_stamp();
create function public.gp_availability_sync() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 update published_listings set payload=payload||jsonb_build_object('availabilityConfirmedAt',new.availability_confirmed_at,'availabilityExpiresAt',new.availability_expires_at) where id=new.id;
 return new;end;$$;
create trigger gp_availability_sync after insert or update on public.listings for each row execute function public.gp_availability_sync();
-- Existing snapshots keep their actual original publication age, never migration time.
update public.listings l set availability_confirmed_at=p.created_at,availability_expires_at=p.created_at+interval '90 days' from public.published_listings p where p.id=l.id;
create function public.gp_listing_available(p_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from listings l join published_listings p on p.id=l.id join account_statuses a on a.user_id=l.seller_id where l.id=p_id and a.status='active' and l.availability_expires_at>now() and l.lifecycle_state not in ('sold','withdrawn','paused','suspended','expired'));
$$;
create policy gp_availability_public on public.published_listings as restrictive for select to anon,authenticated using(public.gp_listing_available(id));
alter function public.gp_scene_public(uuid,integer) rename to gp_scene_public_before_availability;
create function public.gp_scene_public(p_listing_id uuid,p_level integer default null) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select case when gp_listing_available(p_listing_id) then gp_scene_public_before_availability(p_listing_id,p_level) else null end;$$;
alter function public.gp_contact(uuid) rename to gp_contact_before_availability;
create function public.gp_contact(p_listing_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$begin if not gp_listing_available(p_listing_id) then raise exception 'NOT_FOUND';end if;return gp_contact_before_availability(p_listing_id);end;$$;
create function public.gp_confirm_availability(p_id uuid,p_version integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;value jsonb;begin
 if not gp_active() then raise exception 'FORBIDDEN';end if;if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 select * into l from listings where id=p_id and seller_id=auth.uid() for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_version is null or l.row_version<>p_version then raise exception 'VERSION_CONFLICT';end if;
 if l.lifecycle_state<>'published' or not gp_listing_available(l.id) then raise exception 'AVAILABILITY_REVIEW_REQUIRED';end if;
 value=l.draft||jsonb_build_object('version',l.row_version+1,'availabilityConfirmedAt',now(),'availabilityExpiresAt',now()+interval '90 days');
 update listings set draft=value,row_version=l.row_version+1,availability_confirmed_at=now(),availability_expires_at=now()+interval '90 days' where id=l.id;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'listing.availability_confirmed',l.id::text,'availability-v1');return value;end;$$;
create function public.gp_maintenance_plan(p_limit integer default 100) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('policyVersion','availability-v1-retention-observe','availability',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',row_version,'expiresAt',availability_expires_at,'action',case when availability_expires_at<=now() then 'expire' when availability_expires_at<=now()+interval '3 days' then 'remind_3' else 'remind_14' end)) from(select l.* from listings l join account_statuses a on a.user_id=l.seller_id and a.status='active' where availability_expires_at<=now()+interval '14 days' and lifecycle_state not in ('sold','withdrawn','suspended','expired') and last_published is not null order by availability_expires_at,id limit least(100,greatest(1,p_limit)))q),'[]'),
 'retentionCandidates',jsonb_build_object('drafts180d',coalesce((select jsonb_agg(id) from(select id from listings where lifecycle_state='draft' and last_published is null and updated_at<now()-interval '180 days' order by id limit least(100,greatest(1,p_limit)))q),'[]'),'orphanMedia7d',coalesce((select jsonb_agg(id) from(select m.id from media_assets m where m.created_at<now()-interval '7 days' and not exists(select 1 from listings l where position('/api/media/'||m.id in l.draft::text)>0 or position('/api/media/'||m.id in coalesce(l.last_published::text,''))>0) and not exists(select 1 from listing_revisions r where position('/api/media/'||m.id in r.payload::text)>0) and not exists(select 1 from published_listings p where position('/api/media/'||m.id in p.payload::text)>0) and not exists(select 1 from parking_scene_sources s where s.object_key=m.object_key) and not exists(select 1 from parking_scenes s where position(m.id::text in s.manifest::text)>0) order by m.id limit least(100,greatest(1,p_limit)))q),'[]'),'orphanSceneSources7d',coalesce((select jsonb_agg(id) from(select s.id from parking_scene_sources s where s.created_at<now()-interval '7 days' and not exists(select 1 from parking_scenes model where s.id=any(model.evidence_ids)) order by s.id limit least(100,greatest(1,p_limit)))q),'[]'),'exports7d','local_export_directory_scan_only','purgeEnabled',false));
$$;
create function public.gp_run_availability(p_ids uuid[],p_policy text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;expired_ids uuid[]='{}';objects text[]='{}';reminders integer=0;target text;versions jsonb='{}';begin
 if p_policy is distinct from 'availability-v1-retention-observe' or p_ids is null or cardinality(p_ids) not between 1 and 100 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids)x) then raise exception 'MAINTENANCE_SELECTION_REQUIRED';end if;
 for l in select x.* from listings x join account_statuses a on a.user_id=x.seller_id and a.status='active' where x.id=any(p_ids) order by x.id for update of x loop
  if l.lifecycle_state in ('sold','withdrawn','suspended') or l.availability_expires_at is null then continue;end if;
  if l.availability_expires_at<=now() then
   objects=objects||coalesce((select array_agg(m.id::text||'.webp') from media_assets m where m.listing_id=l.id),'{}'::text[]);
   if l.lifecycle_state<>'expired' then
    delete from published_listings where id=l.id;delete from active_space_claims where listing_id=l.id;
    update listing_revisions set state='expired',reason='Disponibilité non reconfirmée dans les 90 jours.' where listing_id=l.id and state='pending';
    update listings set lifecycle_state='expired',last_published=null,availability_cleanup_pending=true,row_version=l.row_version+1,draft=l.draft||jsonb_build_object('status','expired','sceneAvailable',false,'version',l.row_version+1) where id=l.id;
    insert into audit_events(action,target_id,detail) values('listing.availability_expired',l.id::text,p_policy);
   else update listings set availability_cleanup_pending=true where id=l.id;end if;expired_ids=array_append(expired_ids,l.id);versions=versions||jsonb_build_object(l.id::text,(select row_version from listings where id=l.id));
  elsif l.last_published is not null and l.availability_expires_at<=now()+interval '14 days' then
   target=l.id||':'||extract(epoch from l.availability_expires_at)::bigint::text;
   if l.availability_expires_at<=now()+interval '3 days' then
    insert into notification_outbox(user_id,type,target_id) values(l.seller_id,'availability_3',target) on conflict do nothing;
   else insert into notification_outbox(user_id,type,target_id) values(l.seller_id,'availability_14',target) on conflict do nothing;end if;
   reminders=reminders+1;
  end if;
 end loop;return jsonb_build_object('expiredIds',expired_ids,'versions',versions,'publicObjects',objects,'reminderCandidates',reminders,'retentionPurged',false);end;$$;
create function public.gp_finish_availability_cleanup(p_id uuid,p_version integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;begin
 select * into l from listings where id=p_id for update;
 if not found or p_version is null or l.row_version<>p_version or l.availability_expires_at>now() or exists(select 1 from published_listings where id=p_id) then raise exception 'VERSION_CONFLICT';end if;
 update listings set availability_cleanup_pending=false where id=p_id;return true;end;$$;
revoke all on function public.gp_finish_availability_cleanup(uuid,integer) from public,anon,authenticated;
grant execute on function public.gp_finish_availability_cleanup(uuid,integer) to service_role;
alter function public.gp_notification_content(text,text) rename to gp_notification_content_before_availability;
create function public.gp_notification_content(p_type text,p_target text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if p_type in ('availability_14','availability_3') then return jsonb_build_object('title','Confirmez la disponibilité de votre parking','body',case p_type when 'availability_3' then 'Votre annonce expire dans trois jours ou moins. Confirmez sa disponibilité pour la conserver en ligne.' else 'Votre annonce expire dans quatorze jours ou moins. Confirmez sa disponibilité depuis votre espace.' end,'url','/compte/annonces');end if;
 return gp_notification_content_before_availability(p_type,p_target);end;$$;
revoke all on function public.gp_notification_content_before_availability(text,text),public.gp_notification_content(text,text) from public,anon,authenticated;
revoke all on function public.gp_availability_stamp(),public.gp_availability_sync(),public.gp_scene_public_before_availability(uuid,integer),public.gp_contact_before_availability(uuid),public.gp_confirm_availability(uuid,integer),public.gp_listing_available(uuid),public.gp_scene_public(uuid,integer),public.gp_contact(uuid),public.gp_maintenance_plan(integer),public.gp_run_availability(uuid[],text) from public,anon,authenticated;
grant execute on function public.gp_listing_available(uuid),public.gp_scene_public(uuid,integer) to anon,authenticated;
grant execute on function public.gp_contact(uuid),public.gp_confirm_availability(uuid,integer) to authenticated;
grant execute on function public.gp_maintenance_plan(integer),public.gp_run_availability(uuid[],text),public.gp_notification_content(text,text) to service_role;
commit;
