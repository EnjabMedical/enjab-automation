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
const LIMIT = 10;

interface BillRow {
  mrNo: string;
  billNo: string;
  visitId: string;
  patientName: string;
}

const client = new InstaHmsClient({
  baseUrl: process.env.INSTAHMS_BASE_URL!,
  hospital: process.env.INSTAHMS_HOSPITAL!,
  userId: process.env.INSTAHMS_USER_ID!,
  password: process.env.INSTAHMS_PASSWORD!,
});

const auth = await client.login();
if (!auth.ok) {
  console.error("login failed:", auth.reason);
  process.exit(1);
}

const res = await client.get(BILLS_PATH);
if (res.status !== 200) {
  console.error("bills request failed:", res.status);
  process.exit(2);
}
const html = await res.text();
const $ = cheerio.load(html);

const rows: BillRow[] = [];
$("#resultTable > tbody > tr, #resultTable > tr").each((_, tr) => {
  const $tr = $(tr);
  if ($tr.find("td").length === 0) return;

  // Each row's onclick contains a JS-object literal with mrNo / billNo / visitId.
  const onclick = $tr.attr("onclick") ?? "";
  const mrNo = /mrNo:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
  const billNo = /billNo:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";
  const visitId = /visitId:\s*'([^']+)'/.exec(onclick)?.[1] ?? "";

  // Patient Name = 4th <td>; prefer label[title] (full name) over truncated visible text.
  const cell = $tr.find("td").eq(3);
  const patientName =
    cell.find("label[title]").attr("title")?.trim() ??
    cell.find("label").text().trim().replace(/\s+/g, " ");

  if (mrNo && patientName) rows.push({ mrNo, billNo, visitId, patientName });
});

const top = rows.slice(0, LIMIT);
console.log(`Fetching phone numbers for last ${top.length} open bills…\n`);

const enriched = await Promise.all(
  top.map(async (r) => {
    try {
      const p = await client.getPatientByMrNo(r.mrNo);
      return { ...r, fullName: p.full_name, phone: p.patient_phone ?? "" };
    } catch (e) {
      return { ...r, fullName: r.patientName, phone: "(error)" };
    }
  })
);

const widths = {
  i: 2,
  bill: Math.max(7, ...enriched.map((e) => e.billNo.length)),
  mr: Math.max(6, ...enriched.map((e) => e.mrNo.length)),
  name: Math.max(12, ...enriched.map((e) => e.fullName.length)),
};

const pad = (s: string, w: number) => s.padEnd(w, " ");
console.log(
  `${pad("#", widths.i)}  ${pad("Bill", widths.bill)}  ${pad("MR No", widths.mr)}  ${pad("Patient", widths.name)}  Phone`
);
console.log("-".repeat(widths.i + widths.bill + widths.mr + widths.name + 16));
enriched.forEach((e, i) =>
  console.log(
    `${pad(String(i + 1), widths.i)}  ${pad(e.billNo, widths.bill)}  ${pad(e.mrNo, widths.mr)}  ${pad(e.fullName, widths.name)}  ${e.phone}`
  )
);
