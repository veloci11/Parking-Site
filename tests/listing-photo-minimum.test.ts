import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import { handleApi } from "../src/server/api";
import { db, personas, resetDbForTests } from "../src/server/db";
import { sessionCookie } from "../src/server/security";

const dir = mkdtempSync(join(tmpdir(), "gp-photo-minimum-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
async function request(path: string, method: string, body: unknown) {
  const response = await handleApi(
    new Request(`http://127.0.0.1:3000/api/${path}`, {
      method,
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
        cookie: sessionCookie(personas.seller),
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, ...(await response.json()) };
}

test("submission requires one owned general photo; one and two photos work without fabricated duplicates", async () => {
  for (const count of [0, 1, 2]) {
    const created = await request("listings", "POST", {
      title: "Place de parking avec photos authentiques",
      description:
        "Une place de stationnement avec accès sécurisé. Les informations et photos sont fournies par son propriétaire, sans image supplémentaire inventée.",
      city: "Paris",
      district: "Gare de Lyon",
      coordinates: [2.3739, 48.8446],
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
      type: "covered",
      priceCents: 1500000,
      spaces: [
        {
          id: randomUUID(),
          number: "",
          level: -1,
          areaM2: 15,
          lengthM: null,
          widthM: null,
          clearanceM: null,
        },
      ],
      photos: [],
    });
    assert.equal(created.status, 201, JSON.stringify(created));
    const id = created.data.id;
    const photos = Array.from({ length: count }, () => {
      const mediaId = randomUUID();
      db()
        .prepare("INSERT INTO media VALUES(?,?,?,?,?,?)")
        .run(
          mediaId,
          personas.seller,
          id,
          join(dir, `${mediaId}.webp`),
          "image/webp",
          new Date().toISOString(),
        );
      return `/api/media/${mediaId}`;
    });
    const updated = await request(`listings/${id}`, "PATCH", {
      version: 1,
      photos,
      locationConfirmedAt: new Date().toISOString(),
    });
    assert.equal(updated.status, 200, JSON.stringify(updated));
    const submitted = await request(`listings/${id}/submit`, "POST", {
      version: updated.data.version,
      ownershipAttested: true,
    });
    assert.equal(
      submitted.status,
      count ? 200 : 400,
      JSON.stringify(submitted),
    );
    if (count) {
      assert.equal(submitted.data.status, "pending");
      assert.deepEqual(submitted.data.photos, photos);
    } else {
      assert.match(submitted.error, /au moins une photo/);
    }
  }
});
