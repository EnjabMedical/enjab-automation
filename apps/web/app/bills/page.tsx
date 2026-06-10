import { getRecentBills, lastBillSyncTs } from "@enjab/db";
import { formatDubai, relativeTime } from "@/lib/format";

// Always render fresh — bills change every poll cycle.
export const dynamic = "force-dynamic";

const visitLabel = (v: string) =>
  v === "o" ? "OP" : v === "i" ? "IP" : v;

export default async function BillsPage() {
  const [rows, lastSync] = await Promise.all([getRecentBills(100), lastBillSyncTs()]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="mt-1 text-sm text-slate-600">
            Live mirror of HMS Open Bills. Polled every 5 minutes.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Last poll: {relativeTime(lastSync)}</div>
          <div>{rows.length} rows</div>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Open (Dubai)</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Bill</th>
              <th className="px-4 py-2 font-medium">MR</th>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium text-right">Synced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No bills yet — waiting for first poll.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.billNo} className="hover:bg-slate-50">
                <td className="px-4 py-2 tabular-nums text-slate-700">
                  {formatDubai(r.openDate)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.visitType === "o"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {visitLabel(r.visitType)}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.billNo}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.mrNo}</td>
                <td className="px-4 py-2 text-slate-900">{r.fullName ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {r.phone ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  {relativeTime(r.lastSeenAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
