/**
 * Format the {{2}} body parameter of the rating templates from HMS `doctor_name`.
 *
 * HMS stores doctor names with a `Dr.` prefix for real doctors, and two
 * special placeholder values for non-doctor visits:
 *   - `Dr. IN HOUSE`  → laser / beauty therapy done by in-house staff
 *   - `Outside Dr`    → patient brought their own referring doctor
 *
 * The {{2}} slot in the rating templates is the FULL noun phrase
 * ("Doctor Osama Abdelsalam" or "our team"), so a single Meta template
 * works for both doctor and non-doctor visits.
 *
 * Real-data sample (probed 2026-05-14):
 *   Dr. Ashraf Moawad             — 42
 *   Dr. Shereen Mohamed           — 10
 *   Outside Dr                    —  3
 *   Dr. IN HOUSE                  —  2
 *   ...
 */

import type { Language } from "../core/lang.ts";

/** Case-insensitive substrings that mean "no actual named doctor". */
const NON_DOCTOR_MARKERS: ReadonlyArray<string> = [
  "in house",
  "outside dr",
];

/**
 * Returns the body-param value for the doctor slot in a rating template.
 *
 *   formatDoctorParam("Dr. Osama   Abdelsalam", "en") → "Doctor Osama Abdelsalam"
 *   formatDoctorParam("Dr. Osama Abdelsalam",   "ar") → "د. Osama Abdelsalam"
 *   formatDoctorParam("Dr. IN HOUSE",            "en") → "our team"
 *   formatDoctorParam("Outside Dr",              "ar") → "فريقنا"
 *   formatDoctorParam(null,                       "en") → "our team"
 *
 * Arabic title is "د." (short for الدكتور) because HMS stores doctor names
 * in English only — mixing Arabic title + English name is the natural
 * bilingual convention in UAE clinics.
 */
export function formatDoctorParam(
  doctorName: string | null | undefined,
  language: Language
): string {
  if (!doctorName) return teamFallback(language);

  const normalized = doctorName.replace(/\s+/g, " ").trim();
  const stripped = normalized.replace(/^dr\.?\s*/i, "").trim();
  const lower = normalized.toLowerCase();

  for (const marker of NON_DOCTOR_MARKERS) {
    if (lower.includes(marker)) return teamFallback(language);
  }

  // Empty after stripping → also a placeholder; fall back to team.
  if (!stripped) return teamFallback(language);

  return language === "ar" ? `د. ${stripped}` : `Doctor ${stripped}`;
}

function teamFallback(language: Language): string {
  return language === "ar" ? "فريقنا" : "our team";
}
