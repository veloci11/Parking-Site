-- Read-only pre-028 inventory. Counts only: no email, identity or private location returned.
select count(*) as listing_rows,
 count(*) filter(where coalesce((draft->>'isDemo')::boolean,false)) as declared_demo_rows,
 count(*) filter(where not coalesce((draft->>'isDemo')::boolean,false)) as other_rows,
 count(*) filter(where lower(draft->>'city')='lyon') as lyon_rows,
 count(*) filter(where last_published is not null) as historical_publication_rows
from public.listings;
select count(*) as public_rows,
 count(*) filter(where lower(payload->>'city')='lyon') as lyon_public_rows,
 count(*) filter(where payload->'commercialDetails'->>'postalCode' is null or payload->'commercialDetails'->>'postalCode'='') as postal_missing_public_rows
from public.published_listings;
