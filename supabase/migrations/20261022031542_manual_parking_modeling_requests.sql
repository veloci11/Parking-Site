-- 031: private requests for manual modeling. No generation, scene publication, payment or email.
begin;
create table public.parking_modeling_requests (
 listing_id uuid primary key references public.listings(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 note text not null default '' check(char_length(note)<=2000),
 status text not null default 'requested' check(status in('requested','in_progress','ready','declined')),
 requested_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 actor_id uuid references auth.users(id) on delete set null,
 row_version integer not null default 1 check(row_version>0)
);
create index gp_modeling_requests_queue on public.parking_modeling_requests(status,requested_at,listing_id);
create index gp_modeling_requests_owner on public.parking_modeling_requests(owner_id);
alter table public.parking_modeling_requests enable row level security;
revoke all on public.parking_modeling_requests from public,anon,authenticated;
-- Read-only SDK parity; owners cannot see other requests or staff attribution, and cannot write rows.
grant select(listing_id,note,status,requested_at,updated_at,row_version) on public.parking_modeling_requests to authenticated;
create policy gp_modeling_requests_read on public.parking_modeling_requests for select to authenticated using(
 gp_active() and (owner_id=(select auth.uid()) or (gp_role()='admin' and gp_moderation_allowed() and coalesce(auth.jwt()->>'aal','')='aal2'))
);
create function gp_private.modeling_request_payload(r public.parking_modeling_requests) returns jsonb language sql immutable set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('listingId',r.listing_id,'note',r.note,'status',r.status,'requestedAt',r.requested_at,'updatedAt',r.updated_at,'version',r.row_version)
$$;
create function public.gp_my_modeling_request(p_listing_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;u uuid=auth.uid();begin
 if u is null then raise exception 'UNAUTHENTICATED';end if;if not gp_active() then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.listings where id=p_listing_id and seller_id=u) then raise exception 'NOT_FOUND';end if;
 select gp_private.modeling_request_payload(r) into result from public.parking_modeling_requests r where r.listing_id=p_listing_id and r.owner_id=u;
 return result;end;$$;
create function public.gp_request_parking_modeling(p_listing_id uuid,p_note text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.parking_modeling_requests;u uuid=auth.uid();normalized text=btrim(coalesce(p_note,''));begin
 if u is null then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from public.account_statuses where user_id=u and status='active' for share;if not found then raise exception 'FORBIDDEN';end if;
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 if char_length(normalized)>2000 then raise exception 'MODELING_REQUEST_INVALID';end if;
 perform 1 from public.listings where id=p_listing_id and seller_id=u for share;if not found then raise exception 'NOT_FOUND';end if;
 insert into public.parking_modeling_requests(listing_id,owner_id,note) values(p_listing_id,u,normalized) on conflict(listing_id) do nothing returning * into r;
 if found then insert into public.audit_events(actor_id,action,target_id,detail,state_after) values(u,'modeling.requested',p_listing_id::text,'manual-modeling-v1','{"status":"requested","version":1}'::jsonb);
 else select * into r from public.parking_modeling_requests where listing_id=p_listing_id and owner_id=u;if not found then raise exception 'NOT_FOUND';end if;end if;
 return gp_private.modeling_request_payload(r);end;$$;
create function public.gp_admin_modeling_requests(p_status text default null,p_offset integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare requests jsonb;total bigint;begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if (p_status is not null and p_status not in('requested','in_progress','ready','declined')) or p_offset is null or p_offset not between 0 and 1000000 or p_limit is null or p_limit not between 1 and 100 then raise exception 'MODELING_REQUEST_INVALID';end if;
 select count(*) into total from public.parking_modeling_requests r where p_status is null or r.status=p_status;
 select coalesce(jsonb_agg(q.payload order by q.rank,q.requested_at,q.listing_id),'[]') into requests from(
 select r.listing_id,r.requested_at,case r.status when 'requested' then 0 when 'in_progress' then 1 when 'ready' then 2 else 3 end rank,
 gp_private.modeling_request_payload(r)||jsonb_build_object('ownerId',r.owner_id,'ownerName',coalesce(p.name,'Membre'),'listingTitle',coalesce(l.draft->>'title','')) payload
 from public.parking_modeling_requests r join public.listings l on l.id=r.listing_id left join public.profiles p on p.user_id=r.owner_id
 where p_status is null or r.status=p_status
 order by rank,r.requested_at,r.listing_id limit p_limit offset p_offset)q;
 return jsonb_build_object('requests',requests,'total',total,'offset',p_offset,'hasMore',p_offset+jsonb_array_length(requests)<total);end;$$;
create function public.gp_decide_modeling_request(p_listing_id uuid,p_status text,p_version integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.parking_modeling_requests;old_status text;begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 -- Serialize against staff suspension or role removal before changing the manual queue.
 perform 1 from public.app_roles ar join public.account_statuses st on st.user_id=ar.user_id where ar.user_id=auth.uid() and ar.role='admin' and st.status='active' for share of ar,st;
 if not found then raise exception 'FORBIDDEN';end if;
 if p_status is null or p_status not in('requested','in_progress','ready','declined') then raise exception 'MODELING_REQUEST_INVALID';end if;
 select * into r from public.parking_modeling_requests where listing_id=p_listing_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_version is null or p_version<>r.row_version then raise exception 'VERSION_CONFLICT';end if;
 if r.status<>p_status then
 old_status=r.status;
 update public.parking_modeling_requests set status=p_status,row_version=row_version+1,updated_at=now(),actor_id=auth.uid() where listing_id=p_listing_id returning * into r;
 insert into public.audit_events(actor_id,action,target_id,detail,state_before,state_after) values(auth.uid(),'modeling.status_changed',p_listing_id::text,'manual-modeling-v1',jsonb_build_object('status',old_status,'version',r.row_version-1),jsonb_build_object('status',r.status,'version',r.row_version));end if;
 return gp_private.modeling_request_payload(r)||jsonb_build_object('ownerId',r.owner_id,'ownerName',(select name from public.profiles where user_id=r.owner_id),'listingTitle',(select coalesce(draft->>'title','') from public.listings where id=r.listing_id));end;$$;
-- The note is the owner's private account data. Exports never include another owner's request.
alter function public.gp_privacy_export() rename to gp_privacy_export_before_modeling;
create function public.gp_privacy_export() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare result jsonb;begin
 result=gp_privacy_export_before_modeling();
 return result||jsonb_build_object('modelingRequests',coalesce((select jsonb_agg(gp_private.modeling_request_payload(r) order by r.requested_at,r.listing_id) from public.parking_modeling_requests r where r.owner_id=auth.uid()),'[]'));end;$$;
-- These operational notes have no retention need after a confirmed deletion request.
-- Existing021 still retains other documented categories and does not claim complete erasure.
alter function public.gp_privacy_request_deletion(text) rename to gp_privacy_request_deletion_before_modeling;
create function public.gp_privacy_request_deletion(p_receipt_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare result jsonb;u uuid=auth.uid();begin
 result=gp_privacy_request_deletion_before_modeling(p_receipt_hash);
 delete from public.parking_modeling_requests where owner_id=u;return result;end;$$;
revoke all on function gp_private.modeling_request_payload(public.parking_modeling_requests),public.gp_my_modeling_request(uuid),public.gp_request_parking_modeling(uuid,text),public.gp_admin_modeling_requests(text,integer,integer),public.gp_decide_modeling_request(uuid,text,integer),public.gp_privacy_export_before_modeling(),public.gp_privacy_export(),public.gp_privacy_request_deletion_before_modeling(text),public.gp_privacy_request_deletion(text) from public,anon,authenticated;
grant execute on function public.gp_my_modeling_request(uuid),public.gp_request_parking_modeling(uuid,text),public.gp_admin_modeling_requests(text,integer,integer),public.gp_decide_modeling_request(uuid,text,integer),public.gp_privacy_export(),public.gp_privacy_request_deletion(text) to authenticated;
commit;
