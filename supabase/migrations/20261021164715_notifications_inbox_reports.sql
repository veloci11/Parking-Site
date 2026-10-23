begin;
create schema if not exists gp_private;
create table gp_private.configuration(key text primary key,value jsonb not null);
alter table gp_private.configuration enable row level security;
insert into gp_private.configuration values('mfa_required','false'::jsonb);
revoke all on schema gp_private from public,anon,authenticated;
revoke all on gp_private.configuration from public,anon,authenticated;
create or replace function public.gp_moderation_allowed() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select gp_verified() and gp_role() in ('moderator','admin') and (not coalesce((select value::boolean from gp_private.configuration where key='mfa_required'),false) or coalesce(auth.jwt()->>'aal'='aal2',false))$$;
create function public.gp_mfa_required() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select gp_active() and coalesce((select value::boolean from gp_private.configuration where key='mfa_required'),false)$$;

create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),type text not null,target_id text not null,title text not null,body text not null,url text not null,read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,type,target_id));
create index gp_notifications_user_time on public.notifications(user_id,created_at desc,id);
create table public.message_reads(user_id uuid not null references auth.users(id),message_id uuid not null references public.messages(id) on delete cascade,read_at timestamptz not null default now(),primary key(user_id,message_id));
create index gp_message_reads_message on public.message_reads(message_id,user_id);
alter table public.profiles add column email_notifications boolean not null default true;
alter table public.reports add column status text not null default 'open' check(status in ('open','reviewed','dismissed'));
alter table public.reports add column row_version integer not null default 1;
alter table public.reports add column decision_reason text;
alter table public.reports add column decided_by uuid references auth.users(id);
alter table public.reports add column decided_at timestamptz;
alter table public.notification_outbox add column lease_token uuid;
alter table public.notification_outbox add column lease_until timestamptz;
alter table public.notification_outbox add column sent_at timestamptz;
alter table public.notification_outbox add column last_error_code text;
alter table public.notification_outbox add column previewed_at timestamptz;
create index gp_outbox_pending on public.notification_outbox(status,next_run_at,created_at);
create function public.gp_notification_content(p_type text,p_target text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare title text;body text;url text;c uuid;begin
 title=case p_type when 'message' then 'Un nouveau message vous attend' when 'conversation' then 'Un acheteur souhaite vous contacter' when 'visit' then 'Une demande de visite vous attend' when 'visit_decision' then 'Votre demande de visite a été mise à jour' when 'moderation' then 'Votre annonce a été examinée' else 'Une mise à jour est disponible' end;
 body='Consultez votre espace GP pour retrouver les informations et poursuivre votre échange.';
 if p_type='message' then select conversation_id into c from messages where id::text=p_target;
 elsif p_type='conversation' then select id into c from conversations where id::text=p_target;
 elsif p_type in ('visit','visit_decision') then select conversation_id into c from visit_requests where id::text=split_part(p_target,':',1);
 end if;
 url=case when c is not null then '/compte/messages/'||c when p_type='moderation' then '/compte/annonces' else '/compte' end;
 return jsonb_build_object('title',title,'body',body,'url',url);end;$$;
create function public.gp_outbox_notification() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare content jsonb;begin
 content=gp_notification_content(new.type,new.target_id);insert into notifications(user_id,type,target_id,title,body,url,created_at) values(new.user_id,new.type,new.target_id,content->>'title',content->>'body',content->>'url',new.created_at) on conflict(user_id,type,target_id) do nothing;return new;end;$$;
create trigger gp_outbox_inbox after insert on public.notification_outbox for each row execute function public.gp_outbox_notification();
insert into public.notifications(user_id,type,target_id,title,body,url,created_at) select o.user_id,o.type,o.target_id,c->>'title',c->>'body',c->>'url',o.created_at from public.notification_outbox o cross join lateral public.gp_notification_content(o.type,o.target_id)c on conflict(user_id,type,target_id) do nothing;
create function public.gp_visit_notice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;recipient uuid;begin
 select * into c from conversations where id=new.conversation_id;recipient=case when auth.uid()=c.buyer_id then c.seller_id else c.buyer_id end;
 insert into notification_outbox(user_id,type,target_id) values(recipient,'visit_decision',new.id||':'||new.row_version) on conflict do nothing;return new;end;$$;
create trigger gp_visit_inbox after update on public.visit_requests for each row when(new.row_version<>old.row_version) execute function public.gp_visit_notice();
create function public.gp_report_rate_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if auth.uid() is not null then perform gp_limit('report',10,3600);end if;return new;end;$$;
create trigger gp_report_rate before insert on public.reports for each row execute function public.gp_report_rate_guard();
create function public.gp_notifications_read(p_ids uuid[] default null) returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare affected integer;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;if array_length(p_ids,1)>100 then raise exception 'VALIDATION_ERROR';end if;
 update notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_ids is null or id=any(p_ids));get diagnostics affected=row_count;return affected;end;$$;
