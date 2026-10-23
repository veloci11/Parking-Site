/** Reserved read-only examples, distinct from every real or local-demo listing. */
export const PUBLIC_SHOWCASE_IDS = [
  "de600000-0000-4000-8000-000000000016",
  "de600000-0000-4000-8000-000000000018",
] as const;

export function isPublicShowcase(id: string) {
  return PUBLIC_SHOWCASE_IDS.some((value) => value === id);
}
