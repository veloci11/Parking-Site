-- 012: declared seller profiles, protected administration and bounded private history.
begin;
alter table public.profiles add column seller_type text check(seller_type in ('private','professional'));
alter table public.account_statuses add column row_version integer not null default 1;
grant update(seller_type) on public.profiles to authenticated;
create or replace function public.gp_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 insert into profiles(user_id,name,created_at,seller_type) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Membre'),80),now(),case when new.raw_user_meta_data->>'sellerType' in ('private','professional') then new.raw_user_meta_data->>'sellerType' else null end);
 insert into account_statuses(user_id) values(new.id);insert into app_roles(user_id) values(new.id);return new;end;$$;
alter function public.gp_public_payload(jsonb) rename to gp_public_payload_v11;
create function public.gp_public_payload(p jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$select gp_public_payload_v11(p)||jsonb_build_object('sellerTypeSnapshot',case when p->>'sellerTypeSnapshot' in ('private','professional') then p->>'sellerTypeSnapshot' else null end)$$;
create or replace function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare k text;q jsonb;field text;begin
 perform gp_validate_draft_v7(p-'unitQuality'-'sellerTypeSnapshot',p_id,p_submit);
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
alter function public.gp_listing(uuid,text,jsonb,integer) rename to gp_listing_v11;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;seller_type text;begin
 result=gp_listing_v11(p_id,p_action,p_payload-'sellerTypeSnapshot',p_version);
 if p_action='submit' then
 select p.seller_type into seller_type from profiles p where user_id=auth.uid();result=result||jsonb_build_object('sellerTypeSnapshot',seller_type);
 update listings set draft=result where id=p_id;
 update listing_revisions set payload=result where listing_id=p_id and revision_no=(result->>'version')::integer;
 end if;return result;end;$$;
-- Approval and suspension take the same account row lock before listing locks.
alter function public.gp_moderate(uuid,text,integer,text) rename to gp_moderate_v11;
create function public.gp_moderate(p_id uuid,p_decision text,p_version integer,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare seller uuid;begin
 if not gp_moderation_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 select seller_id into seller from listings where id=p_id;if not found then raise exception 'NOT_FOUND';end if;
 perform 1 from account_statuses where user_id=seller for update;
 return gp_moderate_v11(p_id,p_decision,p_version,p_reason);end;$$;
create function public.gp_admin_allowed() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select gp_moderation_allowed() and gp_role()='admin'$$;
create function public.gp_admin_users() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',name,'role',role,'status',status,'version',row_version,'sellerType',seller_type) order by user_id),'[]') into result from (select p.user_id,p.name,p.seller_type,r.role,s.status,s.row_version from profiles p join app_roles r using(user_id) join account_statuses s using(user_id) order by user_id limit 100) t;return result;end;$$;
create function public.gp_admin_user_decision(p_id uuid,p_version integer,p_reason text,p_status text default null,p_role text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare target_status account_statuses;target_role text;new_role text;new_status text;l listings;value jsonb;begin
 if not gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if p_id=auth.uid() then raise exception 'FORBIDDEN';end if;
 if p_reason is null or length(btrim(p_reason)) not between 15 and 2000 or (p_status is null and p_role is null) or (p_status is not null and p_status not in ('active','suspended')) or (p_role is not null and p_role not in ('member','moderator','admin')) then raise exception 'VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:admin-management',0));
 if not exists(select 1 from app_roles r join account_statuses s using(user_id) where r.user_id=auth.uid() and r.role='admin' and s.status='active') then raise exception 'FORBIDDEN';end if;
 select * into target_status from account_statuses where user_id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_version is null or target_status.row_version<>p_version then raise exception 'VERSION_CONFLICT';end if;
 if target_status.status not in ('active','suspended') then raise exception 'VALIDATION_ERROR';end if;
 select role into target_role from app_roles where user_id=p_id;new_role=coalesce(p_role,target_role);new_status=coalesce(p_status,target_status.status);
 if target_role='admin' and target_status.status='active' and (new_role<>'admin' or new_status<>'active') and (select count(*) from app_roles r join account_statuses s using(user_id) where r.role='admin' and s.status='active')<=1 then raise exception 'LAST_ADMIN';end if;
 if new_status='suspended' then
 for l in select * from listings where seller_id=p_id and (last_published is not null or lifecycle_state='pending' or exists(select 1 from published_listings p where p.id=listings.id)) for update loop
 value=l.draft||jsonb_build_object('status','suspended','version',l.row_version+1,'updatedAt',now(),'sceneAvailable',false,'rejectionReason',btrim(p_reason));
 delete from published_listings where id=l.id;delete from active_space_claims where listing_id=l.id;
 update listings set draft=value,last_published=null,lifecycle_state='suspended',row_version=l.row_version+1,updated_at=now() where id=l.id;
 update listing_revisions set state='suspended',reason=btrim(p_reason),actor_id=auth.uid() where listing_id=l.id and state='pending';
 insert into notification_outbox(user_id,type,target_id) values(p_id,'moderation',l.id||':'||(l.row_version+1)) on conflict do nothing;
 end loop;end if;
 update app_roles set role=new_role where user_id=p_id;update account_statuses set status=new_status,row_version=row_version+1 where user_id=p_id;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'account.decision',p_id::text,btrim(p_reason));
 return jsonb_build_object('id',p_id,'name',(select name from profiles where user_id=p_id),'sellerType',(select seller_type from profiles where user_id=p_id),'role',new_role,'status',new_status,'version',target_status.row_version+1);end;$$;
