import { createHash } from "node:crypto";
import type { PublicScene } from "@/lib/scene-contract";
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
/** The public manifest only is hashed; private source identifiers never enter it. */
export function attachPublicManifestHash(scene: PublicScene): PublicScene {
  const manifest = {
    ...scene.manifest,
    schemaVersion: "gp-parametric-1.1" as const,
  };
  return {
    ...scene,
    manifest,
    runtimeContract: "gp-parametric-level/1.1",
    manifestHash: createHash("sha256")
      .update(canonical(manifest))
      .digest("hex"),
    hashAlgorithm: "sha256:gp-json-sort-v1",
  };
}
