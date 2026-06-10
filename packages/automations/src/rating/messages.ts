import type { BuiltMessage } from "../core/types.ts";
import type { Language } from "../core/lang.ts";
import { pickTemplate, type RatingConfig, type RatingMode } from "./config.ts";
import type { RatingFireCtx } from "./types.ts";
import { formatDoctorParam } from "./doctor.ts";

/**
 * Build the initial-template payload + dashboard preview.
 *
 * Initial templates (`rating_a1_stars_*`, `rating_a2_simple_*`) take two body
 * params: {{1}} = patient first name, {{2}} = doctor noun phrase. Language is
 * picked from the patient row (falls back to config.templateLanguageDefault).
 */
export function buildRatingMessage(ctx: RatingFireCtx): BuiltMessage {
  const { config, patient } = ctx;
  if (!patient?.phone) throw new Error("buildRatingMessage: no phone");

  const language: Language = patient.language ?? config.templateLanguageDefault;
  const greetingName = patient.fullName.split(/\s+/)[0] || "there";
  const doctorPhrase = formatDoctorParam(patient.doctorName, language);
  const templateName = templateNameForMode(config.mode, language, config);

  const params: Record<string, unknown> = {
    name: greetingName,
    doctor: doctorPhrase,
    bill_no: ctx.bill.billNo,
    language,
  };

  const preview = previewFor(config.mode, language, greetingName, doctorPhrase);

  return { templateName, to: patient.phone, params, preview };
}

/** Map config's active mode + language to the approved template name. */
function templateNameForMode(mode: RatingMode, language: Language, config: RatingConfig): string {
  switch (mode) {
    case "a1": return pickTemplate(config.templateNames.a1, language, config.templateLanguageDefault);
    case "a2": return pickTemplate(config.templateNames.a2, language, config.templateLanguageDefault);
  }
}

function previewFor(mode: RatingMode, language: Language, name: string, doctor: string): string {
  if (language === "ar") {
    const body = mode === "a1"
      ? `مرحباً ${name}، شكراً على زيارتك مع ${doctor} في مركز إنجاب الطبي. كيف تقيّم/ي زيارتك؟`
      : `مرحباً ${name}، شكراً على زيارتك مع ${doctor} في مركز إنجاب الطبي. كيف كانت تجربتك؟`;
    const buttons = mode === "a1" ? "[★★★★★] [★★★★] [★★★] [★★] [★]" : "[ممتازة] [جيدة] [سيئة]";
    return `${body}\n${buttons}`;
  }
  const body = mode === "a1"
    ? `Hi ${name}, thank you for your visit with ${doctor} at Enjab Medical Center. How would you rate your visit?`
    : `Hi ${name}, thank you for your visit with ${doctor} at Enjab Medical Center. How was your experience?`;
  const buttons = mode === "a1" ? "[★★★★★] [★★★★] [★★★] [★★] [★]" : "[Great] [Good] [Bad]";
  return `${body}\n${buttons}`;
}

/** Send-shaped struct for the WaClient — initial template only. */
export function templateRequest(
  config: RatingConfig,
  greetingName: string,
  doctorPhrase: string,
  language: Language
): {
  templateName: string;
  language: string;
  bodyParams: string[];
} {
  const templateName = templateNameForMode(config.mode, language, config);
  return {
    templateName,
    language: templateLanguageCode(templateName, language),
    bodyParams: [greetingName, doctorPhrase],
  };
}

/**
 * TEMP (2026-05-24): `rating_followup_ar` was approved by Meta with its
 * language attribute set to "en" (created with the wrong language). Until it's
 * recreated as Arabic (the proper fix — "Option A"), send it with the "en"
 * code so Meta's name+code lookup resolves. The body is Arabic regardless —
 * the language code is only a lookup key, it doesn't affect what's rendered.
 * DELETE this override once the template is recreated with language = ar.
 */
const TEMPLATE_LANGUAGE_CODE_OVERRIDES: Record<string, string> = {
  rating_followup_ar: "en",
};

/**
 * The language code to send for a given template. Normally the patient's
 * language, but overridden where a Meta template was registered under a
 * different code than its name implies.
 */
export function templateLanguageCode(templateName: string, patientLanguage: Language): string {
  return TEMPLATE_LANGUAGE_CODE_OVERRIDES[templateName] ?? patientLanguage;
}
