-- Additive, bounded queue pages. The legacy RPC remains compatible.
create function public.gp_context_reports_page(
  p_admin boolean default false,
  p_status text default 'all',
  p_after jsonb default null,
  p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare after_id uuid; after_created timestamptz;
begin
  if not public.gp_active() then raise exception 'UNAUTHENTICATED'; end if;
  if p_admin is null or p_status is null or p_status not in ('all','open','reviewed','dismissed')
     or p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR'; end if;
  if p_admin and not public.gp_moderation_allowed() then raise exception 'FORBIDDEN'; end if;
  if p_after is not null then
    begin
      if jsonb_typeof(p_after) <> 'object' or not (p_after ? 'id' and p_after ? 'createdAt')
         or (p_after - 'id' - 'createdAt') <> '{}'::jsonb then raise exception 'VALIDATION_ERROR'; end if;
      after_id := (p_after->>'id')::uuid;
      after_created := (p_after->>'createdAt')::timestamptz;
      if after_id is null or after_created is null or not isfinite(after_created) then raise exception 'VALIDATION_ERROR'; end if;
    exception when others then raise exception 'VALIDATION_ERROR'; end;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
    select * from public.context_reports
    where (p_admin or user_id=auth.uid())
      and (p_status='all' or (p_status='open' and status in ('open','appealed')) or (p_status in ('reviewed','dismissed') and status=p_status))
      and (after_id is null or created_at<after_created or (created_at=after_created and id>after_id))
    order by created_at desc,id limit p_limit+1
  ) r),'[]'::jsonb);
end;
$$;
revoke all on function public.gp_context_reports_page(boolean,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.gp_context_reports_page(boolean,text,jsonb,integer) to authenticated;
comment on function public.gp_context_reports_page(boolean,text,jsonb,integer) is 'Owner or moderator report queue, filtered before pagination, one lookahead row; no private message evidence.';
