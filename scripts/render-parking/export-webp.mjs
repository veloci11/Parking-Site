import sharp from "sharp";
import { access, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const folder = fileURLToPath(
  new URL("../../public/parking-renders/", import.meta.url),
);
const work = fileURLToPath(
  new URL("../../.data/render-parking/", import.meta.url),
);
for (const level of [1, 2]) {
  const name = `demo-level-minus-${level}`;
  const stem = `${folder}${name}`;
  const input = `${work}${name}.png`;
  await access(input);
  await sharp(input).webp({ quality: 94, effort: 6 }).toFile(`${stem}.webp`);
  const bytes = await readFile(`${stem}.webp`);
  const metadata = await sharp(bytes).metadata();
  const projection = JSON.parse(await readFile(`${stem}.json`, "utf8"));
  projection.renderHash = createHash("sha256").update(bytes).digest("hex");
  projection.hashAlgorithm = "SHA-256";
  projection.imageBytes = bytes.length;
  await writeFile(`${stem}.json`, `${JSON.stringify(projection, null, 2)}\n`);
  console.log(
    `Level -${level}: ${metadata.width}x${metadata.height}, ${bytes.length} bytes`,
  );
}
