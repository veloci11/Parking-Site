import { emptyCommercialDetails } from "./commercial-details";
import { idfGeocode, idfListingProblem, isIdfCoordinate } from "./paris-region";
import type { Listing } from "./types";

export interface AddressSuggestion {
  id: string;
  label: string;
  city: string;
  postalCode: string;
  district: string;
  coordinates: [number, number];
  kind: "address" | "municipality";
  source: "IGN / BAN" | "Référentiel communal";
}

export function municipalitySuggestions(query: string): AddressSuggestion[] {
  return idfGeocode(query).map((item) => {
    const postalCode =
      item.postalCodes.find((code) => code === query.trim()) ||
      item.postalCodes[0];
    return {
      id: `commune:${item.code}:${postalCode}`,
      label: `${item.city} ${postalCode} · secteur de la commune`,
      city: item.city,
      postalCode,
      district: "Secteur de la commune",
      coordinates: item.coordinates,
      kind: "municipality",
      source: "Référentiel communal",
    };
  });
}

/** Treat the external geocoder as data. Only coherent IDF addresses enter the form. */
export function parseAddressSuggestions(raw: unknown): AddressSuggestion[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { features?: unknown }).features)
  )
    return [];
  return (raw as { features: unknown[] }).features
    .slice(0, 20)
    .flatMap((feature) => {
      if (!feature || typeof feature !== "object") return [];
      const value = feature as {
        properties?: Record<string, unknown>;
        geometry?: { type?: unknown; coordinates?: unknown };
      };
      const p = value.properties;
      if (
        !p ||
        value.geometry?.type !== "Point" ||
        !isIdfCoordinate(value.geometry.coordinates)
      )
        return [];
      if (
        typeof p.city !== "string" ||
        typeof p.postcode !== "string" ||
        typeof p.label !== "string" ||
        p.city.length > 80 ||
        p.label.length > 200 ||
        !/^\d{5}$/.test(p.postcode)
      )
        return [];
      const city = /^paris\s+\d{1,2}e?\s+arrondissement$/i.test(p.city)
        ? "Paris"
        : p.city;
      if (
        idfListingProblem(
          {
            city,
            coordinates: value.geometry.coordinates,
            commercialDetails: {
              ...emptyCommercialDetails(),
              postalCode: p.postcode,
            },
          },
          true,
        )
      )
        return [];
      const municipality = p.type === "municipality";
      return [
        {
          id: typeof p.id === "string" ? p.id.slice(0, 150) : p.label,
          label: p.label,
          city,
          postalCode: p.postcode,
          district:
            typeof p.district === "string"
              ? p.district.slice(0, 100)
              : municipality
                ? p.city.slice(0, 100)
                : typeof p.street === "string"
                  ? p.street.slice(0, 100)
                  : "Secteur du parking",
          coordinates: [...value.geometry.coordinates] as [number, number],
          kind: municipality ? ("municipality" as const) : ("address" as const),
          source: "IGN / BAN" as const,
        },
      ];
    });
}

/** Approximate mode stores no exact address or exact private point. */
export function locationFromSuggestion(
  suggestion: AddressSuggestion,
  exact: boolean,
  current: Listing,
): Partial<Listing> {
  const showExact = exact && suggestion.kind === "address";
  let point = suggestion.coordinates;
  if (!showExact && suggestion.kind === "address") {
    const rounded: [number, number] = [
      Math.round(point[0] * 100) / 100,
      Math.round(point[1] * 100) / 100,
    ];
    const department = suggestion.postalCode.slice(0, 2);
    point = isIdfCoordinate(rounded, department)
      ? rounded
      : (idfGeocode(suggestion.city).find((item) =>
          item.postalCodes.includes(suggestion.postalCode),
        )?.coordinates ?? rounded);
  }
  return {
    city: suggestion.city,
    district:
      showExact || suggestion.kind === "municipality"
        ? suggestion.district
        : "Secteur du parking",
    coordinates: [...point],
    publicCoordinates: [...point],
    address: showExact ? suggestion.label : "",
    locationPrecision: showExact ? "exact_opt_in" : "area",
    locationConfirmedAt: null,
    sceneAvailable: showExact ? current.sceneAvailable : false,
    commercialDetails: {
      ...(current.commercialDetails || emptyCommercialDetails()),
      postalCode: suggestion.postalCode,
    },
  };
}
