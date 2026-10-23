-- 020: correlate business state changes with application diagnostics without logging content.
begin;
create function public.gp_audit_request_id() returns uuid language plpgsql stable set search_path=public,pg_temp as $$declare v text;begin
 v=nullif(current_setting('request.headers',true),'')::jsonb->>'x-gp-request-id';
 if coalesce(v,'')~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return v::uuid;end if;return null;
 exception when others then return null;end;$$;
alter table public.audit_events add column request_id uuid default public.gp_audit_request_id();
alter table public.audit_events add column state_before jsonb;
alter table public.audit_events add column state_after jsonb;
create function public.gp_audit_listing_state() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if old.row_version is distinct from new.row_version or old.lifecycle_state is distinct from new.lifecycle_state then
 insert into audit_events(action,target_id,state_before,state_after) values('listing.state',new.id::text,
 jsonb_build_object('version',old.row_version,'status',old.lifecycle_state,'priceCents',old.draft->'priceCents','spaceCount',jsonb_array_length(old.draft->'spaces')),
 jsonb_build_object('version',new.row_version,'status',new.lifecycle_state,'priceCents',new.draft->'priceCents','spaceCount',jsonb_array_length(new.draft->'spaces')));end if;return new;end;$$;
create trigger gp_audit_listing_state after update on public.listings for each row execute function public.gp_audit_listing_state();
create function public.gp_audit_account_state() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare a jsonb;b jsonb;begin
 if tg_table_name='app_roles' then a=jsonb_build_object('role',old.role);b=jsonb_build_object('role',new.role);
 else a=jsonb_build_object('status',old.status,'version',old.row_version);b=jsonb_build_object('status',new.status,'version',new.row_version);end if;
 if a is distinct from b then insert into audit_events(action,target_id,state_before,state_after) values('account.state',new.user_id::text,a,b);end if;return new;end;$$;
create trigger gp_audit_account_role after update on public.app_roles for each row execute function public.gp_audit_account_state();
create trigger gp_audit_account_status after update on public.account_statuses for each row execute function public.gp_audit_account_state();
create or replace function public.gp_admin_audit_page(p_after jsonb default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR';end if;perform gp_validate_history_after(p_after);
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(t) order by created_at desc,id desc),'[]')) into result from(select id,actor_id,action,target_id,created_at,request_id,state_before,state_after from audit_events where (p_after is null or (created_at,id)<((p_after->>'createdAt')::timestamptz,(p_after->>'id')::uuid)) order by created_at desc,id desc limit p_limit+1)t;return result;end;$$;
revoke all on function public.gp_audit_request_id(),public.gp_audit_listing_state(),public.gp_audit_account_state() from public,anon,authenticated;
grant execute on function public.gp_audit_request_id() to service_role;
commit;
