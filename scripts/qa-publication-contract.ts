/** Current016–024 QA helpers; used only by explicitly invoked dedicated-fixture scripts. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { Listing } from "../src/lib/types";
type Reply = { status: number; data: any; raw?: any; code?: string };
type Api = (path: string, method?: string, body?: unknown) => Promise<Reply>;
export type QaAdmin = { id: string; email: string; password: string };
type RecordFixture = (kind: string, id: string) => void | Promise<void>;
type RecordCheck = (name: string, value: unknown, reply?: Reply) => void;

/** A fresh --run cannot reuse the IDs of a deleted or unrelated fixture set. */
export function qaInventoryMatchesUsers(inventory: unknown, userIds: string[]) {
  if (!inventory || typeof inventory !== "object") return false;
  const ids = (inventory as { userIds?: unknown }).userIds;
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => typeof id === "string" && userIds.includes(id))
  );
}

/** RFC 6238; the only secrets accepted by the recipes are freshly enrolled QA factors. */
export function qaTotp(secret: string, time = Date.now(), digits = 6) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(char);
    assert.ok(index >= 0, "qa_totp_invalid_private_encoding");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}

/**
 * Logs in a dedicated fixture normally, then enrolls/challenges/verifies its own TOTP.
 * It never changes a role/policy and never keeps a QR, secret, code or token in reports.
 * Keep this instance until finally, then cleanup() before logging its client out.
 */
export class QaStrongSession {
  factorId: string | null = null;
  factorRevoked = false;
  verificationAttempts = 0;
  constructor(
    private api: Api,
    private identity: QaAdmin,
    private prefix: string,
    private record: RecordFixture = () => {},
    private recordCheck: RecordCheck = () => {},
  ) {}
  private check(name: string, value: unknown, reply?: Reply) {
    this.recordCheck(`${this.prefix}_${name}`, value, reply);
    assert.ok(value, `${this.prefix}_${name}`);
  }
  async establish(expectedRole: "admin" | "moderator") {
    assert.ok(
      this.identity.id &&
        this.identity.email.endsWith(".invalid") &&
        this.identity.password,
      "Strong-session QA requires a coordinator-created .invalid fixture",
    );
    const current = await this.api("session");
    if (current.status !== 200 || current.data?.id !== this.identity.id) {
      const login = await this.api("auth/login", "POST", {
        email: this.identity.email,
        password: this.identity.password,
      });
      this.check("login", login.status === 200, login);
      this.check("identity", login.data?.id === this.identity.id);
      this.check("role", login.data?.role === expectedRole);
    } else this.check("role", current.data.role === expectedRole);
    const state = await this.api("mfa");
    this.check(
      "mfa_available",
      state.status === 200 && state.data?.supported,
      state,
    );
    if (state.data.currentLevel === "aal2") return;
    // A prior verified factor belongs to a previous run: do not bypass it or create
    // another factor. The coordinator must clean its exact recorded fixture first.
    this.check(
      "no_preexisting_verified_factor",
      !state.data.factors.some((f: any) => f.status === "verified"),
    );
    if (state.data.requiredForAdmin) {
      const blocked = await this.api("admin/revisions");
      this.check(
        "aal1_admin_blocked",
        blocked.status === 403 &&
          ["MFA_REQUIRED", "MFA_OR_PERMISSION_REQUIRED"].includes(
            blocked.code || "",
          ),
        blocked,
      );
    }
    if (expectedRole === "admin") {
      const registry = await this.api("admin/parking-registry");
      this.check("registry_rejects_aal1", registry.status === 403, registry);
    }
    const enrolled = await this.api("mfa/enroll", "POST", {});
    this.check("factor_enrolled", enrolled.status === 200, enrolled);
    this.factorId = enrolled.data.factorId;
    this.check(
      "private_factor_contract",
      typeof this.factorId === "string" &&
        typeof enrolled.data.secret === "string" &&
        enrolled.data.secret.length >= 16 &&
        typeof enrolled.data.qrCode === "string" &&
        enrolled.data.qrCode.length > 20,
    );
    await this.record("mfaFactorIds", this.factorId!);
    let verified: Reply | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const challenge = await this.api("mfa/challenge", "POST", {
        factorId: this.factorId,
      });
      this.check(
        `challenge_${attempt + 1}`,
        challenge.status === 200,
        challenge,
      );
      verified = await this.api("mfa/verify", "POST", {
        factorId: this.factorId,
        challengeId: challenge.data.challengeId,
        code: qaTotp(enrolled.data.secret),
      });
      this.verificationAttempts++;
      if (
        verified.status === 200 ||
        verified.code !== "MFA_INVALID" ||
        attempt === 1
      )
        break;
      // Move past a possible 30-second boundary without repeating an expired code.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    this.check("code_verified", verified?.status === 200, verified);
    const strong = await this.api("mfa");
    this.check(
      "session_aal2",
      strong.status === 200 && strong.data.currentLevel === "aal2",
      strong,
    );
    this.check(
      "own_factor_verified",
      strong.data.factors.some(
        (f: any) => f.id === this.factorId && f.status === "verified",
      ),
    );
  }
  async cleanup() {
    if (!this.factorId || this.factorRevoked) return;
    const removed = await this.api("mfa/unenroll", "POST", {
      factorId: this.factorId,
      password: this.identity.password,
    });
    this.check("own_factor_removed", removed.status === 200, removed);
    this.factorRevoked = true;
    const state = await this.api("mfa");
    this.check(
      "own_factor_absent",
      state.status === 200 &&
        !state.data.factors.some((f: any) => f.id === this.factorId),
      state,
    );
  }
}
const references = new Map<
  string,
  { siteId: string; units: { unitId: string; spaceId: string }[] }
