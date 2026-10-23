import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
export interface NotificationMail {
  id: string;
  recipient: string;
  type: string;
  title: string;
  body: string;
  url: string;
}
export const recipientDigest = (email: string) =>
  createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
export function verifiedSiteOrigin() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("SITE_ORIGIN_REQUIRED");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("INVALID_SITE_ORIGIN");
  return url.origin;
}
export function usableRecipient(email: string) {
  return (
    /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email) &&
    !/\.(invalid|test|localhost|local|example)$/i.test(email) &&
    !/@(?:example\.(?:com|net|org)|localhost)$/i.test(email)
  );
}
export function mailOptions(value: NotificationMail, origin: string) {
  const from = process.env.GP_SMTP_FROM || "preview@demo.invalid";
  if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(from))
    throw new Error("INVALID_SENDER");
  const path =
    /^\/compte(?:\/|$)/.test(value.url) && !value.url.includes("\\")
      ? value.url
      : "/compte";
  const link = new URL(path, origin).toString();
  const subject = value.title.replace(/[\r\n]/g, " ").slice(0, 120);
  return {
    from: { name: "GP Parking", address: from },
    to: { address: value.recipient, name: "" },
    subject,
    messageId: `<gp-notification-${value.id}@${new URL(origin).hostname}>`,
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-GP-Notification-ID": value.id,
    },
    text: `${subject}\n\n${value.body}\n\nOuvrir mon espace GP : ${link}\n\nCe message concerne votre activité sur GP. Vos échanges et les détails privés sont accessibles uniquement depuis votre compte.\nPréférences de notification : ${origin}/compte/notifications`,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
export function smtpTransport() {
  const host = process.env.GP_SMTP_HOST,
    port = Number(process.env.GP_SMTP_PORT || 587),
    user = process.env.GP_SMTP_USER,
    pass = process.env.GP_SMTP_PASSWORD;
  if (
    !host ||
    !user ||
    !pass ||
    !process.env.GP_SMTP_FROM ||
    /[\r\n/:]/.test(host) ||
    ![465, 587].includes(port)
  )
    throw new Error("SMTP_CONFIGURATION_REQUIRED");
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
export function classifySmtpError(error: unknown): {
  status: "pending" | "failed" | "uncertain";
  code: string;
} {
  const e = error as { code?: string; command?: string; responseCode?: number };
  if (e.command === "DATA" && !e.responseCode)
    return { status: "uncertain", code: "SMTP_DELIVERY_UNCERTAIN" };
  if (e.responseCode && e.responseCode >= 500)
    return { status: "failed", code: "SMTP_PERMANENT_REJECTION" };
  if (e.responseCode && e.responseCode >= 400)
    return { status: "pending", code: "SMTP_TRANSIENT_REJECTION" };
  if (
    ["CONN", "EHLO", "HELO", "AUTH", "MAIL FROM", "RCPT TO"].includes(
      e.command || "",
    )
  )
    return { status: "pending", code: "SMTP_CONNECTION_FAILURE" };
  return { status: "uncertain", code: "SMTP_DELIVERY_UNCERTAIN" };
}
