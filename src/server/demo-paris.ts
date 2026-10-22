import type { DatabaseSync } from "node:sqlite";
import type { Listing } from "@/lib/types";
import { emptyCommercialDetails } from "@/lib/commercial-details";

export const DEMO_PARIS_PLACES = [
  {
    city: "Paris",
    district: "Gare de Lyon · 12e",
    postalCode: "75012",
    coordinates: [2.3739, 48.8446],
    slug: "paris-gare-de-lyon",
  },
  {
    city: "Boulogne-Billancourt",
    district: "Billancourt",
    postalCode: "92100",
    coordinates: [2.2402, 48.8331],
    slug: "boulogne-billancourt",
  },
  {
    city: "Montreuil",
    district: "Bas-Montreuil",
    postalCode: "93100",
    coordinates: [2.4358, 48.8606],
    slug: "montreuil-bas-montreuil",
  },
  {
    city: "Versailles",
    district: "Chantiers",
    postalCode: "78000",
    coordinates: [2.1362, 48.7963],
    slug: "versailles-chantiers",
  },
  {
    city: "Saint-Denis",
    district: "Stade de France",
    postalCode: "93200",
    coordinates: [2.3578, 48.9274],
    slug: "saint-denis-stade-de-france",
  },
  {
    city: "Créteil",
    district: "Centre",
    postalCode: "94000",
    coordinates: [2.4556, 48.7904],
    slug: "creteil-centre",
  },
] as const;
export function parisDemoListing(
  value: Listing,
  index: number,
  now: string,
): Listing {
  const p = DEMO_PARIS_PLACES[index === 6 ? 0 : index];
  return {
    ...value,
    city: p.city,
    district: p.district,
    slug: index === 6 ? "paris-gare-de-lyon-deux-niveaux" : p.slug,
    coordinates: [...p.coordinates],
    ...(value.publicCoordinates
      ? { publicCoordinates: [...p.coordinates] as [number, number] }
      : {}),
    address: undefined,
    commercialDetails: {
      ...(value.commercialDetails ?? emptyCommercialDetails()),
      postalCode: p.postalCode,
    },
    description:
      index === 6
        ? "Annonce fictive du même parking parisien de démonstration que la place 12. Deux emplacements distincts, aux niveaux −1 et −2. Plan et dimensions inventés ; aucun bien réel à vendre."
        : `Exemple fictif à ${p.city}, quartier ${p.district}. Les photos et le plan sont des illustrations ; les dimensions et l’état ne correspondent à aucun bien réel à vendre.`,
    quality: {
      ...value.quality,
      observations: `Exemple fictif à ${p.city}. Photos illustratives ; état réel et dimensions à documenter sur un bien autorisé.`,
      observedAt: null,
      basis: "unknown",
    },
    updatedAt: now,
    ...(value.availabilityExpiresAt
      ? {
          availabilityConfirmedAt: now,
          availabilityExpiresAt: new Date(
            Date.parse(now) + 90 * 86400000,
          ).toISOString(),
        }
      : {}),
  };
}
/** Reserved original seed IDs + original demo seller + explicit isDemo: never adopt user listings. */
export function migrateParisDemo(sql: DatabaseSync) {
  const now = new Date().toISOString();
  const rows = sql
    .prepare(
      "SELECT * FROM listings WHERE seller_id='00000000-0000-4000-8000-000000000002' AND id GLOB '10000000-0000-4000-8000-00000000000[1-7]'",
    )
    .all();
  for (const row of rows) {
    const draft = JSON.parse(String(row.draft_json)) as Listing,
      pub = row.public_json
        ? (JSON.parse(String(row.public_json)) as Listing)
        : null;
    if (!draft.isDemo || (pub && !pub.isDemo) || draft.city !== "Lyon")
      continue;
    const index = Number(String(row.id).slice(-1)) - 1;
    sql
      .prepare(
        "UPDATE listings SET draft_json=?,public_json=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify(parisDemoListing(draft, index, now)),
        pub ? JSON.stringify(parisDemoListing(pub, index, now)) : null,
        now,
        row.id,
      );
    for (const rev of sql
      .prepare("SELECT id,snapshot_json FROM revisions WHERE listing_id=?")
      .all(row.id)) {
      const snapshot = JSON.parse(String(rev.snapshot_json)) as Listing;
      if (snapshot.isDemo && snapshot.city === "Lyon")
        sql
          .prepare("UPDATE revisions SET snapshot_json=? WHERE id=?")
          .run(JSON.stringify(parisDemoListing(snapshot, index, now)), rev.id);
    }
  }
  if (
    sql
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='parking_sites'",
      )
      .get()
  ) {
    const first = sql
      .prepare(
        "SELECT public_json FROM listings WHERE id='10000000-0000-4000-8000-000000000001'",
      )
      .get();
    if (first?.public_json && JSON.parse(String(first.public_json)).isDemo)
      sql
        .prepare(
          "UPDATE parking_sites SET public_name='Parking Gare de Lyon · Paris · démonstration' WHERE id='d2600000-0000-4000-8000-000000000001' AND public_name LIKE '%Part-Dieu%'",
        )
        .run();
  }
}
