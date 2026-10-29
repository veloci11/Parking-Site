import { test } from "node:test";
import assert from "node:assert/strict";
import { draftNavigationTarget } from "../src/lib/draft-navigation";

const current = "https://parking.test/compte/annonces/123/modifier";
test("draft saving protects same-tab header links and external navigation", () => {
  assert.equal(
    draftNavigationTarget("/?display=map", current, { button: 0 })?.href,
    "https://parking.test/?display=map",
  );
  assert.equal(
    draftNavigationTarget("/compte/messages", current, {
      button: 0,
      target: "_self",
    })?.pathname,
    "/compte/messages",
  );
  assert.equal(
    draftNavigationTarget("https://example.com/help", current, { button: 0 })
      ?.origin,
    "https://example.com",
  );
});
test("in-page validation, new tabs, downloads and email links are never hijacked", () => {
  for (const click of [
    { button: 1 },
    { button: 0, ctrlKey: true },
    { button: 0, metaKey: true },
    { button: 0, shiftKey: true },
    { button: 0, altKey: true },
    { button: 0, download: true },
    { button: 0, target: "_blank" },
  ])
    assert.equal(
      draftNavigationTarget("/compte/messages", current, click),
      null,
    );
  for (const href of [
    current,
    "#listing-title",
    "mailto:test@example.invalid",
    "tel:0123456789",
    "javascript:void(0)",
  ])
    assert.equal(draftNavigationTarget(href, current, { button: 0 }), null);
});