create function public.gp_messages_read(p_conversation_id uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare affected integer;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;if not exists(select 1 from conversations c where c.id=p_conversation_id and auth.uid() in(c.buyer_id,c.seller_id)) then raise exception 'NOT_FOUND';end if;
 insert into message_reads(user_id,message_id) select auth.uid(),m.id from messages m where m.conversation_id=p_conversation_id and m.sender_id<>auth.uid() on conflict do nothing;get diagnostics affected=row_count;
 update notifications set read_at=now() where user_id=auth.uid() and read_at is null and url='/compte/messages/'||p_conversation_id;return affected;end;$$;
create or replace function public.gp_conversations() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'listingId',c.listing_id,'listingTitle',coalesce(l.last_published->>'title',l.draft->>'title'),'otherName',p.name,'updatedAt',c.updated_at,'unread',(select count(*) from messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and not exists(select 1 from message_reads r where r.message_id=m.id and r.user_id=auth.uid()))) order by c.updated_at desc),'[]') from conversations c join listings l on l.id=c.listing_id join profiles p on p.user_id=case when c.buyer_id=auth.uid() then c.seller_id else c.buyer_id end where gp_active() and auth.uid() in(c.buyer_id,c.seller_id) $$;
create function public.gp_report_decision(p_id uuid,p_status text,p_reason text,p_version integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r reports;begin
 if not gp_moderation_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if coalesce(p_status,'') not in ('reviewed','dismissed') or coalesce(length(trim(p_reason)),0) not between 5 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 select * into r from reports where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;if p_version is null or r.row_version<>p_version then raise exception 'VERSION_CONFLICT';end if;
 update reports set status=p_status,decision_reason=trim(p_reason),decided_by=auth.uid(),decided_at=now(),row_version=row_version+1 where id=p_id returning * into r;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'report.'||p_status,r.id::text,trim(p_reason));return to_jsonb(r);end;$$;
