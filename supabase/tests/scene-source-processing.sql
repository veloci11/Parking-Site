-- Rollback-only. Inert metadata; no actual Storage file, email or durable fixture.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values('fd230000-0000-4000-8000-000000000001','{"name":"Source worker rollback"}',now());
insert into listings(id,seller_id,draft,lifecycle_state) values('fd230001-0000-4000-8000-000000000001','fd230000-0000-4000-8000-000000000001','{}','draft');
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,processing_state,preview_keys) values('fd230002-0000-4000-8000-000000000001','fd230001-0000-4000-8000-000000000001','fd230000-0000-4000-8000-000000000001','fd230000-0000-4000-8000-000000000001','fd230000-0000-4000-8000-000000000001/fd230001-0000-4000-8000-000000000001/fd230002-0000-4000-8000-000000000001.pdf','application/pdf',26214400,repeat('a',64),'ready',array['forged']);
select set_config('request.jwt.claim.sub','fd230000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fd230000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$begin
 if (select processing_state from parking_scene_sources where id='fd230002-0000-4000-8000-000000000001')<>'processing' then raise exception 'Client forged readiness';end if;
 if has_function_privilege('authenticated','gp_source_claim(uuid)','EXECUTE') or has_function_privilege('anon','gp_source_complete(uuid,uuid,boolean,text[],integer,text)','EXECUTE') or has_function_privilege('authenticated','gp_scene_create_before_sources(uuid,jsonb,uuid[],boolean)','EXECUTE') then raise exception 'Worker/core privilege leak';end if;
 begin perform gp_scene_create('fd230001-0000-4000-8000-000000000001','{}',array['fd230002-0000-4000-8000-000000000001'::uuid],true);raise exception 'Unready accepted';exception when others then if sqlerrm<>'SOURCE_NOT_READY' then raise;end if;end;
end;$$;
reset role;
select set_config('gp.qa.source.claim',(gp_source_claim('fd230002-0000-4000-8000-000000000001')->>'token'),true);
do $$begin
 begin perform gp_source_complete('fd230002-0000-4000-8000-000000000001',gen_random_uuid(),true,array['forged'],1,'gp-source-raster/1');raise exception 'Bad lease accepted';exception when others then if sqlerrm<>'SOURCE_LEASE' then raise;end if;end;
 begin perform gp_source_complete('fd230002-0000-4000-8000-000000000001',current_setting('gp.qa.source.claim')::uuid,true,array['forged'],1,'gp-source-raster/1');raise exception 'Bad preview accepted';exception when others then if sqlerrm<>'SOURCE_PREVIEW' then raise;end if;end;
end;$$;
insert into storage.objects(bucket_id,name,metadata) values('scene-sources','fd230000-0000-4000-8000-000000000001/fd230001-0000-4000-8000-000000000001/fd230002-0000-4000-8000-000000000001.preview-1.png','{"size":100}');
select gp_source_complete('fd230002-0000-4000-8000-000000000001',current_setting('gp.qa.source.claim')::uuid,true,array['fd230000-0000-4000-8000-000000000001/fd230001-0000-4000-8000-000000000001/fd230002-0000-4000-8000-000000000001.preview-1.png'],1,'gp-source-raster/1');
do $$begin if not exists(select 1 from parking_scene_sources where id='fd230002-0000-4000-8000-000000000001' and processing_state='ready' and page_count=1 and cardinality(preview_keys)=1 and lease_token is null) then raise exception 'Completion failed';end if;end;$$;
rollback;
