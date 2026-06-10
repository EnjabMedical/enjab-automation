import { sql, eq, desc } from "drizzle-orm";
import { getDb } from "../client.ts";
import { bills, patients } from "../schema.ts";

export interface UpsertBillInput {
  billNo: string;
  mrNo: string;
  visitId: string | null;
  visitType: "o" | "i";
  openDate: Date;
  billStatus?: string | null;
  rawJson?: unknown;
}

/** Idempotent upsert; bumps last_seen_at to NOW(). */
export async function upsertBill(row: UpsertBillInput) {
  await getDb()
    .insert(bills)
    .values({
      billNo: row.billNo,
      mrNo: row.mrNo,
      visitId: row.visitId,
      visitType: row.visitType,
      openDate: row.openDate,
      billStatus: row.billStatus ?? null,
      rawJson: row.rawJson ?? null,
    })
    .onConflictDoUpdate({
      target: bills.billNo,
      set: {
        visitId: sql`EXCLUDED.visit_id`,
        visitType: sql`EXCLUDED.visit_type`,
        openDate: sql`EXCLUDED.open_date`,
        billStatus: sql`EXCLUDED.bill_status`,
        rawJson: sql`EXCLUDED.raw_json`,
        lastSeenAt: sql`NOW()`,
      },
    });
}

export interface RecentBillRow {
  billNo: string;
  mrNo: string;
  visitId: string | null;
  visitType: "o" | "i";
  openDate: Date;
  billStatus: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  fullName: string | null;
  phone: string | null;
}

/** Most recent bills (by open_date desc), joined with patient name + phone. */
export async function getRecentBills(limit = 50): Promise<RecentBillRow[]> {
  const rows = await getDb()
    .select({
      billNo: bills.billNo,
      mrNo: bills.mrNo,
      visitId: bills.visitId,
      visitType: bills.visitType,
      openDate: bills.openDate,
      billStatus: bills.billStatus,
      firstSeenAt: bills.firstSeenAt,
      lastSeenAt: bills.lastSeenAt,
      fullName: patients.fullName,
      phone: patients.phone,
    })
    .from(bills)
    .leftJoin(patients, eq(bills.mrNo, patients.mrNo))
    .orderBy(desc(bills.openDate))
    .limit(limit);
  return rows as RecentBillRow[];
}

export async function lastBillSyncTs(): Promise<Date | null> {
  const [row] = await getDb()
    .select({ ts: sql<Date>`max(${bills.lastSeenAt})` })
    .from(bills);
  return row?.ts ?? null;
}
