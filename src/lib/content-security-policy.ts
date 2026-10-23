export function contentSecurityPolicy(
  nonce: string,
  development = false,
  mapStyle?: string,
) {
  if (!/^[A-Za-z0-9+/]{22}==$/.test(nonce))
    throw new Error("Invalid CSP nonce");
  const connect = new Set(["'self'", "https://tiles.openfreemap.org"]);
  if (mapStyle) {
    const url = new URL(mapStyle);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Map style must use an HTTPS origin without credentials");
    connect.add(url.origin);
  }
  if (development) {
    connect.add("ws://localhost:3000");
    connect.add("ws://127.0.0.1:3000");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    // MapLibre and the 3D viewer set numeric positions on existing DOM elements.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
