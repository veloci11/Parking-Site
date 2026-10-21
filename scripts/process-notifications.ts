/** Preview by default. --send additionally requires GP_EMAIL_DELIVERY=enabled and SMTP credentials. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { db, transact } from "../src/server/db";
import {
  ensureNotificationSchema,
  notificationContent,
} from "../src/server/notifications";
import {
  verifiedSiteOrigin,
  usableRecipient,
  mailOptions,
  smtpTransport,
  classifySmtpError,
  recipientDigest,
} from "../src/server/mail";
async function main() {
  const send = process.argv.includes("--send"),
    local = process.argv.includes("--local");
  if (send && process.env.GP_EMAIL_DELIVERY !== "enabled") {
    console.error(
      "Sending disabled. Explicit --send and GP_EMAIL_DELIVERY=enabled are required.",
    );
    process.exit(1);
  }
  const key = process.env.GP_WORKER_SERVICE_ROLE_KEY;
  const endpoint =
    process.env.GP_WORKER_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!local && (!key || !endpoint)) {
    console.error(
      "Worker requires its private Supabase credential, or --local for a local preview.",
    );
    process.exit(1);
  }
  const client = !local
    ? createClient(endpoint!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  const origin = verifiedSiteOrigin();
  if (send && new URL(origin).protocol !== "https:") {
    console.error("Sending requires the configured HTTPS site origin.");
    process.exit(1);
  }
  const transport = send
    ? smtpTransport()
    : nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
        buffer: true,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
  interface Job {
    id: string;
    user_id: string;
    type: string;
    target_id: string;
    lease_token?: string;
    attempts?: number;
    created_at: string;
  }
  async function jobs(): Promise<Job[]> {
    if (client) {
      if (send) {
        const result = await client.rpc("gp_claim_notifications", {
          p_limit: 10,
        });
        if (result.error) throw new Error("WORKER_CLAIM_FAILED");
        return result.data || [];
      }
      const result = await client
        .from("notification_outbox")
        .select("id,user_id,type,target_id,created_at")
        .eq("status", "pending")
        .lte("next_run_at", new Date().toISOString())
        .order("created_at")
        .limit(25);
      if (result.error) throw new Error("WORKER_READ_FAILED");
      return result.data || [];
    }
    ensureNotificationSchema();
    if (!send)
      return db()
        .prepare(
          "SELECT * FROM outbox WHERE status='pending' AND (next_run_at IS NULL OR next_run_at<=?) ORDER BY created_at LIMIT 25",
        )
        .all(new Date().toISOString()) as unknown as Job[];
    return transact(() => {
      db()
        .prepare(
          "UPDATE outbox SET status='uncertain',last_error_code='LEASE_EXPIRED_REVIEW_REQUIRED',lease_token=NULL,lease_until=NULL WHERE status='processing' AND lease_until<?",
        )
        .run(new Date().toISOString());
      const rows = db()
        .prepare(
          "SELECT * FROM outbox WHERE status='pending' AND (next_run_at IS NULL OR next_run_at<=?) ORDER BY created_at LIMIT 10",
        )
        .all(new Date().toISOString());
      return rows.map((row) => {
        const token = randomUUID();
        db()
          .prepare(
            "UPDATE outbox SET status='processing',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=?",
          )
          .run(
            token,
            new Date(Date.now() + 300000).toISOString(),
            String(row.id),
          );
        return {
          ...row,
          lease_token: token,
          attempts: Number(row.attempts) + 1,
        } as unknown as Job;
      });
    });
  }
  async function finish(
    job: Job,
    status: "sent" | "pending" | "failed" | "suppressed" | "uncertain",
    code: string | null,
  ) {
    if (client) {
      const result = await client.rpc("gp_finish_notification", {
        p_id: job.id,
        p_lease_token: job.lease_token,
        p_status: status,
        p_error_code: code,
      });
      if (result.error || result.data !== true)
        throw new Error("WORKER_ACK_FAILED");
      return;
    }
    const final =
      status === "pending" && Number(job.attempts) >= 5 ? "failed" : status;
    db()
      .prepare(
        "UPDATE outbox SET status=?,last_error_code=?,sent_at=?,next_run_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND status='processing'",
      )
      .run(
        final,
        code,
        status === "sent" ? new Date().toISOString() : null,
        new Date(
          Date.now() +
            Math.min(
              3600000,
              60000 * 2 ** Math.max(0, Number(job.attempts) - 1),
            ),
        ).toISOString(),
        job.id,
        job.lease_token!,
      );
  }
  async function recipient(job: Job) {
    if (client) {
      const [auth, status, profile] = await Promise.all([
        client.auth.admin.getUserById(job.user_id),
        client
          .from("account_statuses")
          .select("status")
          .eq("user_id", job.user_id)
          .single(),
        client
          .from("profiles")
          .select("email_notifications")
          .eq("user_id", job.user_id)
          .single(),
      ]);
      if (auth.error || status.error || profile.error)
        throw new Error("RECIPIENT_LOOKUP_FAILED");
      const user = auth.data.user;
      return {
        email: user.email || "",
        verified: !!user.email_confirmed_at,
        active: status.data.status === "active",
        enabled: profile.data.email_notifications !== false,
      };
    }
    const user = db()
      .prepare(
        "SELECT email,verified,status,email_notifications FROM users WHERE id=?",
      )
      .get(job.user_id);
    return {
      email: String(user?.email || ""),
      verified: !!user?.verified,
      active: user?.status === "active",
      enabled: user?.email_notifications !== 0,
    };
  }
  async function content(job: Job) {
    if (!client) return notificationContent(job.type, job.target_id);
    const result = await client.rpc("gp_notification_content", {
      p_type: job.type,
      p_target: job.target_id,
    });
    if (result.error) throw new Error("CONTENT_LOOKUP_FAILED");
    return result.data as { title: string; body: string; url: string };
  }
  let previewed = 0,
    sent = 0,
    suppressed = 0,
    failed = 0;
  try {
    const rows = await jobs();
    const folder = join(process.cwd(), ".data", "notification-previews");
    if (!send) {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await chmod(folder, 0o700);
    }
    for (const job of rows) {
      let acceptedBySmtp = false;
      try {
        const to = await recipient(job);
        if (!to.active || !to.verified || !to.enabled) {
          if (send) await finish(job, "suppressed", "RECIPIENT_INELIGIBLE");
          suppressed++;
          continue;
        }
        if (send && !usableRecipient(to.email)) {
          await finish(job, "suppressed", "RECIPIENT_TEST_OR_INVALID");
          suppressed++;
          continue;
        }
        const value = await content(job);
        const options = mailOptions(
          { id: job.id, recipient: to.email, type: job.type, ...value },
          origin,
        );
        if (!send) {
          const rendered = await transport.sendMail(options);
          await writeFile(
            join(folder, `${job.id}.eml`),
            rendered.message as Buffer,
            { mode: 0o600 },
          );
          await writeFile(
            join(folder, `${job.id}.json`),
            JSON.stringify(
              {
                id: job.id,
                recipientHash: recipientDigest(to.email),
                status: "preview_not_sent",
                createdAt: new Date().toISOString(),
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
          if (client) {
            const result = await client
              .from("notification_outbox")
              .update({ previewed_at: new Date().toISOString() })
              .eq("id", job.id);
            if (result.error) throw new Error("PREVIEW_STATE_FAILED");
          } else
            db()
              .prepare("UPDATE outbox SET previewed_at=? WHERE id=?")
              .run(new Date().toISOString(), job.id);
          previewed++;
          continue;
        }
        // SMTP has no exactly-once guarantee after a crash between acceptance and this acknowledgement.
        const receipt = await transport.sendMail(options);
        if (!receipt.accepted?.length)
          throw Object.assign(new Error("SMTP_NO_RECIPIENT_ACCEPTED"), {
            responseCode: 550,
          });
        acceptedBySmtp = true;
        await finish(job, "sent", null);
        sent++;
      } catch (error) {
        failed++;
        if (send) {
          const classified = acceptedBySmtp
            ? { status: "uncertain" as const, code: "SMTP_ACK_UNCERTAIN" }
            : classifySmtpError(error);
          try {
            await finish(job, classified.status, classified.code);
          } catch {
            console.error(
              JSON.stringify({
                id: job.id,
                code: "WORKER_ACK_FAILED_REVIEW_REQUIRED",
              }),
            );
          }
        } else
          console.error(JSON.stringify({ id: job.id, code: "PREVIEW_FAILED" }));
      }
    }
    console.log(
      JSON.stringify({
        mode: send ? "send" : "preview_not_sent",
        jobs: rows.length,
        previewed,
        sent,
        suppressed,
        failed,
      }),
    );
    if (failed) process.exitCode = 1;
  } catch {
    console.error(
      "Notification worker failed; no credential or recipient data is printed.",
    );
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
void main().catch(() => {
  console.error("Notification worker stopped safely; check its configuration.");
  process.exitCode = 1;
});
