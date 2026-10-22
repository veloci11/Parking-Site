-- 029: reserve the first administrator for an operator-approved, verified Auth email.
-- No email address, password or operator identity is embedded in this migration.
begin;
create table gp_private.owner_admin_bootstrap (
  email_sha256 text primary key check(email_sha256 ~ '^[a-f0-9]{64}$'),
  reason text not null check(char_length(btrim(reason)) between 15 and 2000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  check(expires_at>created_at),
  check(claimed_at is not null or claimed_by is null)
);
alter table gp_private.owner_admin_bootstrap enable row level security;
revoke all on gp_private.owner_admin_bootstrap from public,anon,authenticated;

create function gp_private.claim_owner_admin(p_user uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare account_email text;confirmed timestamptz;digest text;intent gp_private.owner_admin_bootstrap;begin
  select email,email_confirmed_at into account_email,confirmed from auth.users where id=p_user for update;
  if account_email is null or confirmed is null then return false;end if;
  digest=encode(sha256(convert_to(lower(btrim(account_email)),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('gp:first-owner-admin',0));
  select * into intent from gp_private.owner_admin_bootstrap where email_sha256=digest and claimed_at is null and expires_at>now() for update;
  if not found or not exists(select 1 from public.account_statuses where user_id=p_user and status='active') then return false;end if;
  if exists(select 1 from public.app_roles r join public.account_statuses s on s.user_id=r.user_id where r.role='admin' and s.status='active' and r.user_id<>p_user) then return false;end if;
  update public.app_roles set role='admin' where user_id=p_user;
  if not found then return false;end if;
  update gp_private.owner_admin_bootstrap set claimed_by=p_user,claimed_at=now() where email_sha256=digest;
  insert into public.audit_events(actor_id,action,target_id,detail,state_after)
    values(p_user,'account.owner_admin_bootstrap',p_user::text,intent.reason,'{"role":"admin","emailVerified":true}'::jsonb);
  return true;
end;$$;

create function gp_private.apply_owner_admin_bootstrap() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
  perform gp_private.claim_owner_admin(new.id);return new;
end;$$;
-- Alphabetical order follows gp_auth_user_created, which creates role/status rows.
create trigger gp_zz_owner_admin_bootstrap after insert or update of email,email_confirmed_at on auth.users
for each row execute function gp_private.apply_owner_admin_bootstrap();
revoke all on function gp_private.claim_owner_admin(uuid),gp_private.apply_owner_admin_bootstrap() from public,anon,authenticated;
commit;
