import { ApiError } from "./security";
/** Bound the stream itself, including requests without Content-Length. */
export async function boundedFormData(
  request: Request,
  maxBytes = 12 * 1024 * 1024,
): Promise<FormData> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes)
    throw new ApiError(413, "Image trop volumineuse (10 Mo maximum).");
  if (!request.body) throw new ApiError(400, "Fichier manquant.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "Image trop volumineuse (10 Mo maximum).");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bounded = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": request.headers.get("content-type") || "" },
    body: bytes,
  });
  try {
    return await bounded.formData();
  } catch {
    throw new ApiError(400, "Dépôt de fichier invalide.");
  }
}
