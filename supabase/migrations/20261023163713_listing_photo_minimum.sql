-- One authentic general photo is sufficient. Additional views remain recommended.
-- Patch the two legacy checks still called by the current publication wrappers.
-- CREATE OR REPLACE preserves their existing ownership, ACL and security options.
begin;
do $migration$
declare
  target regprocedure;
  before_definition text;
  after_definition text;
  photo_expression text;
begin
  for target, photo_expression in
    select * from (values
      ('public.gp_validate_draft_v7(jsonb,uuid,boolean)'::regprocedure,
       $check$jsonb_array_length(p->'photos')<3$check$),
      ('public.gp_listing_v11(uuid,text,jsonb,integer)'::regprocedure,
       $check$jsonb_array_length(value->'photos')<3$check$)
    ) as checks(signature, expression)
  loop
    before_definition := pg_get_functiondef(target);
    if (length(before_definition) - length(replace(before_definition, photo_expression, '')))
       / length(photo_expression) <> 1 then
      raise exception 'PHOTO_MINIMUM_FUNCTION_SHAPE_CHANGED: %', target;
    end if;
    after_definition := replace(before_definition, photo_expression,
      replace(photo_expression, '<3', '<1'));
    execute after_definition;
  end loop;
end;
$migration$;
commit;
