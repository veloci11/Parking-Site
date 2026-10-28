-- Synthetic fixtures only. Run in the disposable SQL test project, never live.
-- No messages are sent; the entire fixture is rolled back.
begin;

do $$ begin
  if exists(select 1 from auth.users where id::text like 'f2790000-0000-4000-8000-%')
     or exists(select 1 from public.context_reports where id::text like 'f2794000-0000-4000-8000-%') then
    raise exception 'Report pagination QA identifiers already exist; use an isolated project';
  end if;
end $$;

insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
  ('f2790000-0000-4000-8000-000000000001','{"name":"Report queue QA owner"}',now()),
  ('f2790000-0000-4000-8000-000000000002','{"name":"Report queue QA seller"}',now()),
  ('f2790000-0000-4000-8000-000000000003','{"name":"Report queue QA outsider"}',now()),
  ('f2790000-0000-4000-8000-000000000004','{"name":"Report queue QA moderator"}',now());
update public.app_roles set role='moderator' where user_id='f2790000-0000-4000-8000-000000000004';
insert into public.listings(id,seller_id,draft) values
  ('f2791000-0000-4000-8000-000000000001','f2790000-0000-4000-8000-000000000002','{}');
insert into public.conversations(id,listing_id,buyer_id,seller_id) values
  ('f2792000-0000-4000-8000-000000000001','f2791000-0000-4000-8000-000000000001',
   'f2790000-0000-4000-8000-000000000001','f2790000-0000-4000-8000-000000000002');
