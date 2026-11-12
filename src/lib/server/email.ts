// ClientHub email delivery layer — integration-ready, honest about its state.
//
// Branded HTML emails are rendered here and recorded in the EmailLog outbox.
// DELIVERY IS NOT YET WIRED TO A PROVIDER — nothing pretends to send. To go
// live, implement `deliver()` below with your provider of choice:
//
//   1. SMTP (e.g. via nodemailer):   npm i nodemailer
//      → createTransport({ host, port, auth }) using env vars
//        EMAIL_SMTP_HOST / EMAIL_SMTP_PORT / EMAIL_SMTP_USER / EMAIL_SMTP_PASS
//   2. HTTP API (e.g. Resend, Postmark): store the API key in EMAIL_API_KEY
//      and POST the rendered HTML.
//
// Until one of those is configured, `queueEmail()` writes the fully-rendered
// message to the EmailLog table with status QUEUED — visible to administrators
// under Settings → Email delivery — and delivery can be backfilled later.

import { db } from "@/lib/db";
import { formatDate } from "@/lib/date";

// ─── Branded HTML template ────────────────────────────────────────────────────

const BRAND = {
  name: "Jeffery Group Ltd.",
  product: "ClientHub",
  signature: "Jeffery Group Ltd. — Packaging Manufacturing & Supply",
};

export type EmailInput = {
  to: string; // customer (or admin) email
  toName?: string;
  subject: string;
  heading: string;
  intro: string; // lead paragraph (plain text)
  body: string; // main message (plain text, blank-line separated paragraphs)
  kind: string; // ORDER | QUOTATION | DOCUMENT | MESSAGE | SYSTEM | UPDATE | CHANGE
  relatedId?: string | null;
  cta?: { label: string; url: string } | null;
};

/** Professional, minimal, ClientHub-branded email HTML. */
export function renderEmailHtml(input: EmailInput): string {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p)}</p>`)
    .join("");
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#1c1c21;border-radius:8px;"><a href="${escapeHtml(
        input.cta.url,
      )}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(
        input.cta.label,
      )}</a></td></tr></table>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c21;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e8ea;border-radius:12px;overflow:hidden;text-align:left;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #ececef;">
<p style="margin:0;font-size:15px;font-weight:700;letter-spacing:-0.01em;">${BRAND.product}</p>
<p style="margin:2px 0 0;font-size:11px;color:#6b6b70;text-transform:uppercase;letter-spacing:0.12em;">${BRAND.name}</p>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:19px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(input.heading)}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b6b70;">${escapeHtml(input.intro)}</p>
<div style="font-size:14px;line-height:1.65;">${paragraphs}</div>
${cta}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #ececef;background:#fafafa;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a8e;">Thank you for your business.<br/>${BRAND.signature}</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#a0a0a4;text-align:center;">You receive essential order notifications as part of your ClientHub account.</p>
</td></tr></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Outbox ───────────────────────────────────────────────────────────────────

/**
 * Queue a fully-rendered branded email. If a delivery provider is configured
 * (see file header) this is where it would be sent; until then the message is
 * preserved in the EmailLog outbox with status QUEUED.
 */
export async function queueEmail(input: EmailInput): Promise<void> {
  const html = renderEmailHtml(input);
  try {
    await db.emailLog.create({
      data: {
        toEmail: input.to,
        toName: input.toName ?? "",
        subject: input.subject,
        bodyHtml: html,
        kind: input.kind,
        status: "QUEUED",
        relatedId: input.relatedId ?? null,
      },
    });
  } catch (err) {
    // Outbox failures must never break the primary workflow.
    console.error("[email] failed to queue message:", err);
  }
}

/** Notify every active user of an organization (essential communications). */
export async function queueEmailForOrg(
  orgId: string,
  build: (recipient: { email: string; name: string }) => EmailInput,
): Promise<void> {
  const users = await db.user.findMany({
    where: { orgId, status: "ACTIVE" },
    select: { email: true, name: true },
  });
  for (const u of users) {
    await queueEmail(build(u));
  }
}

// ─── Common messages ─────────────────────────────────────────────────────────

export function orderUpdateEmail(
  orgName: string,
  orderNumber: string,
  updateTitle: string,
  message: string,
  estimatedDelivery: Date | null,
): { subject: string; heading: string; intro: string; body: string } {
  const eta = estimatedDelivery ? `Estimated delivery: ${formatDate(estimatedDelivery.toISOString())}.` : "";
  return {
    subject: `[${orderNumber}] ${updateTitle}`,
    heading: updateTitle,
    intro: `An update was published for order ${orderNumber}.`,
    body: `${message}\n\n${eta}\nYou can review the full update history for this order in ClientHub.`,
  };
}

export function changeRequestDecisionEmail(
  orderNumber: string,
  approved: boolean,
  note: string | null,
): { subject: string; heading: string; intro: string; body: string } {
  return {
    subject: `[${orderNumber}] Change request ${approved ? "approved" : "declined"}`,
    heading: approved ? "Your change request was approved" : "Your change request was declined",
    intro: `A decision was recorded for your change request on order ${orderNumber}.`,
    body: `${approved ? "Jeffery Group approved your requested change and the order has been updated." : "Jeffery Group was unable to approve the requested change at this time."}${
      note ? `\n\nNote from the team: ${note}` : ""
    }\n\nThe complete revision history is preserved on the order page in ClientHub.`,
  };
}
