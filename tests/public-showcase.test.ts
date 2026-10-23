import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_SHOWCASE_IDS } from "../src/lib/public-showcase";
import { parkingSceneGroup } from "../src/lib/parking-registry";
import { isIdfCoordinate } from "../src/lib/paris-region";
import {
  publicShowcaseListings,
  getPublicShowcaseListing,
  publicShowcaseParking,
  SHOWCASE_PARKING_ID,
} from "../src/server/public-showcase";
import {
  parsePageQuery,
  paginatePublicListings,
  decodeCursor,
} from "../src/server/pagination";
import { handleSupabaseApi } from "../src/server/supabase";

const originalFetch = globalThis.fetch;
const saved = { ...process.env };
after(() => {
  globalThis.fetch = originalFetch;
  process.env = saved;
});
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://showcase-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_showcase_test";
process.env.NEXT_PUBLIC_SITE_URL = "https://parking.gilmathis.com";

test("les deux exemples sont activés explicitement, localisés au Raincy et sans vendeur réel", () => {
  delete process.env.GP_PUBLIC_SHOWCASE;
  assert.deepEqual(publicShowcaseListings(), []);
  assert.equal(getPublicShowcaseListing(PUBLIC_SHOWCASE_IDS[0]), null);
  assert.equal(publicShowcaseParking(undefined, PUBLIC_SHOWCASE_IDS[0]), null);
  process.env.GP_PUBLIC_SHOWCASE = "true";
  const examples = publicShowcaseListings();
  assert.equal(examples.length, 2);
  for (const listing of examples) {
    assert.equal(listing.isDemo, true);
    assert.equal(listing.city, "Le Raincy");
    assert.ok(isIdfCoordinate(listing.coordinates));
    assert.match(listing.description, /Aucun bien n’est proposé/);
    assert.equal(listing.sellerTypeSnapshot, null);
    assert.ok(listing.sceneAvailable);
  }
  assert.deepEqual(
    examples.map((item) => item.coordinates),
    [
      [2.514477, 48.889647],
      [2.514755, 48.889579],
    ],
  );
  const group = parkingSceneGroup(publicShowcaseParking(SHOWCASE_PARKING_ID)!);
  assert.deepEqual(
    group.levels.map((level) => [
      level.level,
      level.spaces.map((unit) => unit.space.number),
    ]),
    [
      [-1, ["12", "13"]],
      [-2, ["24"]],
    ],
  );
  assert.ok(group.levels.every((level) => level.scene === null));
  assert.equal(
    publicShowcaseParking("00000000-0000-4000-8000-000000000000"),
    null,
  );
});

test("la recherche, le budget, les niveaux et les curseurs s’appliquent aussi aux exemples", () => {
  process.env.GP_PUBLIC_SHOWCASE = "true";
  const source = publicShowcaseListings();
  const query = (search: string) =>
    parsePageQuery(
      new URL(`https://parking.gilmathis.com/api/listings?${search}`),
    );
  for (const sort of [
    "recent",
    "price_asc",
    "price_desc",
    "area_asc",
    "spaces_desc",
  ]) {
    const { filters } = query(`q=le+raincy&sort=${sort}`);
    const page1 = paginatePublicListings(source, filters, 1, null);
    const page2 = paginatePublicListings(
      source,
      filters,
      1,
      decodeCursor(page1.nextCursor, filters),
    );
    assert.equal(page1.total, 2);
    assert.equal(
      new Set([...page1.items, ...page2.items].map((item) => item.id)).size,
      2,
    );
    assert.equal(page2.nextCursor, null);
  }
  for (const search of [
    "q=Lyon",
    "type=box",
    "transactionType=rent",
    "priceMax=1800000",
    "bbox=2.2,48.8,2.3,48.9",
  ]) {
    assert.equal(
      paginatePublicListings(source, query(search).filters, 24, null).total,
      0,
      search,
    );
  }
  assert.equal(
    paginatePublicListings(source, query("level=-2").filters, 24, null).total,
    1,
  );
  assert.equal(
    paginatePublicListings(
      source,
      query("q=allee+victor+hugo&scene=true").filters,
      24,
      null,
    ).total,
    2,
  );
});

test("le catalogue connecté ne montre les exemples que si tout l’inventaire réel est vide ; une erreur n’est jamais masquée", async () => {
  let inventoryCount = 0;
  let fail = false;
  let headCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/rpc/gp_catalog_page_v2"))
      return new Response(
        JSON.stringify(
          fail
            ? { message: "catalogue unavailable" }
            : { items: [], total: 0, nextPosition: null },
        ),
        {
          status: fail ? 503 : 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    if (url.includes("/published_listings") && init?.method === "HEAD") {
      headCalls++;
      return new Response(null, {
        headers: { "Content-Range": `*/${inventoryCount}` },
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const get = () =>
    handleSupabaseApi(
      new Request("https://parking.gilmathis.com/api/listings"),
    );
  process.env.GP_PUBLIC_SHOWCASE = "false";
  assert.equal((await (await get()).json()).total, 0);
  assert.equal(headCalls, 0);
  process.env.GP_PUBLIC_SHOWCASE = "true";
  const examples = await (await get()).json();
  assert.equal(examples.total, 2);
  assert.equal(examples.showcase, true);
  inventoryCount = 1;
  const realOnly = await (await get()).json();
  assert.equal(realOnly.total, 0);
  assert.equal(realOnly.showcase, undefined);
  fail = true;
  const unavailable = await get();
  assert.notEqual(unavailable.status, 200);
  assert.equal((await unavailable.json()).data, undefined);
});

test("les exemples ne peuvent pas être modifiés ni ajoutés aux favoris en ligne, même après désactivation", async () => {
  for (const enabled of ["true", "false"]) {
    process.env.GP_PUBLIC_SHOWCASE = enabled;
    for (const [path, method] of [
      [`listings/${PUBLIC_SHOWCASE_IDS[0]}`, "PATCH"],
      [`listings/${PUBLIC_SHOWCASE_IDS[1]}/submit`, "POST"],
      [`favorites/${PUBLIC_SHOWCASE_IDS[0]}`, "PUT"],
    ]) {
      const response = await handleSupabaseApi(
        new Request(`https://parking.gilmathis.com/api/${path}`, {
          method,
          headers: { Origin: "https://parking.gilmathis.com" },
        }),
      );
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, "SHOWCASE_READ_ONLY");
    }
  }
});
