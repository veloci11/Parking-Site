import test from "node:test";
import assert from "node:assert/strict";
import { readinessUrl } from "../scripts/check-health";

test("operator health check never sends credentials to an arbitrary path or unencrypted remote origin", () => {
  assert.equal(
    readinessUrl("https://parking.example").href,
    "https://parking.example/api/ready",
  );
  assert.equal(readinessUrl("http://127.0.0.1:3001").port, "3001");
  for (const url of [
    "http://parking.example",
    "https://username:password@parking.example",
    "https://parking.example/?token=secret",
    "https://parking.example/private/path",
    "file:///tmp/site",
  ])
    assert.throws(() => readinessUrl(url));
});