create function public.gp_validate_history_after(p_after jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$begin
 if p_after is not null then if jsonb_typeof(p_after) is distinct from 'object' or coalesce(p_after->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_after->'createdAt') is distinct from 'string' then raise exception 'INVALID_CURSOR';end if;
 begin perform (p_after->>'createdAt')::timestamptz;exception when others then raise exception 'INVALID_CURSOR';end;
 end if;end;$$;
create function public.gp_messages_page(p_conversation_id uuid,p_after jsonb default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 if not exists(select 1 from conversations where id=p_conversation_id and auth.uid() in(buyer_id,seller_id)) then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR';end if;perform gp_validate_history_after(p_after);
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(t) order by created_at desc,id desc),'[]')) into result from(select id,conversation_id,sender_id,body,created_at from messages where conversation_id=p_conversation_id and (p_after is null or (created_at,id)<((p_after->>'createdAt')::timestamptz,(p_after->>'id')::uuid)) order by created_at desc,id desc limit p_limit+1)t;return result;end;$$;
create function public.gp_admin_audit_page(p_after jsonb default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR';end if;perform gp_validate_history_after(p_after);
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(t) order by created_at desc,id desc),'[]')) into result from(select id,actor_id,action,target_id,created_at from audit_events where (p_after is null or (created_at,id)<((p_after->>'createdAt')::timestamptz,(p_after->>'id')::uuid)) order by created_at desc,id desc limit p_limit+1)t;return result;end;$$;
revoke all on function public.gp_moderate_v11(uuid,text,integer,text),public.gp_moderate(uuid,text,integer,text),public.gp_new_user(),public.gp_public_payload_v11(jsonb),public.gp_public_payload(jsonb),public.gp_listing_v11(uuid,text,jsonb,integer),public.gp_listing(uuid,text,jsonb,integer),public.gp_admin_allowed(),public.gp_admin_users(),public.gp_admin_user_decision(uuid,integer,text,text,text),public.gp_validate_history_after(jsonb),public.gp_messages_page(uuid,jsonb,integer),public.gp_admin_audit_page(jsonb,integer) from public,anon,authenticated;
grant execute on function public.gp_moderate(uuid,text,integer,text),public.gp_listing(uuid,text,jsonb,integer),public.gp_admin_users(),public.gp_admin_user_decision(uuid,integer,text,text,text),public.gp_messages_page(uuid,jsonb,integer),public.gp_admin_audit_page(jsonb,integer) to authenticated;
commit;
