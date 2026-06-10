import * as cheerio from "cheerio";
import { InstaHmsClient } from "./instahms.ts";

export type VisitType = "o" | "i";
export type BillStatusCode = "A" | "C" | "F";

export interface BillRow {
  mrNo: string;
  billNo: string;
  visitId: string;
  visitType: VisitType | string;
  openDate: Date;
  patientName: string;
}

export interface FetchOpenBillsOptions {
  status?: BillStatusCode | BillStatusCode[];
  visitType?: VisitType[];
  dateRange?: "today" | "week" | "month";
}

// Asia/Dubai is UTC+4 fixed (no DST).
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Parse `DD-MM-YYYY HH:mm` from the HMS as Asia/Dubai local time → UTC Date. */
export function parseHmsDate(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, d, mo, y, hh, mm] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm) - DUBAI_OFFSET_MS);
}

/** Parse the HMS BillList HTML into typed rows. */
export function parseBillList(html: string): BillRow[] {
  const $ = cheerio.load(html);
  const rows: BillRow[] = [];

  $("#resultTable > tbody > tr, #resultTable > tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.find("td").length === 0) return;

    // mrNo / billNo / visitId / visit_type ride the onclick payload.
    const onclick = $tr.attr("onclick") ?? "";
    const mrNo = /mrNo:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
    const billNo = /billNo:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
    const visitId = /visitId:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
    const visitType = /visit_type:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";

    // Patient name is in the 4th <td>; full name in label[title], visible text truncated.
    const tds = $tr.find("td");
    const cell = tds.eq(3);
    const patientName =
      cell.find("label[title]").attr("title")?.trim() ??
      cell.find("label").text().trim().replace(/\s+/g, " ");

    // Open Date column index varies between layouts — find the first matching cell.
    let openDate: Date | null = null;
    tds.each((_i, td) => {
      if (openDate) return;
      const t = $(td).text().trim();
      const parsed = parseHmsDate(t);
      if (parsed) openDate = parsed;
    });

    if (mrNo && billNo && openDate) {
      rows.push({ mrNo, billNo, visitId, visitType, openDate, patientName });
    }
  });

  return rows;
}

/** Fetch the BillList HTML over the HMS session and parse it. */
export async function fetchOpenBills(
  client: InstaHmsClient,
  opts: FetchOpenBillsOptions = {}
): Promise<BillRow[]> {
  const statuses = Array.isArray(opts.status) ? opts.status : [opts.status ?? "A"];
  const visitTypes = opts.visitType ?? ["o", "i"];
  const dateRange = opts.dateRange ?? "week";

  const params = new URLSearchParams();
  params.set("_method", "getBills");
  for (const s of statuses) params.append("status", s);
  for (const v of visitTypes) params.append("visit_type", v);
  params.set("creditnote", "N");
  params.set("title", "Open Bills");
  params.set("sortOrder", "open_date");
  params.set("sortReverse", "true");
  params.set("date_range", dateRange);

  const res = await client.get(`/pages/BillDischarge/BillList.do?${params.toString()}`);
  if (res.status !== 200) {
    throw new Error(`fetchOpenBills failed: HTTP ${res.status}`);
  }
  return parseBillList(await res.text());
}
