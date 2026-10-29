-- 024: sale or monthly rent for the whole lot. Legacy absence is sale. No rental payment flow.
begin;
alter function public.gp_validate_draft(jsonb,uuid,boolean) rename to gp_validate_draft_before_transactions;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p ? 'transactionType' and (jsonb_typeof(p->'transactionType') is distinct from 'string' or p->>'transactionType' not in ('sale','rent')) then raise exception 'TRANSACTION_TYPE_INVALID';end if;
 perform gp_validate_draft_before_transactions(p-'transactionType',p_id,p_submit);end;$$;
alter function public.gp_listing(uuid,text,jsonb,integer) rename to gp_listing_before_transactions;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;kind text;result jsonb;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 if p_payload ? 'transactionType' and (jsonb_typeof(p_payload->'transactionType') is distinct from 'string' or p_payload->>'transactionType' not in ('sale','rent')) then raise exception 'TRANSACTION_TYPE_INVALID';end if;
 if p_action<>'create' then select * into l from listings where id=p_id and seller_id=auth.uid() for update;if not found then raise exception 'NOT_FOUND';end if;end if;
 kind=coalesce(p_payload->>'transactionType',l.draft->>'transactionType','sale');
 result=gp_listing_before_transactions(p_id,p_action,p_payload-'transactionType',p_version);
 if p_action in ('create','update','submit') then
 result=result||jsonb_build_object('transactionType',kind);update listings set draft=result where id=p_id;
 if p_action='submit' then update listing_revisions set payload=result where listing_id=p_id and revision_no=(result->>'version')::integer;end if;
 end if;return result;end;$$;
alter function public.gp_public_payload(jsonb) rename to gp_public_payload_before_transactions;
create function public.gp_public_payload(p jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$select gp_public_payload_before_transactions(p-'transactionType')||jsonb_build_object('transactionType',coalesce(p->>'transactionType','sale'))$$;
-- Public projections gain an explicit default without rewriting private historical revisions.
update public.published_listings set payload=payload||'{"transactionType":"sale"}'::jsonb where not(payload ? 'transactionType');
-- Keep every existing spatial/mixed-lot/keyset rule, adding the transaction predicate inside base.
do $$declare definition text;changed text;begin
 select pg_get_functiondef('public.gp_catalog_page_v2(jsonb,jsonb,integer)'::regprocedure) into definition;
 changed=replace(definition,'ordering text;q text;kind text;','ordering text;q text;kind text;transaction_type text;');
 changed=replace(changed,$literal$'query','type','maxPrice'$literal$,$literal$'query','type','transactionType','maxPrice'$literal$);
 changed=replace(changed,$literal$array['query','type','sort','occupancy']$literal$,$literal$array['query','type','transactionType','sort','occupancy']$literal$);
 changed=replace(changed,$literal$kind=f->>'type';occupancy=$literal$, $literal$kind=f->>'type';transaction_type=coalesce(f->>'transactionType','sale');if transaction_type not in ('sale','rent') then raise exception 'VALIDATION_ERROR';end if;occupancy=$literal$);
 changed=replace(changed,'from published_listings p where p.created_at<=snapshot_at',$literal$from published_listings p where p.created_at<=snapshot_at and coalesce(p.payload->>'transactionType','sale')=transaction_type$literal$);
 if changed=definition or position('transaction_type text;' in changed)=0 or position($literal$coalesce(p.payload->>'transactionType','sale')=transaction_type$literal$ in changed)=0 then raise exception 'CATALOG_TRANSACTION_SHAPE';end if;
 execute changed;
end;$$;
revoke all on function public.gp_validate_draft_before_transactions(jsonb,uuid,boolean),public.gp_validate_draft(jsonb,uuid,boolean),public.gp_listing_before_transactions(uuid,text,jsonb,integer),public.gp_listing(uuid,text,jsonb,integer),public.gp_public_payload_before_transactions(jsonb),public.gp_public_payload(jsonb) from public,anon,authenticated;
grant execute on function public.gp_listing(uuid,text,jsonb,integer) to authenticated;
commit;
