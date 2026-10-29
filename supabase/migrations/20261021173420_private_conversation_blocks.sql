-- 009: a participant may block exchanges without removing their history.
begin;
create table public.conversation_blocks(conversation_id uuid not null references public.conversations(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(conversation_id,user_id));
alter table public.conversation_blocks enable row level security;
revoke all on public.conversation_blocks from public,anon,authenticated;
grant select on public.conversation_blocks to authenticated;
create policy own_conversation_blocks on public.conversation_blocks for select to authenticated using(user_id=(select auth.uid()) and (select gp_active()) and exists(select 1 from conversations c where c.id=conversation_id and auth.uid() in(c.buyer_id,c.seller_id)));
create function public.gp_conversation_block_state(p_conversation_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare c conversations;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 select * into c from conversations where id=p_conversation_id;
 if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('blockedByMe',exists(select 1 from conversation_blocks where conversation_id=c.id and user_id=auth.uid()),'blocked',exists(select 1 from conversation_blocks where conversation_id=c.id));end;$$;
create function public.gp_set_conversation_block(p_conversation_id uuid,p_blocked boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 if p_blocked is null then raise exception 'VALIDATION_ERROR';end if;
 select * into c from conversations where id=p_conversation_id for update;
 if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'FORBIDDEN';end if;
 if p_blocked then insert into conversation_blocks(conversation_id,user_id) values(c.id,auth.uid()) on conflict do nothing;
 else delete from conversation_blocks where conversation_id=c.id and user_id=auth.uid();end if;
 insert into audit_events(actor_id,action,target_id) values(auth.uid(),case when p_blocked then 'conversation.block' else 'conversation.unblock' end,c.id::text);
 return gp_conversation_block_state(c.id);end;$$;
create function public.gp_conversation_send_guard(p_conversation_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 -- All block/send mutations serialize on this row: a committed block wins against later sends.
 select * into c from conversations where id=p_conversation_id for update;
 if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from conversation_blocks where conversation_id=c.id) then raise exception 'CONVERSATION_BLOCKED';end if;end;$$;
alter function public.gp_message(uuid,text,text) rename to gp_message_v8;
alter function public.gp_visit(uuid,text,timestamptz) rename to gp_visit_v8;
alter function public.gp_visit_decision(uuid,text,integer,timestamptz) rename to gp_visit_decision_v8;
alter function public.gp_conversations() rename to gp_conversations_v8;
create function public.gp_message(p_conversation_id uuid,p_body text,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin perform gp_conversation_send_guard(p_conversation_id);return gp_message_v8(p_conversation_id,p_body,p_request_id);end;$$;
create function public.gp_visit(p_conversation_id uuid,p_request_id text,p_proposed_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin perform gp_conversation_send_guard(p_conversation_id);return gp_visit_v8(p_conversation_id,p_request_id,p_proposed_at);end;$$;
create function public.gp_visit_decision(p_id uuid,p_action text,p_version integer,p_confirmed_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare cid uuid;begin
 if p_action<>'cancel' then select conversation_id into cid from visit_requests where id=p_id;perform gp_conversation_send_guard(cid);end if;
 return gp_visit_decision_v8(p_id,p_action,p_version,p_confirmed_at);end;$$;
create function public.gp_conversations() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select coalesce(jsonb_agg(value||gp_conversation_block_state((value->>'id')::uuid) order by ordinality),'[]'::jsonb) from jsonb_array_elements(gp_conversations_v8()) with ordinality$$;
revoke all on function public.gp_conversation_block_state(uuid),public.gp_set_conversation_block(uuid,boolean),public.gp_conversation_send_guard(uuid),public.gp_message_v8(uuid,text,text),public.gp_visit_v8(uuid,text,timestamptz),public.gp_visit_decision_v8(uuid,text,integer,timestamptz),public.gp_conversations_v8(),public.gp_message(uuid,text,text),public.gp_visit(uuid,text,timestamptz),public.gp_visit_decision(uuid,text,integer,timestamptz),public.gp_conversations() from public,anon,authenticated;
grant execute on function public.gp_conversation_block_state(uuid),public.gp_set_conversation_block(uuid,boolean),public.gp_message(uuid,text,text),public.gp_visit(uuid,text,timestamptz),public.gp_visit_decision(uuid,text,integer,timestamptz),public.gp_conversations() to authenticated;
commit;
