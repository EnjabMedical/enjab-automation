import { fetchOpenBills, fetchPatient } from "@enjab/hms-client";
import { upsertBill, upsertPatient, patientMrNoSet } from "@enjab/db";
import { detectLanguage } from "@enjab/automations";
import { getHmsClient } from "../hms.ts";
import { runScheduler } from "../scheduler.ts";
import { logger } from "../log.ts";

const log = logger("sync.bills");

/** Bounded-concurrency map. Server is slow + drops sessions; n=3 is the sweet spot. */
async function pool<T, U>(items: T[], n: number, fn: (t: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export interface PollResult {
  fetched: number;
  billsUpserted: number;
  newPatients: number;
  skipped: number;
  errors: number;
  ms: number;
}

/**
 * One pass over the HMS Open-Bills list: scrape, sync any unseen patients
 * (concurrency=3), then upsert all bills. Idempotent at the row level.
 */
export async function pollBills(): Promise<PollResult> {
  const t0 = Date.now();
  const client = await getHmsClient();

  const rows = await fetchOpenBills(client, {
    status: "A",
    visitType: ["o", "i"],
    dateRange: "week",
  });

  const allMrNos = [...new Set(rows.map((r) => r.mrNo))];
  const known = await patientMrNoSet(allMrNos);
  const unseen = allMrNos.filter((m) => !known.has(m));

  // 1. Sync unseen patients first — bills.mr_no FK requires the patient row.
  let newPatients = 0;
  let patientErrors = 0;
  await pool(unseen, 3, async (mrNo) => {
    try {
      const p = await fetchPatient(client, mrNo);
      const nationalityName = (p.raw as { nationality_name?: string })?.nationality_name ?? null;
      await upsertPatient({
        mrNo: p.mrNo,
        fullName: p.fullName,
        phone: p.phone,
        language: detectLanguage(nationalityName),
        rawJson: p.raw,
      });
      newPatients++;
    } catch (e) {
      patientErrors++;
      log.warn(`patient sync failed: ${mrNo}`, { err: String((e as Error).message ?? e) });
    }
  });

  // 2. After syncing, build the final "patient exists" set so we can skip orphans.
  const finalKnown =
    patientErrors === 0 ? new Set(allMrNos) : await patientMrNoSet(allMrNos);

  // 3. Upsert bills — skip any whose patient sync failed.
  let billsUpserted = 0;
  let skipped = 0;
  let billErrors = 0;
  for (const r of rows) {
    if (!finalKnown.has(r.mrNo)) {
      skipped++;
      continue;
    }
    try {
      await upsertBill({
        billNo: r.billNo,
        mrNo: r.mrNo,
        visitId: r.visitId || null,
        visitType: r.visitType === "i" ? "i" : "o",
        openDate: r.openDate,
      });
      billsUpserted++;
    } catch (e) {
      billErrors++;
      log.warn(`bill upsert failed: ${r.billNo}`, { err: String((e as Error).message ?? e) });
    }
  }

  const result: PollResult = {
    fetched: rows.length,
    billsUpserted,
    newPatients,
    skipped,
    errors: patientErrors + billErrors,
    ms: Date.now() - t0,
  };
  log.info(
    `poll done: fetched=${result.fetched} upserted=${result.billsUpserted} new_patients=${result.newPatients} skipped=${result.skipped} errors=${result.errors}`,
    { ms: result.ms }
  );

  // Now that bills + patients are fresh, let each registered automation schedule.
  try {
    await runScheduler();
  } catch (e) {
    log.warn("runScheduler failed", { err: String((e as Error).message ?? e) });
  }

  return result;
}
