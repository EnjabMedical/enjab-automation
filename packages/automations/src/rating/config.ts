import type { Language } from "../core/lang.ts";

/** Active initial-message variant. A1 = 5-star buttons; A2 = Great/Good/Bad. */
export type RatingMode = "a1" | "a2";

/** Bilingual template name pair — Meta approves each language separately. */
export interface TemplatePair {
  en: string;
  ar: string;
}

export interface RatingConfig {
  /** When true, fire() builds a message but does NOT call WhatsApp. */
  dryRun: boolean;
  /** Active outbound mode. Admin toggles A1 / A2 in the dashboard. */
  mode: RatingMode;
  /** Minutes after bill.open_date to fire. */
  delayMinutes: number;
  /** Drop the job if (now - open_date) exceeds this on fire. */
  maxAgeHours: number;
  /** Quiet hours window in Asia/Dubai local hours. Jobs in this window defer to endHour. */
  quietHoursStart: number;
  quietHoursEnd: number;
  /** Score ≤ this triggers the concern flow + a Low-Rating Triage ticket. */
  lowRatingThreshold: number;
  /** Static Google Reviews URL embedded in the `rating_thanks_high_*` URL button. */
  googleReviewUrl: string;
  /** Meta-approved template names, paired per language. */
  templateNames: {
    /** Initial 5-star template (mode A1). */
    a1: TemplatePair;
    /** Initial Great/Good/Bad template (mode A2). */
    a2: TemplatePair;
    /** Thank-you + Google Reviews URL button (sent after 5★ or "Great"). */
    thanksHigh: TemplatePair;
    /** Apology + 6 concern-area buttons (sent after ≤4★, "Good", or "Bad"). */
    concernAsk: TemplatePair;
    /** "Feedback received, please reply" — sent after a concern-area tap. */
    followUp: TemplatePair;
  };
  /** Fallback language when patient.language is unknown. */
  templateLanguageDefault: Language;
}

export const RATING_DEFAULT_CONFIG: RatingConfig = {
  dryRun: true,
  mode: "a1",
  delayMinutes: 60,
  maxAgeHours: 24,
  quietHoursStart: 0,
  quietHoursEnd: 7,
  lowRatingThreshold: 3,
  googleReviewUrl: "https://g.page/r/CTxj1xpz5jo1EBM/review",
  templateNames: {
    a1:         { en: "rating_a1_stars_en",    ar: "rating_a1_stars_ar"    },
    a2:         { en: "rating_a2_simple_en",   ar: "rating_a2_simple_ar"   },
    thanksHigh: { en: "rating_thanks_high_en", ar: "rating_thanks_high_ar" },
    concernAsk: { en: "rating_concern_en",     ar: "rating_concern_ar"     },
    followUp:   { en: "rating_followup_en",    ar: "rating_followup_ar"    },
  },
  templateLanguageDefault: "en",
};

/** Pull current config from the persisted JSON, falling back to defaults for missing keys. */
export function mergeConfig(stored: Partial<RatingConfig> | null | undefined): RatingConfig {
  const merged = { ...RATING_DEFAULT_CONFIG, ...(stored ?? {}) };
  // Deep-merge templateNames so half-set stored values don't clobber defaults.
  if (stored?.templateNames) {
    merged.templateNames = {
      ...RATING_DEFAULT_CONFIG.templateNames,
      ...stored.templateNames,
    };
  }
  return merged;
}

/** Pick the right template name for a given step + patient language. */
export function pickTemplate(
  pair: TemplatePair,
  language: Language | null | undefined,
  fallback: Language
): string {
  return pair[language ?? fallback];
}
