-- 017: reports reveal only a frozen, explicitly reported context. No global message browsing.
begin;
create table public.context_reports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 target_type text not null check(target_type in ('conversation','message')),target_id uuid not null,
 conversation_id uuid not null references public.conversations(id),
 category text not null check(category in ('harassment','fraud','personal_data','spam','other')),
 reason text not null check(char_length(btrim(reason)) between 10 and 2000),
 client_request_id uuid not null,status text not null default 'open' check(status in ('open','reviewed','dismissed','appealed')),
 row_version integer not null default 1,decision_reason text,decided_at timestamptz,
 appeal_reason text check(appeal_reason is null or char_length(btrim(appeal_reason)) between 15 and 2000),appealed_at timestamptz,
 created_at timestamptz not null default now(),unique(user_id,target_type,target_id,category),unique(user_id,client_request_id)
);
create index gp_context_reports_created on public.context_reports(created_at desc,id);
alter table public.context_reports enable row level security;
revoke all on public.context_reports from public,anon,authenticated;
grant select on public.context_reports to authenticated;
create policy gp_own_context_reports on public.context_reports for select to authenticated using(user_id=(select auth.uid()) and (select gp_active()));
create table gp_private.context_report_evidence(report_id uuid primary key references public.context_reports(id) on delete cascade,snapshot jsonb not null);
create table gp_private.context_report_decisions(id uuid primary key default gen_random_uuid(),report_id uuid not null references public.context_reports(id) on delete cascade,actor_id uuid not null references auth.users(id),decision text not null,reason text not null,created_at timestamptz not null default now());
alter table gp_private.context_report_evidence enable row level security;
alter table gp_private.context_report_decisions enable row level security;
revoke all on gp_private.context_report_evidence,gp_private.context_report_decisions from public,anon,authenticated;

create function public.gp_context_report_create(p_target_type text,p_target_id uuid,p_category text,p_reason text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c conversations;m messages;r context_reports;rows jsonb;old context_reports;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 if p_target_type is null or p_target_type not in ('conversation','message') or p_target_id is null or p_request_id is null or p_category is null or p_category not in ('harassment','fraud','personal_data','spam','other') or p_reason is null or char_length(btrim(p_reason)) not between 10 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 if p_target_type='message' then select * into m from messages where id=p_target_id;if not found then raise exception 'NOT_FOUND';end if;select * into c from conversations where id=m.conversation_id;
 else select * into c from conversations where id=p_target_id;end if;
 if c.id is null or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'NOT_FOUND';end if;
 -- Serialize duplicate reports from simultaneous retries without reserving multiple cases.
 perform pg_advisory_xact_lock(hashtextextended('gp:report:'||auth.uid()||':'||p_target_type||':'||p_target_id||':'||p_category,0));
 select * into old from context_reports where user_id=auth.uid() and (client_request_id=p_request_id or (target_type=p_target_type and target_id=p_target_id and category=p_category));
 if found then if old.target_type<>p_target_type or old.target_id<>p_target_id or old.category<>p_category then raise exception 'VERSION_CONFLICT';end if;return to_jsonb(old);end if;
 perform gp_limit('context_report',10,3600);
 if p_target_type='message' then rows=jsonb_build_array(jsonb_build_object('id',m.id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at));
 else select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'senderId',s.sender_id,'body',s.body,'createdAt',s.created_at) order by s.created_at,s.id),'[]') into rows from(select * from messages where conversation_id=c.id order by created_at desc,id desc limit 20)s;end if;
 insert into context_reports(user_id,target_type,target_id,conversation_id,category,reason,client_request_id) values(auth.uid(),p_target_type,p_target_id,c.id,p_category,btrim(p_reason),p_request_id) returning * into r;
 insert into gp_private.context_report_evidence values(r.id,jsonb_build_object('scope',case when p_target_type='message' then 'reported_message_only' else 'last_20_at_report_time' end,'conversationId',c.id,'listingId',c.listing_id,'messages',rows,'capturedAt',now()));
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'context_report.create',r.id::text);
 return to_jsonb(r);end;$$;

create function public.gp_context_reports_list(p_admin boolean default false,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 if p_admin is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR';end if;
 if p_admin and not gp_moderation_allowed() then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from(select * from context_reports where p_admin or user_id=auth.uid() order by created_at desc,id limit p_limit)r),'[]'::jsonb);end;$$;

create function public.gp_context_report_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r context_reports;s jsonb;history jsonb;allowed boolean;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 select * into r from context_reports where id=p_id;if not found then raise exception 'NOT_FOUND';end if;
 allowed=gp_moderation_allowed();if r.user_id<>auth.uid() and not allowed then raise exception 'NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('decision',decision,'reason',reason,'createdAt',created_at) order by created_at,id),'[]') into history from gp_private.context_report_decisions where report_id=r.id;
 if allowed then
 select snapshot into s from gp_private.context_report_evidence where report_id=r.id;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'context_report.context_read',r.id::text);
 else s=null;end if;
 return jsonb_build_object('report',to_jsonb(r),'evidence',s,'decisions',history);end;$$;

create function public.gp_context_report_decide(p_id uuid,p_version integer,p_status text,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r context_reports;begin
 if not gp_moderation_allowed() then raise exception 'FORBIDDEN';end if;
 if p_status is null or p_status not in ('reviewed','dismissed') or p_reason is null or char_length(btrim(p_reason)) not between 15 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 select * into r from context_reports where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_version is null or p_version<>r.row_version or r.status not in ('open','appealed') then raise exception 'VERSION_CONFLICT';end if;
 -- A moderator who reported the case cannot decide on their own report.
 if r.user_id=auth.uid() then raise exception 'FORBIDDEN';end if;
 update context_reports set status=p_status,row_version=row_version+1,decision_reason=btrim(p_reason),decided_at=now() where id=r.id returning * into r;
 insert into gp_private.context_report_decisions(report_id,actor_id,decision,reason) values(r.id,auth.uid(),p_status,btrim(p_reason));
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'context_report.'||p_status,r.id::text);
 insert into notifications(user_id,type,target_id,title,body,url) values(r.user_id,'report_decision',r.id||':'||r.row_version,'Décision sur votre signalement','Consultez le motif et les possibilités de réexamen dans votre espace.','/compte/signalements');
 return to_jsonb(r);end;$$;

create function public.gp_context_report_appeal(p_id uuid,p_version integer,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r context_reports;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 15 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 select * into r from context_reports where id=p_id for update;if not found or r.user_id<>auth.uid() then raise exception 'NOT_FOUND';end if;
 if p_version is null or p_version<>r.row_version or r.status not in ('reviewed','dismissed') or r.appeal_reason is not null then raise exception 'VERSION_CONFLICT';end if;
 perform gp_limit('context_report_appeal',10,3600);
 update context_reports set status='appealed',row_version=row_version+1,appeal_reason=btrim(p_reason),appealed_at=now() where id=r.id returning * into r;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),'context_report.appeal',r.id::text);
 return to_jsonb(r);end;$$;
revoke all on function public.gp_context_report_create(text,uuid,text,text,uuid),public.gp_context_reports_list(boolean,integer),public.gp_context_report_detail(uuid),public.gp_context_report_decide(uuid,integer,text,text),public.gp_context_report_appeal(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.gp_context_report_create(text,uuid,text,text,uuid),public.gp_context_reports_list(boolean,integer),public.gp_context_report_detail(uuid),public.gp_context_report_decide(uuid,integer,text,text),public.gp_context_report_appeal(uuid,integer,text) to authenticated;
commit;