>();
export async function confirmQaLocation(api: Api, listing: Listing) {
  const preview = await api(`listings/${listing.id}/preview`);
  assert.equal(preview.status, 200, "Current-contract private preview failed");
  assert.equal(preview.data.locationPrecision, listing.locationPrecision);
  if (listing.locationPrecision === "exact_opt_in")
    assert.deepEqual(preview.data.coordinates, listing.coordinates);
  else {
    assert.equal(preview.data.address, undefined);
    if (
      listing.coordinates &&
      preview.data.coordinates &&
      listing.coordinates.some(
        (c) => Math.abs(c * 100 - Math.round(c * 100)) > 1e-8,
      )
    )
      assert.notDeepEqual(
        preview.data.coordinates,
        listing.coordinates,
        "Area preview exposed exact coordinates",
      );
  }
  const confirmed = await api(`listings/${listing.id}`, "PATCH", {
    version: listing.version,
    locationConfirmedAt: new Date().toISOString(),
  });
  assert.equal(
    confirmed.status,
    200,
    "Location confirmation must follow the preview in a separate write",
  );
  return confirmed.data as Listing;
}
export async function linkQaPublication(
  adminApi: Api,
  identity: QaAdmin | undefined,
  listing: Listing,
  record: RecordFixture = () => {},
) {
  assert.ok(
    identity?.id && identity.email && identity.password,
    "019 requires a separately provisioned QA admin identity; never elevate a moderator",
  );
  const session = await adminApi("session");
  assert.equal(session.status, 200, "QA admin session unavailable");
  assert.equal(
    session.data?.id,
    identity.id,
    "Establish the QA admin session first",
  );
  assert.equal(session.data.role, "admin", "Configured fixture is not admin");
  const assurance = await adminApi("mfa");
  assert.equal(assurance.status, 200);
  assert.equal(
    assurance.data.currentLevel,
    "aal2",
    "Promote the QA admin through real TOTP first",
  );
  let ref = references.get(listing.id);
  if (!ref) {
    const existing = await adminApi(
      `admin/parking-registry?listingId=${listing.id}`,
    );
    assert.equal(existing.status, 200);
    const links = existing.data.links.filter(
      (u: any) => u.listingId === listing.id,
    );
    if (
      links.length === listing.spaces.length &&
      listing.spaces.every((s) => links.some((l: any) => l.unitId === s.id))
    )
      ref = {
        siteId: links[0].siteId,
        units: links.map((u: any) => ({
          unitId: u.unitId,
          spaceId: u.spaceId,
        })),
      };
  }
  if (!ref) {
    const site = await adminApi("admin/parking-registry", "POST", {
      action: "create_site",
      publicName: "Recette technique fictive",
      internalReference: "qa-" + randomUUID(),
    });
    assert.equal(site.status, 200, "QA canonical site creation failed");
    await record("registrySiteIds", site.data.id);
    const levels = new Map<number, string>(),
      units = [];
    for (const unit of listing.spaces) {
      let levelId = levels.get(unit.level);
      if (!levelId) {
        const level = await adminApi("admin/parking-registry", "POST", {
          action: "add_level",
          siteId: site.data.id,
          code: `QA-${unit.level}`,
          label: `Niveau fictif ${unit.level}`,
          number: unit.level,
          sortOrder: unit.level,
        });
        assert.equal(level.status, 200);
        levelId = level.data.id;
        levels.set(unit.level, levelId!);
        await record("registryLevelIds", levelId!);
      }
      const physical = await adminApi("admin/parking-registry", "POST", {
        action: "add_space",
        levelId,
        number: unit.number,
        privateLotReference: "QA-" + unit.number,
        areaM2: unit.areaM2,
        lengthM: unit.lengthM,
        widthM: unit.widthM,
        clearanceM: unit.clearanceM,
      });
      assert.equal(physical.status, 200);
      await record("registrySpaceIds", physical.data.id);
      units.push({ unitId: unit.id, spaceId: physical.data.id });
    }
    ref = { siteId: site.data.id, units };
    references.set(listing.id, ref);
  }
  const linked = await adminApi("admin/parking-registry", "POST", {
    action: "link_listing",
    listingId: listing.id,
    version: listing.version,
    siteId: ref.siteId,
    units: ref.units,
    reason:
      "Rattachement des fixtures dédiées au contrôle du contrat de publication019.",
  });
  assert.equal(linked.status, 200, "QA canonical linkage refused");
  assert.equal(linked.data.status, "saved");
  return linked.data.version as number;
}
