-- Additive admin-only lookup; existing gp_admin_users() and all decisions stay unchanged.
create function public.gp_admin_users_page(p_query text default '', p_after uuid default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; q text;
begin
  if not public.gp_admin_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED'; end if;
  if p_query is null or char_length(p_query)>80 or p_query ~ '[[:cntrl:]]'
     or p_limit is null or p_limit<1 or p_limit>100 then
    raise exception 'INVALID_INPUT';
  end if;
  q := lower(btrim(p_query));
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',user_id,'name',name,'role',role,'status',status,'version',row_version,'sellerType',seller_type
  ) order by user_id),'[]'::jsonb) into result
  from (
    select p.user_id,p.name,p.seller_type,r.role,s.status,s.row_version
    from public.profiles p
    join public.app_roles r using(user_id)
    join public.account_statuses s using(user_id)
    where (q='' or strpos(lower(p.name),q)>0 or strpos(p.user_id::text,q)>0)
      and (p_after is null or p.user_id>p_after)
    order by p.user_id limit p_limit+1
  ) page;
  return result;
end;
$$;
revoke all on function public.gp_admin_users_page(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.gp_admin_users_page(text,uuid,integer) to authenticated;
comment on function public.gp_admin_users_page(text,uuid,integer) is 'Admin-only keyset pages with one lookahead row; searches public name or account id, never email.';
