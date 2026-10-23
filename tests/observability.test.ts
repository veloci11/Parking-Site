import test from "node:test";
import assert from "node:assert/strict";
import { observedRoute, type RequestEvent } from "../src/server/observability";
import { readinessHandler } from "../src/server/readiness";
import { apiErrorMessage } from "../src/lib/api-error";
import { currentRequestId } from "../src/server/request-context";

test("request telemetry keeps cookies and response while excluding private request data", async () => {
  const events: RequestEvent[] = [];
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  headers.append("Set-Cookie", "session=opaque; HttpOnly; Path=/");
  headers.append("Set-Cookie", "refresh=opaque; HttpOnly; Path=/");
  const handler = observedRoute(
    async () => new Response("created", { status: 201, headers }),
    "application",
    (event) => events.push(event),
  );
  const response = await handler(
    new Request(
      "https://example.test/api/messages/private-id?token=private-token",
      {
        method: "POST",
        headers: {
          "x-request-id": "attacker supplied",
          authorization: "Bearer secret",
        },
        body: "private message content",
      },
    ),
  );
  assert.equal(response.status, 201);
  assert.equal(await response.text(), "created");
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("x-request-id")!, /^[0-9a-f-]{36}$/);
  assert.match(response.headers.get("server-timing")!, /^handler;dur=\d/);
  assert.equal(events.length, 1);
  assert.equal(events[0].requestId, response.headers.get("x-request-id"));
  assert.ok(
    !/private|token|secret|attacker|opaque/.test(JSON.stringify(events)),
  );
});

test("unexpected handler failures are generic and logger failures cannot break a mutation", async () => {
  const failed = await observedRoute(
    async () => {
      throw new Error("database password=secret");
    },
    "application",
    () => {},
  )(new Request("https://example.test"));
  assert.equal(failed.status, 500);
  assert.ok(!(await failed.text()).includes("secret"));
  const okay = await observedRoute(
    async () => Response.json({ data: "saved" }),
    "application",
    () => {
      throw new Error("stdout unavailable");
    },
  )(new Request("https://example.test", { method: "POST" }));
  assert.equal(okay.status, 200);
});

test("readiness reports unavailable backend without exposing database details", async () => {
  const previous = process.env.GP_FORCE_LOCAL_DEMO;
  process.env.GP_FORCE_LOCAL_DEMO = "false";
  try {
    const available = await readinessHandler(async () => true)(
      new Request("https://example.test/api/ready"),
    );
    assert.equal(available.status, 200);
    const unavailable = await readinessHandler(async () => {
      throw new Error("private database details");
    })(new Request("https://example.test/api/ready"));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await unavailable.json(), {
      data: { status: "unavailable" },
    });
  } finally {
    if (previous === undefined) delete process.env.GP_FORCE_LOCAL_DEMO;
    else process.env.GP_FORCE_LOCAL_DEMO = previous;
  }
});

test("support error references are restricted to server UUIDs and server failures", () => {
  const id = "e85f3d17-0123-4abc-8a01-012345678abc";
  assert.ok(
    apiErrorMessage(
      new Response(null, { status: 503, headers: { "x-request-id": id } }),
      "Service indisponible.",
    ).includes(id),
  );
  assert.equal(
    apiErrorMessage(
      new Response(null, { status: 400, headers: { "x-request-id": id } }),
      "Vérifiez votre saisie.",
    ),
    "Vérifiez votre saisie.",
  );
  assert.equal(
    apiErrorMessage(
      new Response(null, {
        status: 500,
        headers: { "x-request-id": "untrusted value" },
      }),
      "Erreur.",
    ),
    "Erreur.",
  );
});
test("correlation remains isolated across concurrent requests and limits include retry timing", async () => {
  const handler = observedRoute(
    async () => {
      const id = currentRequestId();
      await Promise.resolve();
      assert.equal(currentRequestId(), id);
      return Response.json({ id }, { status: 429 });
    },
    "application",
    () => {},
  );
  const responses = await Promise.all([
    handler(new Request("https://example.test/a")),
    handler(new Request("https://example.test/b")),
  ]);
  const ids: string[] = [];
  for (const response of responses) {
    ids.push(response.headers.get("x-request-id")!);
    assert.equal(
      (await response.json()).id,
      response.headers.get("x-request-id"),
    );
    assert.equal(response.headers.get("retry-after"), "60");
  }
  assert.notEqual(ids[0], ids[1]);
  assert.equal(currentRequestId(), undefined);
});
