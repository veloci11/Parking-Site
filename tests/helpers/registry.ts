import { randomUUID } from "node:crypto";
import type { Listing } from "../../src/lib/types";
import { db, userDTO } from "../../src/server/db";
import { localRegistryCommand } from "../../src/server/parking-registry";

/** Isolated, administered physical fixtures for tests of other publication rules. */
export function linkTestListing(listingId: string) {
  const id = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,'admin',1,?)",
    )
    .run(
      id,
      "QA Registry Admin",
      id + "@test.invalid",
      new Date().toISOString(),
    );
  const admin = userDTO(
    db().prepare("SELECT * FROM users WHERE id=?").get(id)!,
  );
  const listing = JSON.parse(
    String(
      db().prepare("SELECT draft_json FROM listings WHERE id=?").get(listingId)!
        .draft_json,
    ),
  ) as Listing;
  const siteId = localRegistryCommand(admin, {
    action: "create_site",
    publicName: "Parking QA",
    internalReference: randomUUID(),
  }).id!;
  const levels = new Map<number, string>();
  const units = listing.spaces.map((unit) => {
    if (unit.level === null)
      throw new Error("QA registry fixture requires a known level");
    if (!levels.has(unit.level))
      levels.set(
        unit.level,
        localRegistryCommand(admin, {
          action: "add_level",
          siteId,
          code: String(unit.level),
          label: "Niveau QA",
          number: unit.level,
          sortOrder: 0,
        }).id!,
      );
    const spaceId = localRegistryCommand(admin, {
      action: "add_space",
      levelId: levels.get(unit.level)!,
      number: unit.number,
      privateLotReference: "",
      areaM2: unit.areaM2,
      lengthM: unit.lengthM,
      widthM: unit.widthM,
      clearanceM: unit.clearanceM,
    }).id!;
    return { unitId: unit.id, spaceId };
  });
  return localRegistryCommand(admin, {
    action: "link_listing",
    listingId,
    version: listing.version,
    siteId,
    units,
    reason: "Rapprochement physique de la fixture de recette.",
  }).version!;
}
