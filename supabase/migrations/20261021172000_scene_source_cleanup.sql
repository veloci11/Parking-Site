-- A source remains protected while its metadata exists. The storage object may
-- be removed only by its uploader, after the source registry no longer refers
-- to it. A definer helper checks all rows, including rows hidden by RLS.
begin;
create function public.gp_scene_source_can_cleanup(p_object_key text)
returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
 select gp_active()
   and auth.uid() is not null
   and split_part(p_object_key,'/',1)=auth.uid()::text
   and not exists (
     select 1 from parking_scene_sources s where s.object_key=p_object_key
   );
$$;
revoke all on function public.gp_scene_source_can_cleanup(text) from public,anon;
grant execute on function public.gp_scene_source_can_cleanup(text) to authenticated;
-- Storage DELETE resolves objects through SELECT; allow only these same
-- orphan objects to be found by their uploader, never another user.
create policy gp_scene_source_cleanup_lookup on storage.objects
for select to authenticated using (
 bucket_id='scene-sources' and public.gp_scene_source_can_cleanup(name)
);
create policy gp_scene_source_cleanup on storage.objects
for delete to authenticated using (
 bucket_id='scene-sources' and public.gp_scene_source_can_cleanup(name)
);
commit;
