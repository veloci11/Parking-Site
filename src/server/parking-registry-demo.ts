import { randomUUID, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Listing } from "@/lib/types";
import type { SceneManifest } from "@/lib/scene-contract";

/** Explicitly fictitious, isolated parking; unrelated city examples are never grouped. */
export function seedSharedDemoParking(sql: DatabaseSync) {
  sql.exec("SAVEPOINT gp_demo_shared_parking");
  try {
    seedDemo(sql);
    sql.exec("RELEASE gp_demo_shared_parking");
  } catch (error) {
    sql.exec("ROLLBACK TO gp_demo_shared_parking");
    sql.exec("RELEASE gp_demo_shared_parking");
    throw error;
  }
}
function seedDemo(sql: DatabaseSync) {
  const firstId = "10000000-0000-4000-8000-000000000001",
    secondId = "10000000-0000-4000-8000-000000000007";
  const siteId = "d2600000-0000-4000-8000-000000000001";
  if (sql.prepare("SELECT id FROM parking_sites WHERE id=?").get(siteId))
    return;
  const firstRow = sql
    .prepare("SELECT * FROM listings WHERE id=? AND public_json IS NOT NULL")
    .get(firstId);
  if (!firstRow) return;
  const first = JSON.parse(String(firstRow.public_json)) as Listing;
  if (
    !first.isDemo ||
    first.locationPrecision !== "exact_opt_in" ||
    first.spaces.length !== 1 ||
    first.spaces[0].level !== -1
  )
    return;
  const now = new Date().toISOString();
  let secondRow = sql
    .prepare("SELECT * FROM listings WHERE id=?")
    .get(secondId);
  if (!secondRow) {
    const second: Listing = {
      ...first,
      id: secondId,
      slug: "paris-gare-de-lyon-deux-niveaux",
      title: "Deux places, aux niveaux −1 et −2",
      description:
        "Annonce fictive du même parking de démonstration que la place 12. Deux emplacements distincts, aux niveaux −1 et −2. Le plan et les dimensions sont des exemples inventés, sans bien réel à vendre.",
      priceCents: 3200000,
      spaces: [
        { ...first.spaces[0], id: randomUUID(), number: "13", level: -1 },
        { ...first.spaces[0], id: randomUUID(), number: "24", level: -2 },
      ],
      sceneAvailable: true,
      createdAt: now,
      updatedAt: now,
    };
    sql
      .prepare(
        "INSERT INTO listings(id,seller_id,draft_json,public_json,status,version,created_at,updated_at,published_at) VALUES(?,?,?,?, 'published',1,?,?,?)",
      )
      .run(
        secondId,
        firstRow.seller_id,
        JSON.stringify(second),
        JSON.stringify(second),
        now,
        now,
        now,
      );
    secondRow = sql.prepare("SELECT * FROM listings WHERE id=?").get(secondId);
  }
  const second = JSON.parse(
    String(secondRow!.public_json || "null"),
  ) as Listing | null;
  if (!second?.isDemo || second.locationPrecision !== "exact_opt_in") return;
  sql
    .prepare("INSERT INTO parking_sites VALUES(?,?,?,?,?)")
    .run(
      siteId,
      "d2610000-0000-4000-8000-000000000001",
      "Parking Gare de Lyon · Paris · démonstration",
      "DEMO-FICTITIOUS-SHARED",
      "{}",
    );
  for (const n of [-1, -2]) {
    const levelId = `d2620000-0000-4000-8000-${String(-n).padStart(12, "0")}`;
    sql
      .prepare("INSERT INTO parking_levels VALUES(?,?,?,?,?,?,?)")
      .run(levelId, randomUUID(), siteId, `SS${-n}`, `Sous-sol ${-n}`, n, -n);
    const units = [first, second].flatMap((l) =>
      l.spaces
        .filter((u) => u.level === n)
        .map((u) => ({ listing: l, unit: u })),
    );
    const manifest: SceneManifest = {
      schemaVersion: "gp-parametric-1.1",
      unit: "m",
      upAxis: "Y",
      level: n,
      floor: {
        footprintXZ: [
          [0, 0],
          [18, 0],
          [18, 18],
          [0, 18],
        ],
        thicknessM: 0.2,
      },
      spaces: [],
      contextSpaces: [],
      obstacles: [
        {
          kind: "wall",
          footprintXZ: [
            [0, 0],
            [18, 0],
            [18, 0.2],
            [0, 0.2],
          ],
          baseM: 0,
          heightM: 2.7,
        },
        {
          kind: "column",
          footprintXZ: [
            [10, 7],
            [10.4, 7],
            [10.4, 7.4],
            [10, 7.4],
          ],
          baseM: 0,
          heightM: 2.7,
        },
        {
          kind: "ramp",
          footprintXZ: [
            [12, 12],
            [17, 12],
            [17, 17],
            [12, 17],
          ],
          baseM: 0,
          heightM: 1,
          endHeightM: 0,
        },
      ],
      observations: [],
      provenance: {
        calibrated: true,
        accuracyM: 0.05,
        controlDistances: [
          { fromXZ: [0, 0], toXZ: [18, 0], measuredM: 18 },
          { fromXZ: [0, 0], toXZ: [0, 18], measuredM: 18 },
        ],
        observedAt: now,
        publicSummary:
          "Plan entièrement fictif du parking de démonstration. Aucun relevé d’un bien réel.",
        geometrySource: "unknown",
        geometryEvidenceIds: [],
      },
    };
    units.forEach(({ listing, unit }, i) => {
      const spaceId = randomUUID(),
        x = 2 + i * 4,
        z = 2;
      sql.prepare("INSERT INTO parking_spaces VALUES(?,?,?,?,?,?)").run(
        spaceId,
        randomUUID(),
        levelId,
        unit.number,
        "DEMO-ONLY",
        JSON.stringify({
          areaM2: unit.areaM2,
          lengthM: unit.lengthM,
          widthM: unit.widthM,
          clearanceM: unit.clearanceM,
        }),
      );
      sql
        .prepare("INSERT INTO registry_listing_units VALUES(?,?,?,?)")
        .run(
          listing.id,
          unit.id,
          spaceId,
          createHash("sha256")
            .update(JSON.stringify(listing.spaces))
            .digest("hex"),
        );
      sql
        .prepare("INSERT INTO registry_published_units VALUES(?,?,?)")
        .run(listing.id, unit.id, spaceId);
      sql
        .prepare("INSERT INTO canonical_space_claims VALUES(?,?)")
        .run(spaceId, listing.id);
      manifest.spaces.push({
        spaceId,
        displayNumber: unit.number,
        footprintXZ: [
          [x, z],
          [x + unit.widthM!, z],
          [x + unit.widthM!, z + unit.lengthM!],
          [x, z + unit.lengthM!],
        ],
        dimensions: {
          lengthM: unit.lengthM,
          widthM: unit.widthM,
          clearanceM: unit.clearanceM,
        },
        source: "schematic",
      });
    });
    sql
      .prepare(
        "INSERT INTO parking_level_plans VALUES(?,?,?,?, 'published',1,NULL,?,?,1)",
      )
      .run(
        levelId,
        randomUUID(),
        JSON.stringify(manifest),
        "[]",
        "Plan fictif de démonstration uniquement.",
        now,
      );
  }
}
