export interface AdminReviewSearchable {
  id: string;
  title: string;
  city: string;
  district?: string;
  sellerName?: string;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

/** Match all literal terms without interpreting listing IDs or input as regex. */
export function filterAdminReviewItems<T extends AdminReviewSearchable>(
  items: T[],
  query: string,
): T[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((item) => {
    const content = normalize(
      [item.id, item.title, item.city, item.district, item.sellerName]
        .filter(Boolean)
        .join(" "),
    );
    return terms.every((term) => content.includes(term));
  });
}
