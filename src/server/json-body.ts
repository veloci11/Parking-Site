import { ApiError } from "./security";
/** Bound actual bytes, not just the optional Content-Length header. */
export async function readBoundedJson(
  request: Request,
  max = 128 * 1024,
): Promise<any> {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new ApiError(413, "Demande trop volumineuse.");
  if (!request.body) throw new ApiError(400, "Données JSON manquantes.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ApiError(413, "Demande trop volumineuse.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "Données JSON invalides.");
  }
}
