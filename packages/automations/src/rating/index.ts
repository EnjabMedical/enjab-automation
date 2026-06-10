import { and, eq, gte } from "drizzle-orm";
import { getDb, schema, insertMessage, upsertPatient } from "@enjab/db";
import { getWaClient } from "@enjab/wa-client";
import { fetchPatient, getHmsClient } from "@enjab/hms-client";
import type {
  AutomationDef,
  ScheduleCandidate,
  FireResult,
} from "../core/types.ts";
import { deferToActiveHours } from "../core/time.ts";
import { detectLanguage } from "../core/lang.ts";
import { mergeConfig, RATING_DEFAULT_CONFIG, type RatingConfig } from "./config.ts";
import { ratingFilters } from "./filters.ts";
import { buildRatingMessage, templateRequest } from "./messages.ts";
import { formatDoctorParam } from "./doctor.ts";
import type { RatingFireCtx } from "./types.ts";

export const ratingAutomation: AutomationDef<RatingConfig, RatingFireCtx> = {
  id: "rating",
  name: "Post-Visit Rating",
  description:
    "Sends a WhatsApp message ~60 min after reception opens an OP bill, asking the patient to rate their visit. ≥4★ → Google Reviews handoff. ≤3★ → Low-Rating Triage ticket.",
  defaultConfig: RATING_DEFAULT_CONFIG,

  async findCandidates({ config, now }): Promise<ScheduleCandidate[]> {
    const lookbackMs = (config.maxAgeHours + config.delayMinutes / 60) * 60 * 60 * 1000;
    const earliestOpen = new Date(now.getTime() - lookbackMs);

    // Bills opened within the lookback window, OP only.
    const rows = await getDb()
      .select({
        billNo: schema.bills.billNo,
        openDate: schema.bills.openDate,
      })
      .from(schema.bills)
      .where(
        and(
          eq(schema.bills.visitType, "o"),
          gte(schema.bills.openDate, earliestOpen)
        )
      );

    return rows.map((r) => {
      const naive = new Date(r.openDate.getTime() + config.delayMinutes * 60 * 1000);
      const fireAt = deferToActiveHours(naive, config.quietHoursStart, config.quietHoursEnd);
      return { targetKey: r.billNo, fireAt };
    });
  },

  async loadFireContext({ config, targetKey, now }): Promise<RatingFireCtx | null> {
    const [bill] = await getDb()
      .select({
        billNo: schema.bills.billNo,
        mrNo: schema.bills.mrNo,
        visitType: schema.bills.visitType,
        openDate: schema.bills.openDate,
      })
      .from(schema.bills)
      .where(eq(schema.bills.billNo, targetKey))
      .limit(1);

    if (!bill) return null;

    // Refresh patient JSON from HMS — bill-specific doctor + current nationality.
    // Falls back to DB cache if HMS is unreachable, so jobs aren't blocked.
    let fullName: string | null = null;
    let phone: string | null = null;
    let doctorName: string | null = null;
    let nationalityName: string | null = null;
    try {
      const client = await getHmsClient();
      const fresh = await fetchPatient(client, bill.mrNo);
      fullName = fresh.fullName;
      phone = fresh.phone;
      const raw = fresh.raw as { doctor_name?: string; nationality_name?: string };
      doctorName = raw?.doctor_name ?? null;
      nationalityName = raw?.nationality_name ?? null;
      // Re-upsert so the DB stays current (and the dashboard sees the latest doctor).
      await upsertPatient({
        mrNo: fresh.mrNo,
        fullName: fresh.fullName,
        phone: fresh.phone,
        language: detectLanguage(nationalityName),
        rawJson: fresh.raw,
      });
    } catch {
      const [cached] = await getDb()
        .select({
          fullName: schema.patients.fullName,
          phone: schema.patients.phone,
          rawJson: schema.patients.rawJson,
          language: schema.patients.language,
        })
        .from(schema.patients)
        .where(eq(schema.patients.mrNo, bill.mrNo))
        .limit(1);
      if (cached) {
        fullName = cached.fullName;
        phone = cached.phone;
        const raw = (cached.rawJson ?? {}) as { doctor_name?: string; nationality_name?: string };
        doctorName = raw.doctor_name ?? null;
        nationalityName = raw.nationality_name ?? null;
      }
    }

    let optedOut = false;
    if (phone) {
      const [oo] = await getDb()
        .select({ phone: schema.optOuts.phone })
        .from(schema.optOuts)
        .where(eq(schema.optOuts.phone, phone))
        .limit(1);
      optedOut = !!oo;
    }

    return {
      config,
      now,
      bill: {
        billNo: bill.billNo,
        mrNo: bill.mrNo,
        visitType: bill.visitType,
        openDate: bill.openDate,
      },
      patient: fullName
        ? {
            mrNo: bill.mrNo,
            fullName,
            phone,
            language: detectLanguage(nationalityName),
            doctorName,
            nationalityName,
          }
        : null,
      optedOut,
    };
  },

  filters: ratingFilters,

  async fire(ctx): Promise<FireResult> {
    const message = buildRatingMessage(ctx);

    if (ctx.config.dryRun) {
      return { status: "dry_run", message };
    }

    const phone = ctx.patient?.phone;
    if (!phone) {
      return { status: "failed", reason: "no phone at fire time", message };
    }

    const language = ctx.patient?.language ?? ctx.config.templateLanguageDefault;
    const greetingName = message.params.name as string;
    const doctorPhrase = formatDoctorParam(ctx.patient?.doctorName ?? null, language);
    const tplReq = templateRequest(ctx.config, greetingName, doctorPhrase, language);

    try {
      const wa = getWaClient();
      const result = await wa.sendTemplate({
        to: phone,
        templateName: tplReq.templateName,
        language: tplReq.language,
        bodyParams: tplReq.bodyParams,
      });

      await insertMessage({
        automationId: "rating",
        targetKey: ctx.bill.billNo,
        mrNo: ctx.bill.mrNo,
        direction: "out",
        channel: "whatsapp",
        waMsgId: result.waMsgId,
        templateName: tplReq.templateName,
        status: "sent",
        body: { ...message, mode: ctx.config.mode },
        raw: result.raw,
      });

      return { status: "sent", message };
    } catch (e) {
      const err = String((e as Error).message ?? e);
      return { status: "failed", reason: err, message };
    }
  },
};

export { mergeConfig, RATING_DEFAULT_CONFIG };
export type { RatingConfig } from "./config.ts";
export type { RatingFireCtx } from "./types.ts";
export {
  handleRatingButtonReply,
  parseStarPayload,
  parseSimplePayload,
  parseConcernPayload,
} from "./inbound.ts";
export type { HandleButtonReplyResult } from "./inbound.ts";
