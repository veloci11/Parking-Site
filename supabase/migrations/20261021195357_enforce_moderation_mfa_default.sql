-- 025: privileged moderation and administration require a verified AAL2 session.
-- Existing RPCs and RLS policies consume this private setting; no grants change.
begin;
insert into gp_private.configuration(key,value) values('mfa_required','true'::jsonb)
on conflict(key) do update set value=excluded.value;
commit;
