/** Only intercept links that actually replace the current document. */
export function draftNavigationTarget(
  href: string,
  currentHref: string,
  click: {
    button: number;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    target?: string;
    download?: boolean;
  },
): URL | null {
  if (
    click.button !== 0 ||
    click.metaKey ||
    click.ctrlKey ||
    click.shiftKey ||
    click.altKey ||
    click.download ||
    (click.target && click.target !== "_self")
  )
    return null;
  const current = new URL(currentHref);
  const destination = new URL(href, current);
  if (!["http:", "https:"].includes(destination.protocol)) return null;
  if (
    destination.origin === current.origin &&
    destination.pathname === current.pathname &&
    destination.search === current.search
  )
    return null;
  return destination;
}
