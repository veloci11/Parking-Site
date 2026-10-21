-- 010: blocking applies to the interlocutor across every listing/thread.
begin;
create function public.gp_pair_blocked(p_first uuid,p_second uuid) returns boolean language sql volatile security definer set search_path=public,pg_temp as $$select exists(select 1 from conversation_blocks b join conversations c on c.id=b.conversation_id where (c.buyer_id=p_first and c.seller_id=p_second) or (c.buyer_id=p_second and c.seller_id=p_first))$$;
create function public.gp_pair_lock(p_first uuid,p_second uuid) returns void language sql volatile security definer set search_path=public,pg_temp as $$select pg_advisory_xact_lock(hashtextextended('gp:pair:'||least(p_first::text,p_second::text)||':'||greatest(p_first::text,p_second::text),0))$$;
create or replace function public.gp_conversation_block_state(p_conversation_id uuid) returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$declare c conversations;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 select * into c from conversations where id=p_conversation_id;
 if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('blockedByMe',exists(select 1 from conversation_blocks b join conversations other on other.id=b.conversation_id where b.user_id=auth.uid() and ((other.buyer_id=c.buyer_id and other.seller_id=c.seller_id) or (other.buyer_id=c.seller_id and other.seller_id=c.buyer_id))),'blocked',gp_pair_blocked(c.buyer_id,c.seller_id));end;$$;
create or replace function public.gp_set_conversation_block(p_conversation_id uuid,p_blocked boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 if p_blocked is null then raise exception 'VALIDATION_ERROR';end if;
 select * into c from conversations where id=p_conversation_id;
 if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'FORBIDDEN';end if;
 perform gp_pair_lock(c.buyer_id,c.seller_id);
 if p_blocked then insert into conversation_blocks(conversation_id,user_id) values(c.id,auth.uid()) on conflict do nothing;
 else delete from conversation_blocks b using conversations other where b.conversation_id=other.id and b.user_id=auth.uid() and ((other.buyer_id=c.buyer_id and other.seller_id=c.seller_id) or (other.buyer_id=c.seller_id and other.seller_id=c.buyer_id));end if;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),case when p_blocked then 'conversation.block' else 'conversation.unblock' end,c.id::text,'scope=interlocutor');
 return gp_conversation_block_state(c.id);end;$$;
create or replace function public.gp_conversation_send_guard(p_conversation_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c conversations;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 select * into c from conversations where id=p_conversation_id;
 if not found or auth.uid() not in(c.buyer_id,c.seller_id) then raise exception 'FORBIDDEN';end if;
 perform gp_pair_lock(c.buyer_id,c.seller_id);
 -- VOLATILE helper sees blocks committed while the pair lock was awaited.
 if gp_pair_blocked(c.buyer_id,c.seller_id) then raise exception 'CONVERSATION_BLOCKED';end if;
 perform 1 from conversations where id=c.id for update;
 end;$$;
alter function public.gp_contact(uuid) rename to gp_contact_v9;
create function public.gp_contact(p_listing_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare seller uuid;begin
 if not gp_verified() then raise exception 'EMAIL_UNVERIFIED';end if;
 select l.seller_id into seller from listings l join published_listings p on p.id=l.id where l.id=p_listing_id;
 if not found then raise exception 'NOT_FOUND';end if;
 perform gp_pair_lock(auth.uid(),seller);
 if gp_pair_blocked(auth.uid(),seller) then raise exception 'CONVERSATION_BLOCKED';end if;
 return gp_contact_v9(p_listing_id);end;$$;
revoke all on function public.gp_pair_blocked(uuid,uuid),public.gp_pair_lock(uuid,uuid),public.gp_contact_v9(uuid),public.gp_contact(uuid) from public,anon,authenticated;
grant execute on function public.gp_contact(uuid) to authenticated;
commit;
