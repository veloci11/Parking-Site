// Fixed stdin/stdout entry point. Never receives paths, credentials or project data.
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import dgram from "node:dgram";
const denied = () => {
  throw new Error("NETWORK_DISABLED");
};
globalThis.fetch = denied;
globalThis.WebSocket = undefined;
net.connect = denied;
net.createConnection = denied;
net.Socket.prototype.connect = denied;
http.request = denied;
http.get = denied;
https.request = denied;
https.get = denied;
tls.connect = denied;
dgram.createSocket = denied;
syncBuiltinESMExports();
// PDF.js diagnostics must never contaminate the binary protocol or leak input.
console.log = console.info = console.warn = console.error = () => {};
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new Error("SOURCE_SIZE");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(Buffer.concat(chunks, size));
  if (bytes.length < 20 || bytes.length > 25 * 1024 * 1024)
    throw new Error("SOURCE_SIZE");
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let pageCount = 1;
  const previews = [];
  if (Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-") {
    const task = pdf.getDocument({
      data: bytes,
      isEvalSupported: false,
      enableXfa: false,
      useSystemFonts: false,
      disableFontFace: true,
      useWorkerFetch: false,
      useWasm: false,
      disableAutoFetch: true,
      disableRange: true,
      disableStream: true,
      stopAtErrors: true,
      maxImageSize: 16000000,
      canvasMaxAreaInBytes: 16000000,
    });
    const doc = await task.promise;
    pageCount = doc.numPages;
    if (pageCount > 30) throw new Error("PDF_PAGE_LIMIT");
    if ((await doc.getJSActions()) || (await doc.getAttachments()))
      throw new Error("PDF_ACTIVE_CONTENT");
    const fields = await doc.getFieldObjects();
    if (fields && Object.keys(fields).length)
      throw new Error("PDF_FORM_UNSUPPORTED");
    for (let n = 1; n <= pageCount; n++) {
      const page = await doc.getPage(n);
      if (await page.getJSActions()) throw new Error("PDF_ACTIVE_CONTENT");
      if (n <= 3) {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(2, 1800 / Math.max(base.width, base.height)),
        });
        if (
          !Number.isFinite(viewport.width) ||
          !Number.isFinite(viewport.height) ||
          viewport.width < 1 ||
          viewport.height < 1
        )
          throw new Error("PDF_PAGE_SIZE");
        const canvas = createCanvas(
          Math.min(1800, Math.ceil(viewport.width)),
          Math.min(1800, Math.ceil(viewport.height)),
        );
        await page.render({
          canvasContext: canvas.getContext("2d"),
          canvas,
          viewport,
          annotationMode: pdf.AnnotationMode.DISABLE,
          background: "rgb(255,255,255)",
        }).promise;
        const png = canvas.toBuffer("image/png");
        if (png.length > 4 * 1024 * 1024) throw new Error("PREVIEW_SIZE");
        previews.push(png);
      }
      page.cleanup();
    }
    await task.destroy();
  } else {
    const { loadImage } = await import("@napi-rs/canvas");
    const image = await loadImage(Buffer.from(bytes));
    if (image.width * image.height > 16000000) throw new Error("IMAGE_SIZE");
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = createCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
    );
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toBuffer("image/png");
    if (png.length > 4 * 1024 * 1024) throw new Error("PREVIEW_SIZE");
    previews.push(png);
  }
  const header = Buffer.from(
    JSON.stringify({ pageCount, previews: previews.map((png) => png.length) }),
  );
  const prefix = Buffer.alloc(8);
  prefix.write("GPR1");
  prefix.writeUInt32BE(header.length, 4);
  process.stdout.write(prefix);
  process.stdout.write(header);
  for (const png of previews) process.stdout.write(png);
} catch {
  process.exitCode = 1;
}
