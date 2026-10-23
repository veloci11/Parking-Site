import { z } from "zod";

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const renderSchema = z
  .object({
    schemaVersion: z.literal("gp-parking-render/1"),
    level: z.number().int().min(-20).max(50),
    isDemo: z.literal(true),
    width: z.number().int().min(640).max(4096),
    height: z.number().int().min(480).max(4096),
    image: z.string().regex(/^\/parking-renders\/[a-z0-9-]+\.webp$/),
    renderHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    spaces: z
      .array(
        z.object({
          number: z.string().min(1).max(40),
          polygon: z.array(point).min(3).max(64),
          label: point,
          anchor: point.optional(),
          mask: z
            .string()
            .regex(/^\/parking-renders\/[a-z0-9-]+-mask\.png$/)
            .optional(),
          maskHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          hitContours: z
            .array(z.array(point).min(3).max(512))
            .min(1)
            .max(64)
            .optional(),
        }),
      )
      .min(1)
      .max(500),
  })
  .passthrough();

export type ParkingRender = z.infer<typeof renderSchema>;

/** The bitmap and hit areas must be exported from the same camera and geometry. */
export function parseParkingRender(
  value: unknown,
  level: number,
): ParkingRender | null {
  const parsed = renderSchema.safeParse(value);
  if (!parsed.success || parsed.data.level !== level) return null;
  const numbers = parsed.data.spaces.map((space) => space.number);
  if (new Set(numbers).size !== numbers.length) return null;
  if (
    parsed.data.spaces.some(
      (space) =>
        Boolean(space.mask) !== Boolean(space.maskHash) ||
        Boolean(space.mask) !== Boolean(space.hitContours),
    )
  )
    return null;
  return parsed.data;
}

const cache = new Map<number, ParkingRender>();
const pending = new Map<number, Promise<ParkingRender>>();

/** A caller leaving the viewer must not cancel another visible floor's request. */
function waitForRender(request: Promise<ParkingRender>, signal: AbortSignal) {
  return new Promise<ParkingRender>((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    request.then(
      (render) => {
        signal.removeEventListener("abort", abort);
        resolve(render);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

/** These images describe only the explicitly fictional demonstration parking. */
export async function loadDemoParkingRender(
  level: number,
  signal: AbortSignal,
): Promise<ParkingRender> {
  signal.throwIfAborted();
  if (level !== -1 && level !== -2) throw new Error("Rendu indisponible");
  const cached = cache.get(level);
  if (cached) return cached;
  let request = pending.get(level);
  if (!request) {
    request = (async () => {
      const response = await fetch(
        `/parking-renders/demo-level-minus-${-level}.json`,
        { cache: "no-cache" },
      );
      if (!response.ok) throw new Error("Rendu indisponible");
      const render = parseParkingRender(await response.json(), level);
      if (!render) throw new Error("Rendu indisponible");
      cache.set(level, render);
      return render;
    })().finally(() => pending.delete(level));
    pending.set(level, request);
  }
  return waitForRender(request, signal);
}
