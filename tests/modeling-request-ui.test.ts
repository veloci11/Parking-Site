import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelRequest } from "../src/components/account/modeling-request";

test("optional modeling request embeds inside the wizard without nesting a form or submitting it", () => {
  const html = renderToStaticMarkup(
    createElement(
      "form",
      { action: "/preview" },
      createElement(ModelRequest, { listingId: "test-listing" }),
    ),
  );
  assert.equal((html.match(/<form\b/g) || []).length, 1);
  assert.match(html, /Modélisation 3D · facultatif/);
  assert.match(html, /ne bloque pas la publication de l’annonce/);
  assert.match(html, /href="\/compte\/scenes">Ajouter un plan<\/a>/);
  assert.doesNotMatch(html, /<button(?![^>]*type="button")/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
});
