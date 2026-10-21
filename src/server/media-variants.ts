import sharp from "sharp";
import { ApiError } from "./security";
export function mediaVariantWidth(url: URL): number | undefined {
  const values = url.searchParams.getAll("w");
  if (!values.length) return undefined;
  if (values.length !== 1 || !["480", "960", "1920"].includes(values[0]))
    throw new ApiError(400, "Largeur de média non autorisée.");
  return Number(values[0]);
}
export async function resizeAuthorizedMedia(
  bytes: Buffer,
  width: number | undefined,
): Promise<Buffer> {
  return width
    ? sharp(bytes, { limitInputPixels: 30000000 })
        .resize({ width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
    : bytes;
}
