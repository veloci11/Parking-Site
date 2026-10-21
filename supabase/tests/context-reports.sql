-- Execute after 017. All fixtures and decisions are rolled back; no email is sent.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f1700000-0000-4000-8000-000000000001','{"name":"QA Acheteur"}',now()),
('f1700000-0000-4000-8000-000000000002','{"name":"QA Vendeur"}',now()),
('f1700000-0000-4000-8000-000000000003','{"name":"QA Tiers"}',now()),
('f1700000-0000-4000-8000-000000000004','{"name":"QA Modérateur"}',now());
update app_roles set role='moderator' where user_id='f1700000-0000-4000-8000-000000000004';
insert into listings(id,seller_id,draft) values('f1710000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002','{}');
insert into conversations(id,listing_id,buyer_id,seller_id) values('f1720000-0000-4000-8000-000000000001','f1710000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002');
insert into messages(id,conversation_id,sender_id,body,client_request_id,created_at) select ('f1730000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'f1720000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002','Message de recette '||i,'qa-context-message-'||i,now()-interval '1 hour'+i*interval '1 minute' from generate_series(1,25)i;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('gp.qa_context_report',(gp_context_report_create('message','f1730000-0000-4000-8000-000000000025','harassment','Ce message doit être examiné par la modération.','f1740000-0000-4000-8000-000000000001')->>'id'),true);
select 1/((gp_context_report_create('message','f1730000-0000-4000-8000-000000000025','harassment','Un motif différent ne doit pas créer une seconde alerte.','f1740000-0000-4000-8000-000000000002')->>'id'=current_setting('gp.qa_context_report'))::integer) as semantic_dedupe;
select 1/((gp_context_report_detail(current_setting('gp.qa_context_report')::uuid)->'evidence'='null'::jsonb)::integer) as reporter_no_private_snapshot;
select 1/((select count(*)=1 from context_reports)::integer) as owner_rls;
do $$begin begin perform snapshot from gp_private.context_report_evidence;raise exception 'Expected denied';exception when insufficient_privilege then null;end;begin perform gp_context_reports_list(true,100);raise exception 'Expected FORBIDDEN';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;end;$$;
select set_config('gp.qa_context_conversation',(gp_context_report_create('conversation','f1720000-0000-4000-8000-000000000001','fraud','Ce fil doit être examiné sur le contexte annoncé.','f1740000-0000-4000-8000-000000000003')->>'id'),true);
select set_config('request.jwt.claim.sub','f1700000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select 1/((select count(*)=0 from context_reports)::integer) as outsider_rls;
do $$begin begin perform gp_context_report_create('message','f1730000-0000-4000-8000-000000000025','fraud','Un tiers ne peut pas signaler un message privé.','f1740000-0000-4000-8000-000000000004');raise exception 'Expected NOT_FOUND';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;begin perform gp_context_report_detail(current_setting('gp.qa_context_report')::uuid);raise exception 'Expected NOT_FOUND';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1700000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select 1/((select count(*)=0 from messages)::integer) as moderator_no_global_message_browsing;
select 1/((jsonb_array_length(gp_context_reports_list(true,100))=2)::integer) as moderator_case_list;
select 1/((jsonb_array_length(gp_context_report_detail(current_setting('gp.qa_context_report')::uuid)->'evidence'->'messages')=1)::integer) as single_message_context;
select 1/((jsonb_array_length(gp_context_report_detail(current_setting('gp.qa_context_conversation')::uuid)->'evidence'->'messages')=20)::integer) as bounded_conversation_context;
do $$begin begin perform gp_context_report_detail('f1730000-0000-4000-8000-000000000024');raise exception 'Expected NOT_FOUND';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;begin perform gp_context_report_decide(current_setting('gp.qa_context_report')::uuid,null,'reviewed','Décision qui ne doit pas ignorer une version nulle.');raise exception 'Expected VERSION_CONFLICT';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select gp_context_report_decide(current_setting('gp.qa_context_report')::uuid,1,'reviewed','Le message signalé a été examiné dans le contexte transmis.')->>'status' as initial_decision;
select set_config('request.jwt.claim.sub','f1700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select 1/((gp_context_report_appeal(current_setting('gp.qa_context_report')::uuid,2,'Je demande le réexamen de cette décision avec cette précision.')->>'status'='appealed')::integer) as owner_appeal;
do $$begin begin perform gp_context_report_appeal(current_setting('gp.qa_context_report')::uuid,3,'Une seconde demande ne doit pas créer un recours doublon.');raise exception 'Expected VERSION_CONFLICT';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1700000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select gp_context_report_decide(current_setting('gp.qa_context_report')::uuid,3,'dismissed','Le second examen est terminé avec une décision motivée.')->>'status' as final_decision;
reset role;
select 1/((select count(*)>=2 from audit_events where action='context_report.context_read' and target_id in(current_setting('gp.qa_context_report'),current_setting('gp.qa_context_conversation')))::integer) as sensitive_reads_audited;
select 1/((select count(*)=2 from gp_private.context_report_decisions where report_id=current_setting('gp.qa_context_report')::uuid)::integer) as decision_history_retained;
select 1/((not has_function_privilege('anon','public.gp_context_report_detail(uuid)','execute') and not has_table_privilege('authenticated','gp_private.context_report_evidence','select') and not has_table_privilege('authenticated','public.context_reports','insert'))::integer) as direct_privilege_denied;
rollback;
