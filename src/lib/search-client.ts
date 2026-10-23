export interface SearchState {
  transactionType: "sale" | "rent";
  city: string;
  type: string;
  minPrice: string;
  maxPrice: string;
  annualChargesMax: string;
  propertyTaxMax: string;
  minArea: string;
  minSpaces: string;
  sellerType: string;
  only3D: boolean;
  sort: string;
  covered: string;
  closed: string;
  occupancy: string;
  level: string;
  bbox: string;
  center: string;
  radiusKm: string;
}
export const emptySearch: SearchState = {
  transactionType: "sale",
  city: "",
  type: "",
  minPrice: "",
  maxPrice: "",
  annualChargesMax: "",
  propertyTaxMax: "",
  minArea: "",
  minSpaces: "",
  sellerType: "",
  only3D: false,
  sort: "recent",
  covered: "",
  closed: "",
  occupancy: "",
  level: "",
  bbox: "",
  center: "",
  radiusKm: "",
};
const sorts = ["recent", "price_asc", "price_desc", "area_asc", "spaces_desc"];
export function coordinateTuple(raw: string, length: 2 | 4): number[] | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length !== length || parts.some((p) => !p.trim())) return null;
  const v = parts.map(Number);
  if (v.some((n) => !Number.isFinite(n))) return null;
  if (length === 2)
    return Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90 ? v : null;
  return v[0] >= -180 &&
    v[2] <= 180 &&
    v[1] >= -90 &&
    v[3] <= 90 &&
    v[0] < v[2] &&
    v[1] < v[3]
    ? v
    : null;
}
export function readSearch(p: URLSearchParams): SearchState {
  const s = { ...emptySearch };
  s.transactionType = p.get("transactionType") === "rent" ? "rent" : "sale";
  s.city = (p.get("city") || p.get("q") || "").slice(0, 80);
  s.type = ["covered", "box", "outdoor", "mixed"].includes(p.get("type") || "")
    ? p.get("type")!
    : "";
  for (const [key, param] of [
    ["minPrice", "priceMin"],
    ["maxPrice", "priceMax"],
    ["minArea", "areaMin"],
    ["radiusKm", "radiusKm"],
  ] as const) {
    const v = p.get(param) || "";
    if (v && Number.isFinite(Number(v)) && Number(v) >= 0) s[key] = v;
  }
  s.only3D = p.get("scene") === "1";
  for (const key of ["annualChargesMax", "propertyTaxMax"] as const) {
    const value = p.get(key) || "";
    const amount = Number(value);
    if (
      value &&
      Number.isFinite(amount) &&
      amount >= 0 &&
      amount <= 1000000 &&
      Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001
    )
      s[key] = value;
  }
  const minSpaces = p.get("minSpaces");
  if (
    minSpaces &&
    Number.isInteger(Number(minSpaces)) &&
    Number(minSpaces) >= 1 &&
    Number(minSpaces) <= 500
  )
    s.minSpaces = minSpaces;
  s.sellerType = ["private", "professional"].includes(p.get("sellerType") || "")
    ? p.get("sellerType")!
    : "";
  s.sort = sorts.includes(p.get("sort") || "") ? p.get("sort")! : "recent";
  for (const key of ["covered", "closed"] as const)
    s[key] = ["0", "1"].includes(p.get(key) || "") ? p.get(key)! : "";
  s.occupancy = ["vacant", "occupied", "unknown"].includes(
    p.get("occupancy") || "",
  )
    ? p.get("occupancy")!
    : "";
  const level = p.get("level");
  if (
    level !== null &&
    level !== "" &&
    Number.isInteger(Number(level)) &&
    Number(level) >= -20 &&
    Number(level) <= 50
  )
    s.level = level;
  const bbox = p.get("bbox") || "",
    center = p.get("center") || "";
  if (coordinateTuple(bbox, 4)) s.bbox = bbox;
  if (
    coordinateTuple(center, 2) &&
    s.radiusKm &&
    Number(s.radiusKm) >= 0.1 &&
    Number(s.radiusKm) <= 200
  ) {
    s.center = center;
    s.bbox = "";
  } else s.radiusKm = "";
  return s;
}
export function searchProblem(s: SearchState): string {
  for (const value of [s.annualChargesMax, s.propertyTaxMax])
    if (
      value !== "" &&
      (!Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 1000000 ||
        Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) >=
          0.000001)
    )
      return "Indiquez un montant annuel entre 0 et 1 000 000 €, avec deux décimales maximum.";
  if (
    s.minSpaces !== "" &&
    (!Number.isInteger(Number(s.minSpaces)) ||
      Number(s.minSpaces) < 1 ||
      Number(s.minSpaces) > 500)
  )
    return "Indiquez un nombre de places entier entre 1 et 500.";
  if (
    s.sellerType !== "" &&
    !["private", "professional"].includes(s.sellerType)
  )
    return "Choisissez un particulier ou un professionnel.";
  if (s.minPrice && s.maxPrice && Number(s.minPrice) > Number(s.maxPrice))
    return "Le budget minimum doit être inférieur ou égal au maximum.";
  if (
    s.level !== "" &&
    (!Number.isInteger(Number(s.level)) ||
      Number(s.level) < -20 ||
      Number(s.level) > 50)
  )
    return "Choisissez un niveau entier entre −20 et 50.";
  if (
    s.radiusKm &&
    (!coordinateTuple(s.center, 2) ||
      Number(s.radiusKm) < 0.1 ||
      Number(s.radiusKm) > 200)
  )
    return "Le rayon doit être compris entre 0,1 et 200 km avec un centre valide.";
  for (const value of [s.minPrice, s.maxPrice, s.minArea])
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0))
      return "Indiquez des montants et surfaces positifs.";
  return "";
}
export function searchParams(s: SearchState, api = false): URLSearchParams {
  const p = new URLSearchParams();
  if (api || s.transactionType === "rent")
    p.set("transactionType", s.transactionType);
  if (s.city) p.set(api ? "q" : "city", s.city);
  if (s.type) p.set("type", s.type);
  for (const [field, param] of [
    ["minPrice", "priceMin"],
    ["maxPrice", "priceMax"],
    ["annualChargesMax", "annualChargesMax"],
    ["propertyTaxMax", "propertyTaxMax"],
  ] as const)
    if (s[field])
      p.set(param, api ? String(Math.round(Number(s[field]) * 100)) : s[field]);
  if (s.minArea) p.set("areaMin", s.minArea);
  if (s.only3D) p.set("scene", "1");
  if (s.sort !== "recent" || api) p.set("sort", s.sort);
  for (const key of [
    "covered",
    "closed",
    "occupancy",
    "level",
    "bbox",
    "center",
    "radiusKm",
    "minSpaces",
    "sellerType",
  ] as const)
    if (s[key] !== "") p.set(key, s[key]);
  return p;
}
