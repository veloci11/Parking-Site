import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DeletionReceipt,
  type DeletionRequestReceipt,
} from "../src/components/account/deletion-status";

const receipt: DeletionRequestReceipt = {
  id: "synthetic-private-receipt",
  state: "requested",
  createdAt: "2026-10-22T10:00:00Z",
  limitedCleanupAt: null,
  completeErasure: false,
  retainedCategories: ["auth_identity", "audit", "backups"],
};
function copy(value: DeletionRequestReceipt) {
  return renderToStaticMarkup(
    createElement(DeletionReceipt, { receipt: value }),
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

test("a completed receipt reports verified active-service removal while preserving audit and backup limits", () => {
  const value = copy({
    ...receipt,
    state: "completed",
    activeSystemErased: true,
    updatedAt: "2026-10-22T12:00:00Z",
    retainedCategories: [
      "minimal_receipt",
      "audit",
      "backups_external_rotation",
    ],
  });
  assert.match(value, /Retrait du service actif terminé/);
  assert.match(value, /calendrier de conservation et de rotation/);
  assert.match(
    value,
    /ne confirme pas un effacement total de toutes les copies/,
  );
  assert.match(value, /Reçu minimal de traitement/);
  assert.match(value, /Journaux d’audit/);
  assert.match(value, /Sauvegardes soumises à leur calendrier de rotation/);
  assert.match(value, /Suivi mis à jour/);
  assert.doesNotMatch(value, /Nettoyage limité terminé, examen restant/);
  assert.doesNotMatch(value, /email de confirmation/);
});

test("an in-progress or incomplete completed receipt never claims verified removal", () => {
  const progress = copy({ ...receipt, state: "purging" });
  assert.match(progress, /Suppression en cours/);
  assert.match(progress, /ne confirme pas encore sa fin/);
  assert.doesNotMatch(progress, /Retrait du service actif terminé/);
  for (const activeSystemErased of [undefined, false]) {
    const incomplete = copy({
      ...receipt,
      state: "completed",
      activeSystemErased,
    });
    assert.match(
      incomplete,
      /Clôture enregistrée, vérification du reçu restante/,
    );
    assert.match(incomplete, /ne confirme pas encore le retrait des données/);
    assert.doesNotMatch(incomplete, /Retrait du service actif terminé/);
  }
});

test("legacy requested and manual-review receipts keep their limited scope and optional cleanup date", () => {
  const requested = copy(receipt);
  assert.match(requested, /Demande enregistrée/);
  assert.match(requested, /L’effacement complet n’est pas confirmé/);
  assert.doesNotMatch(requested, /Nettoyage des favoris/);
  const reviewed = copy({
    ...receipt,
    state: "manual_review",
    limitedCleanupAt: "2026-10-22T11:00:00Z",
  });
  assert.match(reviewed, /Nettoyage limité terminé, examen restant/);
  assert.match(
    reviewed,
    /Nettoyage des favoris, notifications et accusés techniques/,
  );
  assert.match(reviewed, /Identité du compte/);
  assert.match(reviewed, /Référence : synthetic-private-receipt/);
});
