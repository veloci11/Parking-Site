-- 034: all application transitions removing an active admin share one lock.
-- No account, role, status, grant, policy, or receipt is changed by installation.
begin;
create or replace function public.gp_admin_user_decision(p_id uuid,p_version integer,p_reason text,p_status text default null,p_role text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare target_status account_statuses;target_role text;new_role text;new_status text;l listings;value jsonb;begin
 if not gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if p_id=auth.uid() then raise exception 'FORBIDDEN';end if;
 if p_reason is null or length(btrim(p_reason)) not between 15 and 2000 or (p_status is null and p_role is null) or (p_status is not null and p_status not in ('active','suspended')) or (p_role is not null and p_role not in ('member','moderator','admin')) then raise exception 'VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:admin-management',0));
 -- The actor may have changed while waiting for the shared transition lock.
 if not gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
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

-- 031 keeps the public wrapper and its private modeling-note cleanup unchanged.
create or replace function public.gp_privacy_request_deletion_before_modeling(p_receipt_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare u uuid=auth.uid();r gp_private.privacy_requests;begin
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;
 if p_receipt_hash is null or p_receipt_hash!~'^[a-f0-9]{64}$' then raise exception 'VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:admin-management',0));
 -- Recheck the actor after a competing account transition has committed.
 if not gp_active() or not gp_privacy_recent_password() then raise exception 'REAUTH_REQUIRED';end if;
 if gp_role()='admin' and (select count(*) from app_roles a join account_statuses s using(user_id) where a.role='admin' and s.status='active')<=1 then raise exception 'LAST_ADMIN';end if;
 perform gp_delete_account_before_privacy();
 insert into gp_private.privacy_requests(user_id,receipt_hash) values(u,p_receipt_hash) returning * into r;
 insert into audit_events(actor_id,action,target_id) values(u,'privacy.deletion_requested',r.id::text);
 return jsonb_build_object('id',r.id,'state',r.state,'createdAt',r.created_at,'retainedCategories',r.retained_categories);end;$$;
commit;
