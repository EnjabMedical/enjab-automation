/**
 * Per-patient language detection from HMS `nationality_name`.
 *
 * Default ruleset: Arab League member states map to Arabic; everyone else
 * (including unknown / null) defaults to English. Names must match what
 * Insta HMS stores in the `nationality_name` field — these strings were
 * verified against the live data (e.g. "Syrian Arab Republic", not "Syria").
 */

export type Language = "en" | "ar";

/**
 * Default Arabic-speaking nationalities. Three buckets:
 *   1. Arab League (22 member states) — formal UN names as HMS uses them.
 *   2. Common variant spellings — to absorb HMS quirks (e.g. "UAE", "Saudi",
 *      "Syria") in case patient records were keyed differently in the past.
 *   3. Other Arabic-majority territories not in Arab League (Western Sahara).
 *
 * Approved 2026-05-08 (Arab League). Expanded 2026-05-15 (variants + W. Sahara).
 */
export const DEFAULT_ARABIC_NATIONALITIES: ReadonlyArray<string> = [
  // ── Arab League — 22 member states ──
  "Algeria",
  "Bahrain",
  "Comoros",
  "Djibouti",
  "Egypt",
  "Iraq",
  "Jordan",
  "Kuwait",
  "Lebanon",
  "Libya",
  "Mauritania",
  "Morocco",
  "Oman",
  "Palestine",
  "Qatar",
  "Saudi Arabia",
  "Somalia",
  "Sudan",
  "Syrian Arab Republic",
  "Tunisia",
  "United Arab Emirates",
  "Yemen",

  // ── Common variant spellings (HMS quirks) ──
  "UAE",
  "U.A.E.",
  "Emirates",
  "KSA",
  "Saudi",
  "Saudi Arabia (KSA)",
  "Syria",
  "Palestinian Territories",
  "Palestinian Territory",
  "Palestinian Authority",
  "State of Palestine",

  // ── Arabic-majority, non-Arab-League ──
  "Western Sahara",
  "Sahrawi Arab Democratic Republic",
];

const DEFAULT_SET = new Set(DEFAULT_ARABIC_NATIONALITIES.map((n) => n.toLowerCase()));

/**
 * Returns the target language for outbound messages to this patient.
 * - `nationalityName` matches an Arabic country (case-insensitive) → "ar"
 * - Anything else (including null/empty/unknown) → "en"
 *
 * Pass `arabicList` to override the default ruleset (e.g. read from
 * automation config so admin can edit without code changes).
 */
export function detectLanguage(
  nationalityName: string | null | undefined,
  arabicList?: ReadonlyArray<string>
): Language {
  if (!nationalityName) return "en";
  const set = arabicList
    ? new Set(arabicList.map((n) => n.toLowerCase()))
    : DEFAULT_SET;
  return set.has(nationalityName.trim().toLowerCase()) ? "ar" : "en";
}
