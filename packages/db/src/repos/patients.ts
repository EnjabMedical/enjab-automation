import { sql, inArray } from "drizzle-orm";
import { getDb } from "../client.ts";
import { patients } from "../schema.ts";

export interface UpsertPatientInput {
  mrNo: string;
  fullName: string;
  phone: string | null;
  language?: string | null;        // "en" | "ar" — detected from raw_json.nationality_name
  rawJson?: unknown;
}

/** Idempotent upsert; bumps last_synced_at to NOW(). */
export async function upsertPatient(row: UpsertPatientInput) {
  await getDb()
    .insert(patients)
    .values({
      mrNo: row.mrNo,
      fullName: row.fullName,
      phone: row.phone,
      language: row.language ?? null,
      rawJson: row.rawJson ?? null,
    })
    .onConflictDoUpdate({
      target: patients.mrNo,
      set: {
        fullName: sql`EXCLUDED.full_name`,
        phone: sql`EXCLUDED.phone`,
        language: sql`EXCLUDED.language`,
        rawJson: sql`EXCLUDED.raw_json`,
        lastSyncedAt: sql`NOW()`,
      },
    });
}

/** Returns the set of mr_nos that already have a row in `patients`. */
export async function patientMrNoSet(mrNos: string[]): Promise<Set<string>> {
  if (mrNos.length === 0) return new Set();
  const rows = await getDb()
    .select({ mrNo: patients.mrNo })
    .from(patients)
    .where(inArray(patients.mrNo, mrNos));
  return new Set(rows.map((r) => r.mrNo));
}
