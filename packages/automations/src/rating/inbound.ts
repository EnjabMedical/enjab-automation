import { eq } from "drizzle-orm";
import {
  getDb,
  schema,
  findRecentOutboundForPatient,
  tryInsertRating,
  setRatingConcernArea,
  insertRatingTicket,
  insertMessage,
  recordEvent,
  type ConcernArea,
} from "@enjab/db";
import { getWaClient } from "@enjab/wa-client";
import type { Language } from "../core/lang.ts";
import { pickTemplate, type RatingConfig } from "./config.ts";
import { templateLanguageCode } from "./messages.ts";

export interface HandleButtonReplyResult {
  matched: boolean;
  step: "initial" | "concern_area" | "unknown";
  score: number | null;
  concernArea: ConcernArea | null;
  billNo: string | null;
  ratingId: string | null;
  followUp: "thanks_high" | "concern_ask" | "follow_up" | null;
  followUpStatus: "sent" | "skipped" | "failed" | null;
  reason?: string;
}

/** Map "★★★★★" / "★★★★" / etc. to a 1–5 integer. */
export function parseStarPayload(payload: string | undefined): number | null {
  if (!payload) return null;
  const stars = (payload.match(/★/g) ?? []).length;
  return stars >= 1 && stars <= 5 ? stars : null;
}

/** Map A2 "Great" / "Good" / "Bad" (and Arabic equivalents) to a synthetic score. */
export function parseSimplePayload(payload: string | undefined): number | null {
  if (!payload) return null;
  const p = payload.trim().toLowerCase();
  if (p === "great" || p === "ممتازة") return 5;
  if (p === "good"  || p === "جيدة")   return 4;
  if (p === "bad"   || p === "سيئة")   return 1;
  return null;
}

/** Map a concern-area button payload (either language) to its canonical slug. */
export function parseConcernPayload(payload: string | undefined): ConcernArea | null {
  if (!payload) return null;
  const p = payload.trim().toLowerCase();
  // English
  if (p === "reception & booking")     return "reception";
  if (p === "doctor's consultation")   return "doctor";
  if (p === "nursing & lab")           return "nursing";
  if (p === "billing & insurance")     return "billing";
  if (p === "laser & beauty therapy")  return "laser";
  if (p === "other")                   return "other";
  // Arabic
  if (p === "الاستقبال والحجز")      return "reception";
  if (p === "الاستشارة الطبية")     return "doctor";
  if (p === "التمريض والمختبر")    return "nursing";
  if (p === "الفواتير والتأمين")    return "billing";
  if (p === "الليزر والتجميل")     return "laser";
  if (p === "أخرى")                 return "other";
  return null;
}

const NEG: HandleButtonReplyResult = {
  matched: false, step: "unknown",
  score: null, concernArea: null,
  billNo: null, ratingId: null,
  followUp: null, followUpStatus: null,
};

/**
 * Process an inbound QUICK_REPLY button tap for the rating automation.
 *
 * Two-step flow detection (driven by the *previous* outbound template name):
 *   - last outbound was `rating_a1_stars_*` / `rating_a2_simple_*`
 *       → this is the INITIAL reply. Record score, branch:
 *           top tier  → send `rating_thanks_high_*` (URL: Google Reviews)
 *           lower tier → send `rating_concern_*`    (6 area buttons)
 *   - last outbound was `rating_concern_*`
 *       → this is the CONCERN-AREA reply. Set concern_area on the rating,
 *           send `rating_followup_*`, and open / refresh the triage ticket.
 *   - anything else → log and skip.
 */
export async function handleRatingButtonReply(args: {
  fromPhone: string;
  buttonPayload: string;
  buttonText?: string;
  inboundWaMsgId: string;
  config: RatingConfig;
}): Promise<HandleButtonReplyResult> {
  const phoneE164 = args.fromPhone.startsWith("+") ? args.fromPhone : `+${args.fromPhone}`;
  const payload = args.buttonPayload || args.buttonText || "";

  // Resolve patient.
  const [patient] = await getDb()
    .select({
      mrNo: schema.patients.mrNo,
      fullName: schema.patients.fullName,
      language: schema.patients.language,
    })
    .from(schema.patients)
    .where(eq(schema.patients.phone, phoneE164))
    .limit(1);

  if (!patient) {
    return { ...NEG, reason: `unknown phone ${phoneE164}` };
  }

  // Find the previous outbound to know which step this reply belongs to.
  const last = await findRecentOutboundForPatient({
    automationId: "rating",
    mrNo: patient.mrNo,
    lookbackHours: 48,
  });
  if (!last?.targetKey || !last.templateName) {
    return { ...NEG, reason: "no recent rating outbound to match" };
  }
  const billNo = last.targetKey;
  const lastTpl = last.templateName;
  const language: Language =
    ((patient.language as Language | null) ?? args.config.templateLanguageDefault);

  // Always persist the inbound itself for audit, regardless of branch.
  await insertMessage({
    automationId: "rating",
    targetKey: billNo,
    mrNo: patient.mrNo,
    direction: "in",
    channel: "whatsapp",
    waMsgId: args.inboundWaMsgId,
    body: { kind: "button_reply", payload, lastTpl },
  });

  if (lastTpl.startsWith("rating_a1_stars_") || lastTpl.startsWith("rating_a2_simple_")) {
    return handleInitialReply({
      patient, billNo, language, payload, lastTpl,
      phoneE164, config: args.config,
    });
  }

  if (lastTpl.startsWith("rating_concern_")) {
    return handleConcernReply({
      patient, billNo, language, payload,
      phoneE164, config: args.config,
    });
  }

  await recordEvent({
    actor: "rating",
    action: "rating.inbound_unrouted",
    target: billNo,
    meta: { lastTpl, payload },
  });
  return { ...NEG, billNo, reason: `unrecognized last template: ${lastTpl}` };
}