-- These worker RPCs are service-role only; never callable with a browser/member key.
create function public.gp_claim_notifications(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path=public,pg_temp as $$begin
 update notification_outbox set status='uncertain',last_error_code='LEASE_EXPIRED_REVIEW_REQUIRED',lease_token=null,lease_until=null where status='processing' and lease_until<now();
 return query with picked as(select id from notification_outbox where status='pending' and next_run_at<=now() order by created_at for update skip locked limit least(25,greatest(1,p_limit))) update notification_outbox o set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 from picked p where o.id=p.id returning o.*;end;$$;
create function public.gp_finish_notification(p_id uuid,p_lease_token uuid,p_status text,p_error_code text default null) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare changed integer;begin
 if coalesce(p_status,'') not in ('sent','pending','failed','suppressed','uncertain') or coalesce(length(p_error_code),0)>80 then raise exception 'VALIDATION_ERROR';end if;
 update notification_outbox set status=case when p_status='pending' and attempts>=5 then 'failed' else p_status end,last_error_code=p_error_code,sent_at=case when p_status='sent' then now() else sent_at end,next_run_at=case when p_status='pending' then now()+make_interval(secs=>least(3600,60*power(2,greatest(0,attempts-1))::integer)) else next_run_at end,lease_token=null,lease_until=null where id=p_id and lease_token=p_lease_token and status='processing';get diagnostics changed=row_count;return changed=1;end;$$;
alter table public.notifications enable row level security;alter table public.message_reads enable row level security;
create policy own_notifications on public.notifications for select to authenticated using(user_id=(select auth.uid()) and (select gp_active()));
create policy own_message_reads on public.message_reads for select to authenticated using(user_id=(select auth.uid()) and (select gp_active()));
create policy moderator_reports on public.reports for select to authenticated using((select gp_moderation_allowed()));
revoke all on public.notifications,public.message_reads from anon,authenticated;
grant select on public.notifications,public.message_reads to authenticated;
grant update(email_notifications) on public.profiles to authenticated;
revoke execute on function public.gp_visit_notice(),public.gp_report_rate_guard() from public,anon,authenticated;
revoke execute on function public.gp_notification_content(text,text),public.gp_outbox_notification(),public.gp_notifications_read(uuid[]),public.gp_messages_read(uuid),public.gp_report_decision(uuid,text,text,integer),public.gp_claim_notifications(integer),public.gp_finish_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gp_notifications_read(uuid[]),public.gp_messages_read(uuid),public.gp_report_decision(uuid,text,text,integer) to authenticated;
grant execute on function public.gp_claim_notifications(integer),public.gp_finish_notification(uuid,uuid,text,text),public.gp_notification_content(text,text) to service_role;
-- Gate privileged moderation at the database boundary as well as in Next.
alter function public.gp_moderate(uuid,text,integer,text) rename to gp_moderate_core;
create function public.gp_moderate(p_id uuid,p_decision text,p_version integer,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin if not gp_moderation_allowed() then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;return gp_moderate_core(p_id,p_decision,p_version,p_reason);end;$$;
revoke execute on function public.gp_moderate_core(uuid,text,integer,text),public.gp_moderation_allowed(),public.gp_mfa_required(),public.gp_moderate(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.gp_moderation_allowed(),public.gp_mfa_required(),public.gp_moderate(uuid,text,integer,text) to authenticated;
alter policy own_listing on public.listings using(gp_active() and (seller_id=auth.uid() or gp_moderation_allowed()));
alter policy own_revision on public.listing_revisions using(gp_active() and exists(select 1 from listings l where l.id=listing_id and (l.seller_id=auth.uid() or gp_moderation_allowed())));
alter policy own_media on public.media_assets using(gp_active() and (owner_id=auth.uid() or gp_moderation_allowed()));
alter policy gp_private_read on storage.objects using(bucket_id='private-uploads' and gp_active() and ((storage.foldername(name))[1]=auth.uid()::text or gp_moderation_allowed()));
alter policy gp_reviewed_insert on storage.objects with check(bucket_id='public-approved' and gp_moderation_allowed());
create policy gp_approved_cleanup_read on storage.objects for select to authenticated using(bucket_id='public-approved' and gp_moderation_allowed() and not exists(select 1 from published_listings p where p.payload->'photos' ? ('/api/media/'||split_part(name,'.',1))));
-- Cleanup never deletes a source referenced by any draft or published revision.
create policy gp_private_cleanup on storage.objects for delete to authenticated using(bucket_id='private-uploads' and (storage.foldername(name))[1]=auth.uid()::text and gp_active() and not exists(select 1 from media_assets a join listings l on l.id=a.listing_id where a.object_key=name and (l.draft->'photos' ? ('/api/media/'||a.id) or coalesce(l.last_published->'photos','[]') ? ('/api/media/'||a.id) or exists(select 1 from listing_revisions r where r.listing_id=l.id and r.payload->'photos' ? ('/api/media/'||a.id)))));
create policy gp_approved_cleanup on storage.objects for delete to authenticated using(bucket_id='public-approved' and gp_moderation_allowed() and not exists(select 1 from published_listings p where p.payload->'photos' ? ('/api/media/'||split_part(name,'.',1))));
-- Keep the inbox/receipts private even if a future default privilege changes.
grant all on public.notifications,public.message_reads to service_role;
commit;
