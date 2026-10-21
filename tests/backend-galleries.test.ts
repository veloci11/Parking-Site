import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Listing } from "../src/lib/types";
import { publicProjection } from "../src/server/catalog";
import {
  validatePhotoLinks,
  listingPhotoUrls,
} from "../src/server/media-links";
const id = randomUUID(),
  unitId = randomUUID();
const fixture = {
  id,
  slug: "test",
  title: "Place de démonstration",
  description: "test",
  city: "Lyon",
  district: "Test",
  priceCents: 100000,
  type: "covered",
  spaces: [
    {
      id: unitId,
      number: "12",
      level: -1,
      areaM2: 12,
      lengthM: 5,
      widthM: 2.4,
      clearanceM: 2.1,
    },
  ],
  photos: ["/demo/covered.png"],
  spacePhotos: { [unitId]: ["/demo/box.png"] },
  quality: {
    floor: "Inconnu",
    lighting: "Inconnu",
    humidity: "Inconnue",
    access: "Inconnu",
    maneuver: "Inconnue",
    observations: "",
  },
  locationPrecision: "area",
  coordinates: [4.8597, 45.7612],
  sceneAvailable: false,
  isDemo: true,
  status: "published",
  version: 1,
  sellerName: "Test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} satisfies Listing;
test("galeries par unité projetées sous alias public uniquement", () => {
  const projected = publicProjection(fixture);
  assert.deepEqual(projected.spacePhotos, {
    [`${id}:unit:1`]: ["/demo/box.png"],
  });
  assert.ok(!JSON.stringify(projected).includes(unitId));
  assert.deepEqual(
    publicProjection(projected).spacePhotos,
    projected.spacePhotos,
  );
});
test("liens limités à 6 par unité, aux unités existantes et à 120 assets distincts", () => {
  validatePhotoLinks(fixture);
  assert.throws(() =>
    validatePhotoLinks({
      ...fixture,
      spacePhotos: { [randomUUID()]: ["/demo/box.png"] },
    }),
  );
  assert.throws(() =>
    validatePhotoLinks({
      ...fixture,
      spacePhotos: {
        [unitId]: Array.from({ length: 7 }, (_, i) => `/photo/${i}`),
      },
    }),
  );
  const spaces = Array.from({ length: 21 }, (_, i) => ({
    ...fixture.spaces[0],
    id: randomUUID(),
    number: String(i),
  }));
  const photos = Object.fromEntries(
    spaces.map((s, index) => [
      s.id,
      Array.from({ length: 6 }, (_, i) => `/photo/${index * 6 + i}`),
    ]),
  );
  assert.throws(() =>
    validatePhotoLinks({ ...fixture, spaces, spacePhotos: photos }),
  );
});
test("un asset commun ne se compte qu’une fois dans les différentes galeries", () => {
  const value = {
    ...fixture,
    spacePhotos: { [unitId]: [...fixture.photos, "/demo/box.png"] },
  };
  assert.equal(listingPhotoUrls(value).length, 2);
});
