import type { RatingConfig } from "./config.ts";
import type { Language } from "../core/lang.ts";

export interface RatingFireCtx {
  config: RatingConfig;
  now: Date;
  bill: {
    billNo: string;
    mrNo: string;
    visitType: "o" | "i";
    openDate: Date;
  };
  patient: {
    mrNo: string;
    fullName: string;
    phone: string | null;
    /** "en" | "ar" — picked at fire time from fresh HMS data. */
    language: Language;
    /** Doctor for THE visit being rated (refreshed at fire time, not stale). */
    doctorName: string | null;
    /** Patient's nationality (the raw HMS value, useful for debugging). */
    nationalityName: string | null;
  } | null;
  optedOut: boolean;
}