// ─── Step 1: initial-template reply ───────────────────────────────────────

async function handleInitialReply(args: {
  patient: { mrNo: string; fullName: string };
  billNo: string;
  language: Language;
  payload: string;
  lastTpl: string;
  phoneE164: string;
  config: RatingConfig;
}): Promise<HandleButtonReplyResult> {
  const { patient, billNo, language, payload, lastTpl, phoneE164, config } = args;

  const mode: "a1" | "a2" = lastTpl.startsWith("rating_a1_stars_") ? "a1" : "a2";
  const score = mode === "a1" ? parseStarPayload(payload) : parseSimplePayload(payload);

  if (score == null) {
    await recordEvent({
      actor: "rating",
      action: "rating.initial_unparsed",
      target: billNo,
      meta: { lastTpl, payload, mode },
    });
    return { ...NEG, step: "initial", billNo, reason: `unparsable payload "${payload}"` };
  }

  // Idempotent rating insert.
  const inserted = await tryInsertRating({ billNo, score, mode });
  if (!inserted) {
    return { ...NEG, step: "initial", matched: true, score, billNo, reason: "duplicate rating" };
  }
  const ratingId = inserted.id;

  await recordEvent({
    actor: "rating",
    action: "rating.received",
    target: billNo,
    meta: { score, mode, mrNo: patient.mrNo },
  });

  const isLow = score <= config.lowRatingThreshold;
  const followUp: "thanks_high" | "concern_ask" = isLow ? "concern_ask" : "thanks_high";
  const templateName = pickTemplate(
    isLow ? config.templateNames.concernAsk : config.templateNames.thanksHigh,
    language,
    config.templateLanguageDefault,
  );

  // Open the triage ticket up-front for low ratings (before they even pick a concern area).
  if (isLow) {
    await insertRatingTicket({ ratingId });
    await recordEvent({
      actor: "rating",
      action: "rating.ticket_opened",
      target: billNo,
      meta: { ratingId, score },
    });
  }

  const followUpStatus = await sendFollowUp({
    phoneE164, templateName, language,
    config, billNo, mrNo: patient.mrNo,
    kind: followUp, meta: { score, mode },
  });

  return {
    matched: true,
    step: "initial",
    score,
    concernArea: null,
    billNo,
    ratingId,
    followUp,
    followUpStatus,
  };
}

// ─── Step 2: concern-area reply ───────────────────────────────────────────

async function handleConcernReply(args: {
  patient: { mrNo: string; fullName: string };
  billNo: string;
  language: Language;
  payload: string;
  phoneE164: string;
  config: RatingConfig;
}): Promise<HandleButtonReplyResult> {
  const { patient, billNo, language, payload, phoneE164, config } = args;

  const area = parseConcernPayload(payload);
  if (!area) {
    await recordEvent({
      actor: "rating",
      action: "rating.concern_unparsed",
      target: billNo,
      meta: { payload },
    });
    return { ...NEG, step: "concern_area", billNo, reason: `unparsable concern "${payload}"` };
  }

  const updated = await setRatingConcernArea({ billNo, concernArea: area });
  if (!updated) {
    return { ...NEG, step: "concern_area", matched: true, billNo, concernArea: area,
      reason: "no rating row to attach concern area to" };
  }

  await recordEvent({
    actor: "rating",
    action: "rating.concern_picked",
    target: billNo,
    meta: { concernArea: area, mrNo: patient.mrNo },
  });

  const templateName = pickTemplate(
    config.templateNames.followUp, language, config.templateLanguageDefault
  );
  const followUpStatus = await sendFollowUp({
    phoneE164, templateName, language,
    config, billNo, mrNo: patient.mrNo,
    kind: "follow_up", meta: { concernArea: area },
  });

  return {
    matched: true,
    step: "concern_area",
    score: updated.score,
    concernArea: area,
    billNo,
    ratingId: updated.id,
    followUp: "follow_up",
    followUpStatus,
  };
}

// ─── Shared outbound send ─────────────────────────────────────────────────

async function sendFollowUp(args: {
  phoneE164: string;
  templateName: string;
  language: Language;
  config: RatingConfig;
  billNo: string;
  mrNo: string;
  kind: "thanks_high" | "concern_ask" | "follow_up";
  meta: Record<string, unknown>;
}): Promise<"sent" | "skipped" | "failed"> {
  if (args.config.dryRun) return "skipped";

  try {
    const wa = getWaClient();
    // All follow-up templates (5–10) take ZERO body params per the v2 spec.
    const result = await wa.sendTemplate({
      to: args.phoneE164,
      templateName: args.templateName,
      language: templateLanguageCode(args.templateName, args.language),
      bodyParams: [],
    });
    await insertMessage({
      automationId: "rating",
      targetKey: args.billNo,
      mrNo: args.mrNo,
      direction: "out",
      channel: "whatsapp",
      waMsgId: result.waMsgId,
      templateName: args.templateName,
      status: "sent",
      body: { kind: args.kind, ...args.meta },
    });
    return "sent";
  } catch (e) {
    const err = String((e as Error).message ?? e);
    await recordEvent({
      actor: "rating",
      action: "rating.followup_failed",
      target: args.billNo,
      meta: { kind: args.kind, error: err },
    });
    return "failed";
  }
}
