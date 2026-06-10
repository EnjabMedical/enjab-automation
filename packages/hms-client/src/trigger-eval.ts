import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { InstaHmsClient } from "./instahms.ts";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {}
}
loadEnv();

const BILLS_PATH =
  "/pages/BillDischarge/BillList.do?_method=getBills&status=A&visit_type=i&visit_type=o&creditnote=N&title=Open+Bills&sortOrder=open_date&sortReverse=true&date_range=week";
const LIMIT = 20;

const client = new InstaHmsClient({
  baseUrl: process.env.INSTAHMS_BASE_URL!,
  hospital: process.env.INSTAHMS_HOSPITAL!,
  userId: process.env.INSTAHMS_USER_ID!,
  password: process.env.INSTAHMS_PASSWORD!,
});

await client.login();
const html = await (await client.get(BILLS_PATH)).text();
const $ = cheerio.load(html);

interface Row {
  mrNo: string; billNo: string; visitId: string; visitType: string;
  openDate: string; patientName: string;
}

const rows: Row[] = [];
$("#resultTable > tbody > tr, #resultTable > tr").each((_, tr) => {
  const $tr = $(tr);
  if ($tr.find("td").length === 0) return;
  const onclick = $tr.attr("onclick") ?? "";
  const mrNo = /mrNo:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
  const billNo = /billNo:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
  const visitId = /visitId:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
  const visitType = /visit_type:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
  const tds = $tr.find("td");
  const patientCell = tds.eq(3);
  const patientName =
    patientCell.find("label[title]").attr("title")?.trim() ??
    patientCell.find("label").text().trim().replace(/\s+/g, " ");
  // Open date column index varies — find by date-pattern in cells.
  let openDate = "";
  tds.each((_i, td) => {
    const t = $(td).text().trim();
    if (/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}$/.test(t) && !openDate) openDate = t;
  });
  if (mrNo) rows.push({ mrNo, billNo, visitId, visitType, openDate, patientName });
});

const top = rows.slice(0, LIMIT);

// Sequential with bounded concurrency = 3. Server is slow; parallel-of-20 was timing out
// silently and leaving phones blank (a critical platform bug — fetch failure ≠ no phone).
async function pool<T, U>(items: T[], n: number, fn: (t: T, i: number) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const enriched = await pool(top, 3, async (r) => {
  try {
    const p = await client.getPatientByMrNo(r.mrNo);
    return {
      ...r,
      fullName: (p.full_name as string) || r.patientName,
      phone: (p.patient_phone as string) || "",
      phoneStatus: (p.patient_phone as string) ? "ok" : "no_phone_on_file",
      optOut: (p.custom_list8_value as string) || "",
      dischDate: (p.disch_date as number | null),
      fetchError: null as string | null,
    };
  } catch (e: any) {
    return {
      ...r,
      fullName: r.patientName,
      phone: "",
      phoneStatus: "fetch_error" as const,
      optOut: "",
      dischDate: null,
      fetchError: String(e?.message ?? e),
    };
  }
});

// Parse "DD-MM-YYYY HH:mm" as local time (Asia/Dubai).
function parseHmsDate(s: string): number | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  // Treat as Asia/Dubai (UTC+4) — server is on-prem there.
  const [, d, mo, y, hh, mm] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +hh - 4, +mm);
  return utc;
}

const NOW = Date.now();
const minsAgo = (ts: number | null) => ts == null ? null : Math.round((NOW - ts) / 60000);

console.log(`\nNOW (UTC): ${new Date(NOW).toISOString()}\n`);

// Trigger rules
const RULES = [
  {
    id: "OP_RATING_60M",
    name: "Rating after OP visit (1h after bill open)",
    eval: (r: typeof enriched[number]) => {
      const ageMin = minsAgo(parseHmsDate(r.openDate));
      if (r.visitType !== "o") return { fire: false, why: `visit_type=${r.visitType} (need 'o')` };
      if ((r as any).fetchError) return { fire: false, why: `fetch error: ${(r as any).fetchError}` };
      if (/Opt-?Out/i.test(r.optOut)) return { fire: false, why: `opted out (${r.optOut})` };
      if (!r.phone) return { fire: false, why: "no phone on file" };
      if (ageMin == null) return { fire: false, why: "no open_date" };
      if (ageMin < 60) return { fire: false, why: `too soon (${ageMin}m old, need ≥60m)` };
      if (ageMin > 75) return { fire: false, why: `too late (${ageMin}m old, missed 60–75m window)` };
      return { fire: true, why: `OP, ${ageMin}m after open, has phone, not opted out` };
    },
  },
  {
    id: "IP_RATING_24H_DISCH",
    name: "Rating after IP discharge (+24h)",
    eval: (r: typeof enriched[number]) => {
      const ageMin = minsAgo(r.dischDate);
      if (r.visitType !== "i") return { fire: false, why: `visit_type=${r.visitType} (need 'i')` };
      if (r.dischDate == null) return { fire: false, why: "not discharged yet" };
      if (/Opt-?Out/i.test(r.optOut)) return { fire: false, why: `opted out` };
      if (!r.phone) return { fire: false, why: "no phone" };
      if (ageMin! < 24 * 60) return { fire: false, why: `discharged ${Math.round(ageMin!/60)}h ago, need 24h` };
      if (ageMin! > 24 * 60 + 60) return { fire: false, why: `missed 24–25h window` };
      return { fire: true, why: `IP, discharged ${Math.round(ageMin!/60)}h ago` };
    },
  },
];

console.log("=".repeat(115));
console.log("LATEST 20 OPEN BILLS — TRIGGER EVALUATION");
console.log("=".repeat(115));

for (const [i, r] of enriched.entries()) {
  const age = minsAgo(parseHmsDate(r.openDate));
  const phoneDisplay = r.phone ? r.phone : ((r as any).phoneStatus === "fetch_error" ? `(fetch error: ${(r as any).fetchError})` : "(none on file)");
  console.log(
    `\n${String(i + 1).padStart(2)}. ${r.fullName}` +
    `\n    MR ${r.mrNo}  Bill ${r.billNo}  Visit ${r.visitId} (${r.visitType === 'o' ? 'OP' : r.visitType === 'i' ? 'IP' : r.visitType})` +
    `  Opened ${r.openDate} (${age}m ago)` +
    `\n    Phone: ${phoneDisplay}    Opt-out: ${r.optOut || "(none)"}    Discharge: ${r.dischDate ? new Date(r.dischDate).toISOString() : "—"}`
  );
  for (const rule of RULES) {
    const v = rule.eval(r);
    console.log(`      [${rule.id}] ${v.fire ? "FIRE  ✓" : "skip  ✗"}  — ${v.why}`);
  }
}
