-- 023. Quarantined sources. Operator worker only; originals and previews stay private.
alter table public.parking_scene_sources drop constraint parking_scene_sources_byte_size_check;
alter table public.parking_scene_sources add constraint parking_scene_sources_byte_size_check check(byte_size between 20 and 26214400);
alter table public.parking_scene_sources
 add column processing_state text not null default 'processing' check(processing_state in('processing','ready','rejected')),
 add column preview_keys text[] not null default '{}',
 add column page_count integer check(page_count between 1 and 30),
 add column processing_error text,
 add column processor_version text,
 add column processed_at timestamptz,
 add column lease_token uuid,
 add column lease_until timestamptz,
 add column processing_attempts integer not null default 0;
create function public.gp_source_quarantine() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if exists(select 1 from public.parking_scene_sources where listing_id=new.listing_id group by listing_id having count(*)>=10) then raise exception 'SOURCE_LIMIT';end if;
 new.processing_state='processing';new.preview_keys='{}';new.page_count=null;new.processing_error=null;new.processor_version=null;new.processed_at=null;new.lease_token=null;new.lease_until=null;new.processing_attempts=0;return new;
end;$$;
create trigger gp_source_quarantine before insert on public.parking_scene_sources for each row execute function public.gp_source_quarantine();
-- Serialize source admission per listing to enforce the count under concurrency.
create function public.gp_source_admission_lock() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin perform 1 from listings where id=new.listing_id for update;return new;end;$$;
create trigger gp_source_admission_0 before insert on public.parking_scene_sources for each row execute function public.gp_source_admission_lock();
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['application/pdf','image/webp','image/png'] where id='scene-sources';
create function public.gp_source_claim(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare s parking_scene_sources;t uuid:=gen_random_uuid();begin
 select * into s from parking_scene_sources where id=p_id for update;
 if not found or s.processing_state<>'processing' or s.processing_attempts>=3 or s.lease_until>now() then raise exception 'SOURCE_NOT_CLAIMABLE';end if;
 update parking_scene_sources set lease_token=t,lease_until=now()+interval '2 minutes',processing_attempts=processing_attempts+1 where id=p_id;
 return jsonb_build_object('id',s.id,'objectKey',s.object_key,'sha256',s.sha256,'mime',s.mime,'token',t);
end;$$;
create function public.gp_source_complete(p_id uuid,p_token uuid,p_ready boolean,p_previews text[],p_pages integer,p_version text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare s parking_scene_sources;k text;expected text;idx integer:=0;begin
 select * into s from parking_scene_sources where id=p_id for update;
 if not found or p_token is null or s.lease_token is distinct from p_token or s.lease_until is null or s.lease_until<=now() or s.processing_state<>'processing' then raise exception 'SOURCE_LEASE';end if;
 if p_ready is true then
 if p_version is distinct from 'gp-source-raster/1' or p_pages is null or p_pages not between 1 and 30 or cardinality(p_previews) is distinct from least(p_pages,3) then raise exception 'SOURCE_RESULT';end if;
 foreach k in array p_previews loop
 idx=idx+1;expected=regexp_replace(s.object_key,'\.(pdf|webp)$','')||'.preview-'||idx||'.png';
 if k is distinct from expected or not exists(select 1 from storage.objects where bucket_id='scene-sources' and name=k) then raise exception 'SOURCE_PREVIEW';end if;
 end loop;
 end if;
 update parking_scene_sources set processing_state=case when p_ready is true then 'ready' else 'rejected' end,preview_keys=case when p_ready is true then p_previews else '{}'::text[] end,page_count=case when p_ready is true then p_pages else null end,processing_error=case when p_ready is true then null else 'SOURCE_REJECTED' end,processor_version='gp-source-raster/1',processed_at=now(),lease_token=null,lease_until=null where id=p_id;
end;$$;
drop policy gp_scene_source_download on storage.objects;
create policy gp_scene_source_download on storage.objects for select to authenticated using(bucket_id='scene-sources' and gp_active() and exists(select 1 from public.parking_scene_sources s where s.processing_state='ready' and (s.object_key=name or name=any(s.preview_keys)) and (s.owner_id=auth.uid() or gp_moderation_allowed())));
alter function public.gp_scene_create(uuid,jsonb,uuid[],boolean) rename to gp_scene_create_before_sources;
create function public.gp_scene_create(p_listing_id uuid,p_manifest jsonb,p_evidence_ids uuid[],p_rights_attested boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not gp_verified() or not exists(select 1 from listings where id=p_listing_id and (seller_id=auth.uid() or gp_moderation_allowed())) then raise exception 'FORBIDDEN';end if;
 if coalesce(cardinality(p_evidence_ids),0)<1 or (select count(*) from parking_scene_sources where id=any(p_evidence_ids) and listing_id=p_listing_id and processing_state='ready')<>cardinality(p_evidence_ids) then raise exception 'SOURCE_NOT_READY';end if;
 return gp_scene_create_before_sources(p_listing_id,p_manifest,p_evidence_ids,p_rights_attested);end;$$;
alter function public.gp_scene_review(uuid,integer,text,jsonb,text) rename to gp_scene_review_before_sources;
create function public.gp_scene_review(p_id uuid,p_version integer,p_decision text,p_checks jsonb default null,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare ids uuid[];begin
 if not gp_moderation_allowed() then raise exception 'FORBIDDEN';end if;
 if p_decision='approve' then select evidence_ids into ids from parking_scenes where id=p_id;if (select count(*) from parking_scene_sources where id=any(ids) and processing_state='ready')<>cardinality(ids) then raise exception 'SOURCE_NOT_READY';end if;end if;
 return gp_scene_review_before_sources(p_id,p_version,p_decision,p_checks,p_reason);end;$$;
revoke all on function public.gp_source_quarantine(),public.gp_source_admission_lock(),public.gp_source_claim(uuid),public.gp_source_complete(uuid,uuid,boolean,text[],integer,text),public.gp_scene_create_before_sources(uuid,jsonb,uuid[],boolean),public.gp_scene_review_before_sources(uuid,integer,text,jsonb,text),public.gp_scene_create(uuid,jsonb,uuid[],boolean),public.gp_scene_review(uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.gp_source_claim(uuid),public.gp_source_complete(uuid,uuid,boolean,text[],integer,text) to service_role;
grant execute on function public.gp_scene_create(uuid,jsonb,uuid[],boolean),public.gp_scene_review(uuid,integer,text,jsonb,text) to authenticated;
-- Export requests never archive quarantined originals. Existing queued exports are
-- revalidated by the operator export worker immediately before reading sources.
alter function public.gp_export_request() rename to gp_export_request_before_sources;
create function public.gp_export_request() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;previews jsonb;begin
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;
 if exists(select 1 from parking_scene_sources where owner_id=auth.uid() and uploader_id=auth.uid() and processing_state<>'ready') then raise exception 'EXPORT_SOURCE_NOT_READY';end if;
 result=gp_export_request_before_sources();
 select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'kind','preview','bucket','scene-sources','objectKey',k,'mime','image/png')),'[]') into previews from parking_scene_sources x cross join lateral unnest(x.preview_keys) k where x.owner_id=auth.uid() and x.uploader_id=auth.uid() and x.processing_state='ready';
 update gp_private.export_jobs set files=files||previews where id=(result->>'id')::uuid;
 if (select jsonb_array_length(files) from gp_private.export_jobs where id=(result->>'id')::uuid)>250 then raise exception 'EXPORT_TOO_LARGE';end if;
 return result;end;$$;
revoke all on function public.gp_export_request_before_sources(),public.gp_export_request() from public,anon,authenticated;
grant execute on function public.gp_export_request() to authenticated;
