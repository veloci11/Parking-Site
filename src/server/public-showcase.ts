import { PUBLIC_SHOWCASE_IDS, isPublicShowcase } from "@/lib/public-showcase";
import type { Listing } from "@/lib/types";
import type { PublicParking } from "@/lib/parking-registry";

export const SHOWCASE_PARKING_ID = "de600000-0000-4000-8000-000000000100";
export const publicShowcaseEnabled = () =>
  process.env.GP_PUBLIC_SHOWCASE === "true";

/** IGN / BAN, retrieved 2026-10-22: 93062_0940_00016 and 93062_0940_00018.
 * Only the address points are real. No parking, measurements or offer was surveyed.
 * These fixtures never create users, publications, claims or approved real scenes.
 */
export function publicShowcaseListings(): Listing[] {
  if (!publicShowcaseEnabled()) return [];
  return PUBLIC_SHOWCASE_IDS.map((id, index) => ({
    id,
    slug: `le-raincy-victor-hugo-demo-${index === 0 ? "place-12" : "deux-places"}`,
    title:
      index === 0
        ? "Démonstration · Place 12"
        : "Démonstration · Deux places sur deux niveaux",
    description:
      "Exemple fictif au 16–18 allée Victor Hugo, 93340 Le Raincy, en région parisienne. L’adresse sert uniquement à présenter la carte. Les prix, surfaces, numéros de places, photos et plans 3D sont illustratifs et ne décrivent pas le parking réel de cette adresse. Aucun bien n’est proposé à la vente et aucune visite ne peut être demandée depuis cette démonstration.",
    city: "Le Raincy",
    district:
      index === 0 ? "Victor Hugo · Place 12" : "Victor Hugo · Lot de 2 places",
    address: "16–18 allée Victor Hugo, 93340 Le Raincy",
    coordinates: index === 0 ? [2.514477, 48.889647] : [2.514755, 48.889579],
    locationPrecision: "exact_opt_in",
    priceCents: index === 0 ? 1850000 : 3200000,
    transactionType: "sale",
    pricingMode: "lot",
    type: "covered",
    spaces: (index === 0
      ? [["12", -1]]
      : [
          ["13", -1],
          ["24", -2],
        ]
    ).map(([number, level], unitIndex) => ({
      id: `${id}:unit:${unitIndex + 1}`,
      number: String(number),
      level: Number(level),
      areaM2: 12,
      lengthM: 5,
      widthM: 2.4,
      clearanceM: 2.1,
    })),
    photos: ["/demo/covered.png"],
    quality: {
      floor: "Exemple : sol en béton",
      lighting: "Exemple : éclairage collectif",
      humidity: "Non évaluée",
      access: "Exemple : portail",
      maneuver: "Exemple : poteaux latéraux",
      observations: "État illustratif, sans observation du parking réel.",
      basis: "unknown",
    },
    occupancy: "unknown",
    sceneAvailable: true,
    isDemo: true,
    status: "published",
    version: 1,
    sellerName: "Démonstration GP park",
    sellerTypeSnapshot: null,
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
  }));
}

export function getPublicShowcaseListing(id: string) {
  return isPublicShowcase(id)
    ? (publicShowcaseListings().find((item) => item.id === id) ?? null)
    : null;
}

export function publicShowcaseParking(
  alias?: string,
  listingId?: string,
): PublicParking | null {
  if (
    !publicShowcaseEnabled() ||
    (alias
      ? alias !== SHOWCASE_PARKING_ID
      : !listingId || !isPublicShowcase(listingId))
  )
    return null;
  const listings = publicShowcaseListings();
  return {
    id: SHOWCASE_PARKING_ID,
    publicName: "Victor Hugo · Parking de démonstration",
    listings,
    levels: [-1, -2].map((number) => ({
      id: `de600000-0000-4000-8000-00000000010${Math.abs(number)}`,
      code: String(number),
      label: `Niveau ${number}`,
      number,
      spaces: listings.flatMap((listing) =>
        listing.spaces
          .filter((unit) => unit.level === number)
          .map((unit) => ({
            id: unit.id,
            number: unit.number,
            listingId: listing.id,
            listingUnitId: unit.id,
          })),
      ),
      scenes: listings
        .filter((listing) =>
          listing.spaces.some((unit) => unit.level === number),
        )
        .map((listing) => ({
          listingId: listing.id,
          level: number,
          sceneAvailable: true,
        })),
      commonPlan: null,
    })),
  };
}
