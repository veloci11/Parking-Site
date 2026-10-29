-- Rollback-only diagnostic metadata QA. No email or Storage operation.
begin;
select set_config('request.headers','{"x-gp-request-id":"fd200000-0000-4000-8000-000000000009"}',true);
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('fd200000-0000-4000-8000-000000000001','{"name":"Audit rollback administrator"}',now()),
('fd200000-0000-4000-8000-000000000002','{"name":"Audit rollback seller"}',now());
update app_roles set role='admin' where user_id='fd200000-0000-4000-8000-000000000001';
insert into listings(id,seller_id,draft)values('fd200001-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000002','{"spaces":[],"priceCents":100,"title":"DO-NOT-LOG-PRIVATE-TITLE"}');
update listings set row_version=2,draft=draft||'{"priceCents":200,"description":"DO-NOT-LOG-PRIVATE-DESCRIPTION"}' where id='fd200001-0000-4000-8000-000000000001';
insert into audit_events(action,target_id,detail)values('qa.private_detail','fd200001-0000-4000-8000-000000000001','DO-NOT-LOG-PRIVATE-DETAIL');
select set_config('request.jwt.claim.sub','fd200000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fd200000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
do $$declare page jsonb;row audit_events;begin
 select * into row from audit_events where target_id='fd200001-0000-4000-8000-000000000001' and action='listing.state';
 if row.request_id is distinct from 'fd200000-0000-4000-8000-000000000009'::uuid or row.state_before->>'priceCents'<>'100' or row.state_after->>'priceCents'<>'200' then raise exception 'correlation_or_state_missing';end if;
 page=gp_admin_audit_page();
 if page::text like '%DO-NOT-LOG%' or exists(select 1 from jsonb_array_elements(page->'items') e where e ? 'detail' or e ? 'description') then raise exception 'private_content_in_journal';end if;
 if has_function_privilege('authenticated','gp_audit_request_id()','EXECUTE') or has_function_privilege('anon','gp_audit_listing_state()','EXECUTE') then raise exception 'private_audit_helper_exposed';end if;
end;$$;
select set_config('request.headers','{"x-gp-request-id":"invalid"}',true);
do $$begin if gp_audit_request_id() is not null then raise exception 'invalid_correlation_accepted';end if;end;$$;
select 1 as audit_private_content_excluded;
rollback;
