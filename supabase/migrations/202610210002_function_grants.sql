-- Supabase default privileges can grant EXECUTE directly to anon/authenticated,
-- independently of PUBLIC. Revoke all three, then restore only reviewed RPC/policy helpers.
begin;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
grant execute on function public.gp_active(),public.gp_role(),public.gp_verified() to authenticated;
grant execute on function public.gp_listing(uuid,text,jsonb,integer),public.gp_moderate(uuid,text,integer,text),public.gp_contact(uuid),public.gp_message(uuid,text,text),public.gp_visit(uuid,text,timestamptz),public.gp_visit_decision(uuid,text,integer,timestamptz),public.gp_conversations(),public.gp_delete_account(),public.gp_storage_allowed(text) to authenticated;
grant execute on function public.gp_catalog(text,text,bigint,numeric,text,integer,integer) to anon,authenticated;
commit;