insert into public.messages(id,conversation_id,sender_id,body,client_request_id,created_at)
select ('f2793000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'f2792000-0000-4000-8000-000000000001','f2790000-0000-4000-8000-000000000002',
  'PRIVATE_REPORT_QUEUE_MESSAGE_'||i,'qa-report-queue-message-'||i,'2026-10-01T12:00:00Z'::timestamptz
from generate_series(1,140) i;

-- Insert directly as the fixture owner: the create RPC intentionally rate-limits
-- normal users. Distinct message targets preserve the real deduplication rules.
insert into public.context_reports(
  id,user_id,target_type,target_id,conversation_id,category,reason,
  client_request_id,status,created_at
)
select ('f2794000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  case when i=140 then 'f2790000-0000-4000-8000-000000000002'::uuid
       else 'f2790000-0000-4000-8000-000000000001'::uuid end,
  'message',('f2793000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'f2792000-0000-4000-8000-000000000001','other','Synthetic report queue fixture '||i,
  ('f2795000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  case when i<=135 then 'reviewed' when i=137 then 'appealed'
       when i=138 then 'dismissed' else 'open' end,
  case when i<=110 then '2026-10-27T12:00:00Z'::timestamptz
       when i<=135 then '2026-10-26T12:00:00Z'::timestamptz
       else '2026-10-20T12:00:00Z'::timestamptz-(i-136)*interval '1 day' end
from generate_series(1,140) i;
insert into gp_private.context_report_evidence(report_id,snapshot)
select id,jsonb_build_object('messages',jsonb_build_array(jsonb_build_object(
  'id',target_id,'body','PRIVATE_REPORT_QUEUE_EVIDENCE')))
from public.context_reports where id::text like 'f2794000-0000-4000-8000-%';

select 1/((not has_function_privilege('anon','public.gp_context_reports_page(boolean,text,jsonb,integer)','execute'))::integer) as anon_has_no_execute;
set local role anon;
do $$ begin
  begin
    perform public.gp_context_reports_page(false,'all',null,25);
    raise exception 'Expected anonymous execute refusal';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','f2790000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f2790000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);

select 1/((jsonb_array_length(public.gp_context_reports_page(true,'all',null,100))=101)::integer) as bounded_lookahead;
select 1/((jsonb_array_length(public.gp_context_reports_page(true,'all',
  '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000100"}',100))=40)::integer) as reports_after_first_100;
select 1/((public.gp_context_reports_page(true,'all',
  '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000100"}',100)->0->>'id'
  ='f2794000-0000-4000-8000-000000000101')::integer) as tied_timestamp_cursor_is_exclusive;
select 1/((public.gp_context_reports_page(true,'all',
  '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000110"}',100)->0->>'id'
  ='f2794000-0000-4000-8000-000000000111')::integer) as cursor_crosses_to_older_timestamp;

-- Exercise the consumer contract: display p_limit rows and use the last displayed
-- row, not the lookahead row, as the next cursor. All 140 must appear once.
do $$
declare
  page jsonb; item jsonb; after_cursor jsonb:=null; last_displayed jsonb;
  seen uuid[]:='{}'; expected uuid[]; rounds integer:=0;
begin
  loop
    page:=public.gp_context_reports_page(true,'all',after_cursor,25);
    rounds:=rounds+1;
    if jsonb_array_length(page)>26 or rounds>8 then raise exception 'Unbounded report pagination'; end if;
    for item in select value from jsonb_array_elements(page) with ordinality as page_rows(value,position) where position<=25 order by position loop
      if (item->>'id')::uuid=any(seen) then raise exception 'Duplicate report across cursor pages'; end if;
      seen:=array_append(seen,(item->>'id')::uuid);
      last_displayed:=item;
    end loop;
    exit when jsonb_array_length(page)<=25;
    after_cursor:=jsonb_build_object('id',last_displayed->>'id','createdAt',last_displayed->>'created_at');
  end loop;
  select array_agg(('f2794000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid order by i)
  into expected from generate_series(1,140) i;
  if seen is distinct from expected then raise exception 'Cursor pages omitted or reordered reports'; end if;
end $$;

-- The previous unfiltered first page contains only reviewed reports. Filtering
-- on the server must still expose the older open and appealed cases immediately.
select 1/((not exists(select 1 from jsonb_array_elements(public.gp_context_reports_list(true,100)) where value->>'status' in ('open','appealed')))::integer) as old_unfiltered_page_hides_open_cases;
select 1/((jsonb_array_length(public.gp_context_reports_page(true,'open',null,100))=4)::integer) as old_open_and_appealed_cases_visible;
select 1/((public.gp_context_reports_page(true,'open',null,100)->0->>'id'='f2794000-0000-4000-8000-000000000136')::integer) as oldest_pending_queue_is_not_truncated;
select 1/((public.gp_context_reports_page(true,'open',null,100)->1->>'status'='appealed')::integer) as appeals_in_open_queue;
select 1/((jsonb_array_length(public.gp_context_reports_page(true,'reviewed',null,100))=101)::integer) as reviewed_queue_lookahead;
select 1/((jsonb_array_length(public.gp_context_reports_page(true,'reviewed',
  '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000100"}',100))=35)::integer) as reviewed_queue_continues;
select 1/((jsonb_array_length(public.gp_context_reports_page(true,'dismissed',null,100))=1
  and public.gp_context_reports_page(true,'dismissed',null,100)->0->>'id'='f2794000-0000-4000-8000-000000000138')::integer) as dismissed_queue_is_filtered;
select 1/((jsonb_array_length(public.gp_context_reports_page(true,'open',
  '{"createdAt":"2026-10-16T12:00:00Z","id":"f2794000-0000-4000-8000-000000000140"}',25))=0)::integer) as terminal_cursor_returns_empty_array;
select 1/((not exists(select 1 from jsonb_array_elements(public.gp_context_reports_page(true,'all',null,100))
  where value ? 'evidence' or value ? 'messages' or value ? 'snapshot' or value ? 'body'
    or value::text like '%PRIVATE_REPORT_QUEUE_%'))::integer) as no_private_messages_in_admin_queue;
select 1/((jsonb_array_length(public.gp_context_reports_page(false,'all',null,100))=0)::integer) as moderator_owner_mode_does_not_expand_scope;

-- Invalid parameters are explicit errors, never silently unfiltered queries.
do $$
declare invalid_cursor jsonb;
begin
  begin perform public.gp_context_reports_page(null,'all',null,25); raise exception 'Expected null admin refusal';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  begin perform public.gp_context_reports_page(true,null,null,25); raise exception 'Expected null status refusal';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  begin perform public.gp_context_reports_page(true,'appealed',null,25); raise exception 'Expected invalid status refusal';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  begin perform public.gp_context_reports_page(true,'all',null,0); raise exception 'Expected zero limit refusal';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  begin perform public.gp_context_reports_page(true,'all',null,101); raise exception 'Expected excessive limit refusal';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  begin perform public.gp_context_reports_page(true,'all',null,null); raise exception 'Expected null limit refusal';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  for invalid_cursor in select value from jsonb_array_elements('[
    null, [], {}, {"id":"f2794000-0000-4000-8000-000000000100"},
    {"createdAt":"2026-10-27T12:00:00Z"},
    {"id":null,"createdAt":"2026-10-27T12:00:00Z"},
    {"id":"not-a-uuid","createdAt":"2026-10-27T12:00:00Z"},
    {"id":"f2794000-0000-4000-8000-000000000100","createdAt":null},
    {"id":"f2794000-0000-4000-8000-000000000100","createdAt":"not-a-date"},
    {"id":"f2794000-0000-4000-8000-000000000100","createdAt":"infinity"},
    {"id":"f2794000-0000-4000-8000-000000000100","createdAt":"2026-10-27T12:00:00Z","status":"open"}
  ]'::jsonb) loop
    begin perform public.gp_context_reports_page(true,'all',invalid_cursor,25); raise exception 'Expected invalid cursor refusal';
    exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  end loop;
end $$;

-- A member cannot select the administration scope, even with a valid cursor.
select set_config('request.jwt.claim.sub','f2790000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2790000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$ begin
  begin perform public.gp_context_reports_page(true,'open',null,25); raise exception 'Expected member admin refusal';
  exception when others then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
  begin perform public.gp_context_reports_page(true,'all',
    '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000100"}',25);
    raise exception 'Expected member cursor admin refusal';
  exception when others then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
end $$;
select 1/((jsonb_array_length(public.gp_context_reports_page(false,'all',null,100))=101)::integer) as owner_queue_lookahead;
select 1/((jsonb_array_length(public.gp_context_reports_page(false,'all',
  '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000100"}',100))=39)::integer) as owner_remaining_queue_excludes_other_reporter;
select 1/((jsonb_array_length(public.gp_context_reports_page(false,'open',null,100))=3)::integer) as owner_open_queue_isolated;
select 1/((not exists(select 1 from jsonb_array_elements(public.gp_context_reports_page(false,'all',
  '{"createdAt":"2026-10-27T12:00:00Z","id":"f2794000-0000-4000-8000-000000000100"}',100))
  where value->>'user_id'<>'f2790000-0000-4000-8000-000000000001'
     or value ? 'evidence' or value ? 'messages' or value::text like '%PRIVATE_REPORT_QUEUE_%'))::integer) as owner_page_has_only_own_reports_without_evidence;

select set_config('request.jwt.claim.sub','f2790000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2790000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select 1/((jsonb_array_length(public.gp_context_reports_page(false,'all',null,100))=1
  and public.gp_context_reports_page(false,'all',null,100)->0->>'id'='f2794000-0000-4000-8000-000000000140')::integer) as seller_sees_only_own_report;

select set_config('request.jwt.claim.sub','f2790000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f2790000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select 1/((public.gp_context_reports_page(false,'all',null,25)='[]'::jsonb)::integer) as outsider_queue_empty;
reset role;
update public.account_statuses set status='suspended' where user_id='f2790000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
  begin perform public.gp_context_reports_page(false,'all',null,25); raise exception 'Expected inactive account refusal';
  exception when others then if sqlerrm<>'UNAUTHENTICATED' then raise; end if; end;
end $$;
reset role;

rollback;
