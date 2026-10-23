-- 030: moderated, versioned sale/monthly-rent offers per physical place. No payment flow.
begin;
create function public.gp_offers_normalize(p jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare kind text;price numeric;begin
 if p->>'pricingMode' is distinct from 'per_space' or jsonb_typeof(p->'spaces') is distinct from 'array' then return p;end if;
 select s->'offer'->>'transactionType' into kind from jsonb_array_elements(p->'spaces') with ordinality u(s,n) where s->'offer'->>'status'='available' order by n limit 1;
 kind=coalesce(kind,p->'spaces'->0->'offer'->>'transactionType',p->>'transactionType','sale');
 select min((s->'offer'->>'priceCents')::numeric) into price from jsonb_array_elements(p->'spaces')s where s->'offer'->>'status'='available' and s->'offer'->>'transactionType'=kind;
 return p||jsonb_build_object('transactionType',kind,'priceCents',coalesce(price,0));end;$$;
create function public.gp_validate_offers(p jsonb,p_submit boolean default false) returns void language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare s jsonb;o jsonb;k text;begin
 if p ? 'transactionType' and (jsonb_typeof(p->'transactionType') is distinct from 'string' or p->>'transactionType' not in ('sale','rent')) then raise exception 'TRANSACTION_TYPE_INVALID';end if;
 if p ? 'priceCents' then if jsonb_typeof(p->'priceCents') is distinct from 'number' then raise exception 'VALIDATION_ERROR';end if;if (p->>'priceCents')::numeric not between 0 and 10000000000 or trunc((p->>'priceCents')::numeric)<>(p->>'priceCents')::numeric then raise exception 'VALIDATION_ERROR';end if;end if;
 if p ? 'catalogMatch' or (p ? 'pricingMode' and (jsonb_typeof(p->'pricingMode') is distinct from 'string' or p->>'pricingMode' not in ('lot','per_space'))) then raise exception 'OFFER_INVALID';end if;
 if jsonb_typeof(p->'spaces') is distinct from 'array' then raise exception 'VALIDATION_ERROR';end if;
 for s in select * from jsonb_array_elements(p->'spaces') loop
 if jsonb_typeof(s) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 for k in select jsonb_object_keys(s) loop if k not in ('id','number','level','areaM2','lengthM','widthM','clearanceM','offer') then raise exception 'OFFER_INVALID';end if;end loop;
 if p->>'pricingMode' is distinct from 'per_space' then if s ? 'offer' then raise exception 'OFFER_INVALID';end if;continue;end if;
 if not(s ? 'offer') then if p_submit then raise exception 'OFFER_INVALID';end if;continue;end if;
 o=s->'offer';if jsonb_typeof(o) is distinct from 'object' then raise exception 'OFFER_INVALID';end if;
 for k in select jsonb_object_keys(o) loop if k not in ('transactionType','priceCents','status') then raise exception 'OFFER_INVALID';end if;end loop;
 if jsonb_typeof(o->'transactionType') is distinct from 'string' or o->>'transactionType' not in ('sale','rent') or jsonb_typeof(o->'status') is distinct from 'string' or o->>'status' not in ('available','reserved','sold','rented','withdrawn') or jsonb_typeof(o->'priceCents') is distinct from 'number' then raise exception 'OFFER_INVALID';end if;
 if (o->>'priceCents')::numeric not between 0 and 10000000000 or trunc((o->>'priceCents')::numeric)<>(o->>'priceCents')::numeric or (p_submit and (o->>'priceCents')::numeric<=0) or (o->>'status'='sold' and o->>'transactionType'<>'sale') or (o->>'status'='rented' and o->>'transactionType'<>'rent') then raise exception 'OFFER_INVALID';end if;
 end loop;
 if p_submit and p->>'pricingMode'='per_space' and not exists(select 1 from jsonb_array_elements(p->'spaces')u(value) where u.value->'offer'->>'status'='available') then raise exception 'OFFER_INVALID';end if;end;$$;
create function public.gp_offers_core(p jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$declare result jsonb;begin
 result=gp_offers_normalize(p)-'pricingMode';
 if jsonb_typeof(result->'spaces')='array' then result=jsonb_set(result,'{spaces}',coalesce((select jsonb_agg(s-'offer' order by n) from jsonb_array_elements(result->'spaces')with ordinality u(s,n)),'[]'));end if;return result;end;$$;
create function public.gp_offers_restore(p_result jsonb,p_candidate jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$declare result jsonb=p_result;begin
 if p_candidate ? 'pricingMode' then result=result||jsonb_build_object('pricingMode',p_candidate->'pricingMode');end if;
 if p_candidate->>'pricingMode'='per_space' then
 result=jsonb_set(result,'{spaces}',coalesce((select jsonb_agg((s-'offer')||case when c.value ? 'offer' then jsonb_build_object('offer',c.value->'offer') else '{}'::jsonb end order by n) from jsonb_array_elements(result->'spaces')with ordinality u(s,n) left join lateral(select value from jsonb_array_elements(p_candidate->'spaces') where value->>'id'=s->>'id')c on true),'[]'));
 end if;return gp_offers_normalize(result);end;$$;
alter function public.gp_validate_draft(jsonb,uuid,boolean) rename to gp_validate_draft_before_offers;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform gp_validate_offers(p,p_submit);perform gp_validate_draft_before_offers(gp_offers_core(p),p_id,p_submit);end;$$;
alter function public.gp_listing(uuid,text,jsonb,integer) rename to gp_listing_before_offers;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare l public.listings;candidate jsonb;result jsonb;core jsonb;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 if p_action='create' then candidate=p_payload;
 else select * into l from public.listings where id=p_id and seller_id=auth.uid() for update;if not found then raise exception 'NOT_FOUND';end if;candidate=l.draft;if p_action='update' then candidate=candidate||p_payload;end if;end if;
 if p_action in ('create','update','submit') then perform gp_validate_offers(candidate,p_action='submit');end if;
 core=p_payload-'pricingMode';
 if p_action in ('create','update') then
 if jsonb_typeof(core->'spaces')='array' then core=jsonb_set(core,'{spaces}',coalesce((select jsonb_agg(s-'offer' order by n) from jsonb_array_elements(core->'spaces')with ordinality u(s,n)),'[]'));end if;
 if candidate->>'pricingMode'='per_space' then candidate=gp_offers_normalize(candidate);core=core||jsonb_build_object('transactionType',candidate->'transactionType','priceCents',candidate->'priceCents');end if;
 end if;
 result=gp_listing_before_offers(p_id,p_action,core,p_version);
 if p_action in ('create','update','submit') then
 result=gp_offers_restore(result,candidate);perform gp_validate_offers(result,p_action='submit');update public.listings set draft=result where id=p_id;
 if p_action='submit' then update public.listing_revisions set payload=result where listing_id=p_id and revision_no=(result->>'version')::integer;end if;end if;return result;end;$$;
alter function public.gp_public_payload(jsonb) rename to gp_public_payload_before_offers;
create function public.gp_public_payload(p jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$declare result jsonb;begin
 result=gp_public_payload_before_offers(gp_offers_core(p));
 if p ? 'pricingMode' then result=result||jsonb_build_object('pricingMode',p->'pricingMode');end if;
 if p->>'pricingMode'='per_space' then result=jsonb_set(result,'{spaces}',coalesce((select jsonb_agg(s||case when p->'spaces'->(n::integer-1) ? 'offer' then jsonb_build_object('offer',p->'spaces'->(n::integer-1)->'offer') else '{}'::jsonb end order by n) from jsonb_array_elements(result->'spaces')with ordinality u(s,n)),'[]'));end if;return result;end;$$;
-- A commercial offer does not change physical identity. Keep existing unit/site links.
do $$declare definition text;changed text;begin
 select pg_get_functiondef('public.gp_registry_mapped(uuid,jsonb)'::regprocedure) into definition;
 changed=replace(definition,$old$md5((p_snapshot->'spaces')::text)$old$,$new$md5((gp_offers_core(p_snapshot)->'spaces')::text)$new$);
 if changed=definition then raise exception 'REGISTRY_OFFERS_MAPPED_SHAPE';end if;execute changed;
 select pg_get_functiondef('public.gp_registry_command_before_common_plans(jsonb)'::regprocedure) into definition;
 changed=replace(definition,$old$md5((l.draft->'spaces')::text)$old$,$new$md5((gp_offers_core(l.draft)->'spaces')::text)$new$);
 if changed=definition then raise exception 'REGISTRY_OFFERS_COMMAND_SHAPE';end if;execute changed;
end;$$;
-- Pure public-payload computation: each price/type/area/level predicate shares one unit.
create function public.gp_catalog_offer_match(p jsonb,f jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare kind text=coalesce(f->>'transactionType','sale');minimum numeric=(f->>'minPrice')::numeric;maximum numeric=(f->>'maxPrice')::numeric;min_area numeric=(f->>'minArea')::numeric;typ text=f->>'type';covered boolean=(f->>'covered')::boolean;closed boolean=(f->>'closed')::boolean;lev integer=(f->>'level')::integer;matches jsonb;price numeric;area numeric;all_covered boolean;all_closed boolean;begin
 if p->>'pricingMode'='per_space' then
 select jsonb_agg(s order by n),min((s->'offer'->>'priceCents')::numeric),case when bool_and(s->>'areaM2' is not null) then min((s->>'areaM2')::numeric) else null end into matches,price,area from jsonb_array_elements(p->'spaces')with ordinality u(s,n)
 cross join lateral(select case when p->>'type'='mixed' then p->'commercialDetails'->'units'->(s->>'id')->>'type' else p->>'type' end k)t
 where s->'offer'->>'status'='available' and s->'offer'->>'transactionType'=kind
 and (minimum is null or (s->'offer'->>'priceCents')::numeric>=minimum) and (maximum is null or (s->'offer'->>'priceCents')::numeric<=maximum)
 and (min_area is null or (s->>'areaM2')::numeric>=min_area) and (typ is null or typ='mixed' and p->>'type'='mixed' or t.k=typ)
 and (covered is null or (coalesce(t.k,'unknown') in ('covered','box'))=covered) and (closed is null or (coalesce(t.k,'unknown')='box')=closed) and (lev is null or (s->>'level')::integer=lev);
 if matches is null then return null;end if;
 else
 matches=p->'spaces';price=(p->>'priceCents')::numeric;
 select case when bool_and(s->>'areaM2' is not null) then min((s->>'areaM2')::numeric) else null end,coalesce(bool_and(coalesce(k,'unknown') in ('covered','box')),false),coalesce(bool_and(coalesce(k,'unknown')='box'),false) into area,all_covered,all_closed from jsonb_array_elements(matches)s cross join lateral(select case when p->>'type'='mixed' then p->'commercialDetails'->'units'->(s->>'id')->>'type' else p->>'type' end k)t;
 if coalesce(p->>'transactionType','sale')<>kind or (minimum is not null and price<minimum) or (maximum is not null and price>maximum) or (min_area is not null and (area is null or area<min_area)) or (typ is not null and p->>'type'<>typ and not(p->>'type'='mixed' and exists(select 1 from jsonb_array_elements(matches)s where p->'commercialDetails'->'units'->(s->>'id')->>'type'=typ))) or (covered is not null and covered<>all_covered) or (closed is not null and closed<>all_closed) or (lev is not null and not exists(select 1 from jsonb_array_elements(matches)s where (s->>'level')::integer=lev)) then return null;end if;
 end if;
 return jsonb_build_object('priceCents',price,'areaM2',area,'spaceCount',jsonb_array_length(matches),'spaceIds',(select jsonb_agg(s->'id' order by n) from jsonb_array_elements(matches)with ordinality u(s,n)));end;$$;
-- Retain the existing input checks, RLS/region, effective scene, spatial and keyset code.
do $$declare definition text;changed text;line text;begin
 select pg_get_functiondef('public.gp_catalog_page_v2(jsonb,jsonb,integer)'::regprocedure) into definition;
 changed=replace(definition,$s$(p.payload->>'priceCents')::bigint price_cents,jsonb_array_length(p.payload->'spaces') space_count,$s$,$s$(offer_match.value->>'priceCents')::bigint price_cents,(offer_match.value->>'spaceCount')::integer space_count,offer_match.value->'spaceIds' matched_space_ids,$s$);
 changed=replace(changed,$s$case when exists(select 1 from jsonb_array_elements(p.payload->'spaces')u where u->>'areaM2' is null) then null else (select min((u->>'areaM2')::numeric) from jsonb_array_elements(p.payload->'spaces')u) end area_m2,$s$,$s$(offer_match.value->>'areaM2')::numeric area_m2,$s$);
 changed=replace(changed,$s$from published_listings p where p.created_at<=snapshot_at and coalesce(p.payload->>'transactionType','sale')=transaction_type$s$,$s$from published_listings p cross join lateral(select gp_catalog_offer_match(p.payload,f) value) offer_match where p.created_at<=snapshot_at and offer_match.value is not null$s$);
 foreach line in array string_to_array(changed,E'\n') loop
 if line like ' and (kind is null%' or line like ' and (minimum is null%' or line like ' and (covered is null%' or line like ' and (level_no is null%' then changed=replace(changed,line,' -- Unit offer criteria are evaluated together by gp_catalog_offer_match.');end if;end loop;
 changed=replace(changed,$s$jsonb_set(payload,'{sceneAvailable}',to_jsonb(scene_ready))$s$,$s$(jsonb_set(payload,'{sceneAvailable}',to_jsonb(scene_ready))||jsonb_build_object('catalogMatch',jsonb_build_object('transactionType',transaction_type,'priceCents',price_cents,'spaceIds',matched_space_ids)))$s$);
 if changed=definition or position('offer_match.value is not null' in changed)=0 or position('matched_space_ids' in changed)=0 or position($s$gp_effective_scene_available(id)$s$ in changed)=0 or position($s$coalesce(p.payload->>'transactionType','sale')=transaction_type$s$ in changed)>0 or position(' and (kind is null' in changed)>0 or position(' and (minimum is null' in changed)>0 or position(' and (covered is null' in changed)>0 or position(' and (level_no is null' in changed)>0 then raise exception 'CATALOG_OFFERS_SHAPE';end if;
 execute changed;end;$$;
revoke all on function public.gp_offers_normalize(jsonb),public.gp_validate_offers(jsonb,boolean),public.gp_offers_core(jsonb),public.gp_offers_restore(jsonb,jsonb),public.gp_validate_draft_before_offers(jsonb,uuid,boolean),public.gp_validate_draft(jsonb,uuid,boolean),public.gp_listing_before_offers(uuid,text,jsonb,integer),public.gp_listing(uuid,text,jsonb,integer),public.gp_public_payload_before_offers(jsonb),public.gp_public_payload(jsonb),public.gp_catalog_offer_match(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gp_listing(uuid,text,jsonb,integer) to authenticated;
grant execute on function public.gp_catalog_offer_match(jsonb,jsonb) to anon,authenticated;
commit;
