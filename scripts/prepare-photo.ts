/** Local manual photo masking. No network, upload, AI detection or public trace. */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  inspectPhotoFile,
  preparePhotoFile,
  reviewPhotoFile,
} from "../src/server/photo-redaction";

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      input: { type: "string" },
      plan: { type: "string" },
      "output-dir": { type: "string" },
      bundle: { type: "string" },
      review: { type: "string" },
    },
  });
  const command = positionals[0];
  const required =
    command === "inspect"
      ? ["input"]
      : command === "prepare"
        ? ["input", "plan", "output-dir"]
        : command === "review"
          ? ["bundle", "review"]
          : [];
  if (
    positionals.length !== 1 ||
    !required.length ||
    required.some((key) => !values[key as keyof typeof values]) ||
    Object.keys(values).some((key) => !required.includes(key))
  )
    throw new Error("PHOTO_ARGUMENTS");
  const result =
    command === "inspect"
      ? await inspectPhotoFile(values.input!)
      : command === "prepare"
        ? await preparePhotoFile(
            values.input!,
            values.plan!,
            values["output-dir"]!,
          )
        : await reviewPhotoFile(values.bundle!, values.review!);
  console.info(JSON.stringify(result));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error && /^PHOTO_[A-Z_]+$/.test(error.message)
        ? error.message
        : "PHOTO_PREPARATION_FAILED",
    );
    process.exitCode = 1;
  });
}
