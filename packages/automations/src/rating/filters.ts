import type { Filter } from "../core/types.ts";
import { isInQuietHours } from "../core/time.ts";
import type { RatingFireCtx } from "./types.ts";

export const isOpVisit: Filter<RatingFireCtx> = {
  id: "visit_type_op",
  evaluate: (ctx) =>
    ctx.bill.visitType === "o"
      ? { pass: true }
      : { pass: false, reason: `visit_type=${ctx.bill.visitType}, need 'o'` },
};

export const hasPhone: Filter<RatingFireCtx> = {
  id: "has_phone",
  evaluate: (ctx) =>
    ctx.patient?.phone
      ? { pass: true }
      : { pass: false, reason: "no phone on file" },
};

export const notOptedOut: Filter<RatingFireCtx> = {
  id: "not_opted_out",
  evaluate: (ctx) =>
    ctx.optedOut
      ? { pass: false, reason: "patient opted out" }
      : { pass: true },
};

export const withinMaxAge: Filter<RatingFireCtx> = {
  id: "within_max_age",
  evaluate: (ctx) => {
    const ageMs = ctx.now.getTime() - ctx.bill.openDate.getTime();
    const maxMs = ctx.config.maxAgeHours * 60 * 60 * 1000;
    if (ageMs > maxMs) {
      const ageHrs = Math.round(ageMs / 3_600_000);
      return { pass: false, reason: `bill ${ageHrs}h old, max ${ctx.config.maxAgeHours}h` };
    }
    return { pass: true };
  },
};

export const notInQuietHours: Filter<RatingFireCtx> = {
  id: "not_quiet_hours",
  evaluate: (ctx) =>
    isInQuietHours(ctx.now, ctx.config.quietHoursStart, ctx.config.quietHoursEnd)
      ? {
          pass: false,
          reason: `quiet hours ${ctx.config.quietHoursStart}–${ctx.config.quietHoursEnd} (Asia/Dubai)`,
        }
      : { pass: true },
};

/** The full rating filter chain in evaluation order. */
export const ratingFilters: Filter<RatingFireCtx>[] = [
  isOpVisit,
  withinMaxAge,
  hasPhone,
  notOptedOut,
  notInQuietHours,
];
