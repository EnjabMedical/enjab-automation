import { eq, and, gte, asc } from "drizzle-orm";
import { countOpenTickets, getDb, schema, getAutomationRow } from "@enjab/db";
import { mergeRatingConfig, type RatingConfig } from "@enjab/automations";
import { RatingTabs } from "@/components/RatingTabs";
import { formatDubai, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UpcomingRatingPage() {
  const [row, openCount] = await Promise.all([getAutomationRow("rating"), countOpenTickets()]);
  const config = mergeRatingConfig((row?.config ?? {}) as Partial<RatingConfig>);
  const now = new Date();

  // Pending jobs over the next 48h, joined to bill + patient.
  const rows = await getDb()
    .select({
      jobId: schema.scheduledJobs.id,
      targetKey: schema.scheduledJobs.targetKey,
      fireAt: schema.scheduledJobs.fireAt,
      mrNo: schema.bills.mrNo,
      visitType: schema.bills.visitType,
      openDate: schema.bills.openDate,
      fullName: schema.patients.fullName,
      phone: schema.patients.phone,
    })
    .from(schema.scheduledJobs)
    .leftJoin(schema.bills, eq(schema.scheduledJobs.targetKey, schema.bills.billNo))
    .leftJoin(schema.patients, eq(schema.bills.mrNo, schema.patients.mrNo))
    .where(
      and(
        eq(schema.scheduledJobs.automationId, "rating"),
        eq(schema.scheduledJobs.status, "pending"),
        gte(schema.scheduledJobs.fireAt, now)
      )
    )
    .orderBy(asc(schema.scheduledJobs.fireAt))
    .limit(200);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rating — Upcoming</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pending jobs scheduled to fire in the next 48 hours.{" "}
            {config.dryRun && (
              <span className="font-medium text-amber-700">
                Dry-run is on — these will record a decision but not send.
              </span>
            )}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">{rows.length} pending</div>
      </div>

      <RatingTabs active="upcoming" openTicketCount={openCount} />

      <div className="mt-4 overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fires (Dubai)</th>
              <th className="px-4 py-2 font-medium">Bill</th>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Opened</th>
              <th className="px-4 py-2 text-right font-medium">In</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No pending jobs.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.jobId} className="hover:bg-slate-50">
                <td className="px-4 py-2 tabular-nums text-slate-700">{formatDubai(r.fireAt)}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.targetKey}</td>
                <td className="px-4 py-2 text-slate-900">{r.fullName ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">
                  {r.phone ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2 tabular-nums text-xs text-slate-500">
                  {formatDubai(r.openDate)}
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  {relativeTime(r.fireAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

