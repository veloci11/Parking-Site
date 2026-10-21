-- 018: immutable versioned declarations, one-use recovery grant consumption.
begin;
create function public.gp_auth_policy() returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$select jsonb_build_object('termsVersion','2026-10-21-v1-preparation','privacyVersion','2026-10-21-v1-preparation')$$;
create table public.terms_acceptances(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),terms_version text not null,privacy_version text not null,accepted_at timestamptz not null default now(),source text not null check(source in ('signup_declaration','authenticated_declaration')),unique(user_id,terms_version,privacy_version));
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from public,anon,authenticated;
grant select on public.terms_acceptances to authenticated;
create policy gp_own_terms_acceptances on public.terms_acceptances for select to authenticated using(user_id=(select auth.uid()) and (select gp_active()));
create function gp_private.gp_capture_signup_terms() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare policy jsonb;begin
 policy=gp_auth_policy();
 if new.raw_user_meta_data->'termsAccepted'='true'::jsonb and new.raw_user_meta_data->>'termsVersion'=policy->>'termsVersion' and new.raw_user_meta_data->>'privacyVersion'=policy->>'privacyVersion' then
 insert into terms_acceptances(user_id,terms_version,privacy_version,source) values(new.id,policy->>'termsVersion',policy->>'privacyVersion','signup_declaration');
 insert into audit_events(actor_id,action,target_id) values(new.id,'auth.terms_accepted',new.id::text);
 end if;return new;end;$$;
create trigger gp_terms_signup_created after insert on auth.users for each row execute function gp_private.gp_capture_signup_terms();
create function public.gp_terms_status() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare policy jsonb;accepted terms_acceptances;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;policy=gp_auth_policy();select * into accepted from terms_acceptances where user_id=auth.uid() and terms_version=policy->>'termsVersion' and privacy_version=policy->>'privacyVersion';return policy||jsonb_build_object('accepted',accepted.id is not null,'acceptedAt',accepted.accepted_at);end;$$;
create function public.gp_accept_terms(p_terms_version text,p_privacy_version text,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare policy jsonb;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;policy=gp_auth_policy();
 if p_confirmed is distinct from true or p_terms_version is distinct from policy->>'termsVersion' or p_privacy_version is distinct from policy->>'privacyVersion' then raise exception 'TERMS_VERSION_CHANGED';end if;
 insert into terms_acceptances(user_id,terms_version,privacy_version,source) values(auth.uid(),p_terms_version,p_privacy_version,'authenticated_declaration') on conflict(user_id,terms_version,privacy_version) do nothing;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'auth.terms_accepted',auth.uid()::text);return gp_terms_status();end;$$;
create table gp_private.auth_grant_consumptions(nonce uuid primary key,user_id uuid not null references auth.users(id),session_id uuid not null,consumed_at timestamptz not null default now(),expires_at timestamptz not null);
alter table gp_private.auth_grant_consumptions enable row level security;
revoke all on gp_private.auth_grant_consumptions from public,anon,authenticated;
create index gp_auth_grant_expiry on gp_private.auth_grant_consumptions(expires_at);
create function public.gp_consume_recovery_grant(p_nonce uuid,p_session_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 if p_nonce is null or p_session_id is null or coalesce(auth.jwt()->>'session_id','')<>p_session_id::text then raise exception 'REAUTH_REQUIRED';end if;
 perform gp_limit('recovery_grant',5,600);
 begin insert into gp_private.auth_grant_consumptions(nonce,user_id,session_id,expires_at) values(p_nonce,auth.uid(),p_session_id,now()+interval '30 minutes');exception when unique_violation then raise exception 'RECOVERY_GRANT_USED';end;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'auth.recovery_grant_consumed',auth.uid()::text);end;$$;
revoke all on function public.gp_auth_policy(),gp_private.gp_capture_signup_terms(),public.gp_terms_status(),public.gp_accept_terms(text,text,boolean),public.gp_consume_recovery_grant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gp_auth_policy() to anon,authenticated;
grant execute on function public.gp_terms_status(),public.gp_accept_terms(text,text,boolean),public.gp_consume_recovery_grant(uuid,uuid) to authenticated;
commit;
