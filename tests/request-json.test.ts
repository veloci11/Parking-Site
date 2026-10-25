import test from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../src/lib/request-json";

test("API conserve le corps et les en-têtes JSON, et laisse le navigateur borner les fichiers", async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_path: string, options: RequestInit) => {
      calls.push(options);
      return Response.json({ data: { id: "saved" } });
    },
  );
  assert.deepEqual(
    await requestJson("/api/listings", {
      method: "POST",
      body: JSON.stringify({ title: "Parking" }),
      headers: { "X-Test": "retained" },
    }),
    { data: { id: "saved" } },
  );
  assert.equal(
    new Headers(calls[0].headers).get("Content-Type"),
    "application/json",
  );
  assert.equal(new Headers(calls[0].headers).get("X-Test"), "retained");
  await requestJson("/api/media", { method: "POST", body: new FormData() });
  assert.equal(new Headers(calls[1].headers).has("Content-Type"), false);
});

test("une page HTML du proxy devient une erreur lisible sans exposer son contenu", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>upstream internals</html>", {
        status: 503,
        headers: { "x-request-id": "5b41daf0-126e-4fe8-8e12-cd4c7e4128f2" },
      }),
  );
  await assert.rejects(requestJson("/api/listings"), (error: Error) => {
    assert.match(error.message, /momentanément indisponible/);
    assert.match(error.message, /Référence : 5b41daf0/);
    assert.doesNotMatch(error.message, /html|upstream|JSON|Unexpected/);
    return true;
  });
});

test("les erreurs métier restent lisibles et une réponse vide n'est pas une réussite", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "Ajoutez une photo." }, { status: 422 }),
  );
  await assert.rejects(requestJson("/api/listings"), /Ajoutez une photo/);
  t.mock.method(globalThis, "fetch", async () => Response.json(null));
  await assert.rejects(requestJson("/api/listings"), /réponse inattendue/);
});

test("une interruption d'écriture ne rejoue jamais la demande et indique le résultat incertain", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    requestJson("/api/messages", { method: "POST", body: "{}" }),
    /Vérifiez si votre demande a été enregistrée/,
  );
  assert.equal(attempts, 1);
});

test("un serveur silencieux libère la demande et une annulation explicite reste identifiable", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_path: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException("Aborted", "AbortError"));
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener("abort", abort, { once: true });
      }),
  );
  await assert.rejects(requestJson("/api/listings", {}, 5), /trop de temps/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestJson("/api/listings", { signal: controller.signal }),
    { name: "AbortError" },
  );
});
