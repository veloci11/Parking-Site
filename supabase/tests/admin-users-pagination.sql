-- Synthetic fixtures only, rolled back. Run in the disposable SQL test project.
begin;
do $$ begin
 if exists(select 1 from auth.users where id::text like 'f2490000-0000-4000-8000-%') then
   raise exception 'Pagination QA identifiers already exist; use an isolated project';
 end if;
end $$;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at)
select ('f2490000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 jsonb_build_object('name','Pagination QA '||case when i=135 then '100%' else i::text end), now()
from generate_series(1,135)i;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
 ('f2490000-0000-4000-8000-000000000999','{"name":"Role QA Admin"}',now()),
 ('f2490000-0000-4000-8000-000000000998','{"name":"Role QA Moderator"}',now()),
 ('f2490000-0000-4000-8000-000000000997','{"name":"Role QA Member"}',now());
update public.app_roles set role='admin' where user_id='f2490000-0000-4000-8000-000000000999';
update public.app_roles set role='moderator' where user_id='f2490000-0000-4000-8000-000000000998';
select 1/((not has_function_privilege('anon','public.gp_admin_users_page(text,uuid,integer)','execute'))::integer) as anon_cannot_call;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2490000-0000-4000-8000-000000000999',true);
select set_config('request.jwt.claims','{"sub":"f2490000-0000-4000-8000-000000000999","role":"authenticated","aal":"aal2"}',true);
select 1/((jsonb_array_length(public.gp_admin_users_page('Pagination QA',null,100))=101)::integer) as bounded_lookahead;
select 1/((jsonb_array_length(public.gp_admin_users_page('Pagination QA','f2490000-0000-4000-8000-000000000100',100))=35)::integer) as accounts_after_first_100;
select 1/((public.gp_admin_users_page('PAGINATION QA','f2490000-0000-4000-8000-000000000100',100)->0->>'id'='f2490000-0000-4000-8000-000000000101')::integer) as stable_cursor_order;
select 1/((jsonb_array_length(public.gp_admin_users_page('%',null,100))=1)::integer) as literal_percent_search;
select 1/((public.gp_admin_users_page('f2490000-0000-4000-8000-000000000135',null,50)->0->>'id'='f2490000-0000-4000-8000-000000000135')::integer) as exact_id_search;
select 1/((not exists(select 1 from jsonb_array_elements(public.gp_admin_users_page('Pagination QA',null,100)) where value ? 'email' or value ? 'password' or value ? 'raw_user_meta_data'))::integer) as no_private_fields;
do $$ begin
 begin perform public.gp_admin_users_page('',null,101); raise exception 'Expected limit refusal'; exception when others then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
 begin perform public.gp_admin_users_page(repeat('a',81),null,50); raise exception 'Expected query refusal'; exception when others then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
 begin perform public.gp_admin_users_page(null,null,50); raise exception 'Expected null refusal'; exception when others then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','f2490000-0000-4000-8000-000000000998',true);
select set_config('request.jwt.claims','{"sub":"f2490000-0000-4000-8000-000000000998","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform public.gp_admin_users_page('',null,50);raise exception 'Expected moderator refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end$$;
select set_config('request.jwt.claim.sub','f2490000-0000-4000-8000-000000000997',true);
select set_config('request.jwt.claims','{"sub":"f2490000-0000-4000-8000-000000000997","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform public.gp_admin_users_page('',null,50);raise exception 'Expected member refusal';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end$$;
rollback;
