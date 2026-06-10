import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  type InboundMessage,
  type StatusUpdate,
} from "@enjab/wa-client";
import {
  getDb,
  schema,
  insertMessage,
  updateMessageStatusByWaMsgId,
  recordEvent,
  getAutomationRow,
  findRecentOutboundForPatient,
  findOpenTicketByBill,
  findOpenTicketForPatient,
} from "@enjab/db";
import {
  handleRatingButtonReply,
  mergeRatingConfig,
  type RatingConfig,
} from "@enjab/automations";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/webhook — Meta webhook verification handshake.
 * Meta sends ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * We echo the challenge if the verify token matches.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

/**
 * POST /api/wa/webhook — Meta delivery callbacks + inbound messages.
 * - Verify X-Hub-Signature-256 with WA_APP_SECRET.
 * - Parse the event.
 * - Dispatch button replies → rating automation; statuses → message rows;
 *   free-form text replies → persisted + linked to an open rating ticket if one
 *   exists for that patient (drives the Low-Rating Triage detail page).
 * - Always 200 (else Meta retries the same event repeatedly).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const secret = process.env.WA_APP_SECRET;

  if (secret) {
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      // Sign verification failed — log + 200 (don't tell attackers we know).
      await recordEvent({
        actor: "wa-webhook",
        action: "wa.webhook_bad_signature",
        meta: { signature: signature ?? null },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = parseWebhookEvent(payload);

  // Statuses first (they're cheap and don't need automation context).
  for (const s of event.statuses) {
    await handleStatus(s).catch(async (e) => {
      await recordEvent({
        actor: "wa-webhook",
        action: "wa.status_handler_failed",
        meta: { err: String((e as Error).message ?? e), waMsgId: s.waMsgId },
      });
    });
  }

  for (const m of event.inboundMessages) {
    await handleInbound(m).catch(async (e) => {
      await recordEvent({
        actor: "wa-webhook",
        action: "wa.inbound_handler_failed",
        meta: { err: String((e as Error).message ?? e), waMsgId: m.waMsgId },
      });
    });
  }

  return NextResponse.json({ ok: true });
}

async function handleStatus(s: StatusUpdate): Promise<void> {
  if (!s.waMsgId) return;
  const errSummary =
    s.status === "failed"
      ? `${s.errorCode ?? "?"}: ${s.errorTitle ?? s.errorMessage ?? "unknown"}`
      : null;
  await updateMessageStatusByWaMsgId(s.waMsgId, s.status, errSummary);
}

async function handleInbound(m: InboundMessage): Promise<void> {
  // 1. QUICK_REPLY tap from a template — primary input for the rating automation.
  if (m.type === "button" && m.buttonPayload) {
    const row = await getAutomationRow("rating");
    const config = mergeRatingConfig((row?.config ?? {}) as Partial<RatingConfig>);
    const result = await handleRatingButtonReply({
      fromPhone: m.from,
      buttonPayload: m.buttonPayload,
      buttonText: m.buttonText,
      inboundWaMsgId: m.waMsgId,
      config,
    });
    await recordEvent({
      actor: "rating",
      action: result.matched ? `rating.handled.${result.step}` : "rating.unmatched",
      target: result.billNo,
      meta: { ...result },
    });
    return;
  }

  // 2. Free-form text or interactive reply — persist always, link to an open
  //    rating ticket if the patient is in our system. The ticket detail page
  //    reads inbound messages keyed on mrNo + createdAt > ticket.createdAt.
  const phoneE164 = m.from.startsWith("+") ? m.from : `+${m.from}`;
  const [patient] = await getDb()
    .select({ mrNo: schema.patients.mrNo })
    .from(schema.patients)
    .where(eq(schema.patients.phone, phoneE164))
    .limit(1);

  if (!patient) {
    // Unknown number — record with body text for debugging (no PHI risk; this
    // is a number not in our patients table). Without the text we can't tell
    // wrong-number from staff-testing-from-personal-phone.
    await recordEvent({
      actor: "wa-webhook",
      action: "wa.inbound_unknown_sender",
      meta: {
        type: m.type,
        from: m.from,
        waMsgId: m.waMsgId,
        text: m.text ?? m.interactiveTitle ?? null,
      },
    });
    return;
  }

  // Anchor the reply to the ticket via the most-recent outbound to this
  // patient — that's the template they're replying to. Avoids attributing
  // replies to the wrong open ticket when a patient has multiple concurrent
  // ones (rare but possible: two low-rated visits in the same week).
  const lastOutbound = await findRecentOutboundForPatient({
    automationId: "rating",
    mrNo: patient.mrNo,
    lookbackHours: 48,
  });
  let ticket = lastOutbound?.targetKey
    ? await findOpenTicketByBill(lastOutbound.targetKey)
    : null;
  if (!ticket) {
    // No recent outbound (or its bill's ticket is closed) — fall back to the
    // newest open ticket for the patient. Mostly relevant for back-and-forth
    // conversations spanning > 48h.
    ticket = await findOpenTicketForPatient(patient.mrNo);
  }

  await insertMessage({
    automationId: ticket ? "rating" : null,
    targetKey: ticket?.billNo ?? null,
    mrNo: patient.mrNo,
    direction: "in",
    channel: "whatsapp",
    waMsgId: m.waMsgId,
    status: "delivered",
    body: bodyFor(m),
  });

  if (ticket) {
    await recordEvent({
      actor: "rating",
      action: "rating.reply_received",
      target: ticket.billNo,
      meta: {
        ticketId: ticket.ticketId,
        ratingId: ticket.ratingId,
        ticketStatus: ticket.status,
        type: m.type,
        text: m.text ?? m.interactiveTitle ?? null,
        waMsgId: m.waMsgId,
      },
    });
  } else {
    await recordEvent({
      actor: "wa-webhook",
      action: "wa.inbound_no_open_ticket",
      meta: { mrNo: patient.mrNo, type: m.type, waMsgId: m.waMsgId },
    });
  }
}

function bodyFor(m: InboundMessage): Record<string, unknown> {
  switch (m.type) {
    case "text":
      return { kind: "text", text: m.text ?? "" };
    case "interactive":
      return {
        kind: "interactive",
        interactiveId: m.interactiveId,
        interactiveTitle: m.interactiveTitle,
      };
    case "image":
    case "audio":
    case "video":
    case "document":
      return { kind: m.type, raw: m.raw };
    default:
      return { kind: m.type, raw: m.raw };
  }
}
