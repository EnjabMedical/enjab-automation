import { sql, desc } from "drizzle-orm";
import { countOpenTickets, getDb, schema } from "@enjab/db";
import { RatingTabs } from "@/components/RatingTabs";
import { formatDubai, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DecisionRow {
  id: string;
  ts: Date;
  action: string;
  target: string | null;
  meta: {
    reason?: string;
    message?: { templateName: string; to: string; preview: string } | null;
    filterTrace?: { filterId: string; pass: boolean; reason?: string }[];
  };
}

export default async function DecisionsPage() {
  // Pull rating-only decisions (not the .scheduled audit entries).
  const [rows, openCount] = await Promise.all([
    getDb()
      .select()
      .from(schema.events)
      .where(sql`${schema.events.actor} = 'rating' AND ${schema.events.action} <> 'rating.scheduled'`)
      .orderBy(desc(schema.events.ts))
      .limit(100) as unknown as Promise<DecisionRow[]>,
    countOpenTickets(),
  ]);

  // Counts by action over the recent set.
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rating — Decisions</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every fire result, with the filter trace and the message that would have been sent.
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-500">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="rounded bg-slate-100 px-2 py-0.5 font-medium">
              {k.replace("rating.", "")}: {v}
            </span>
          ))}
        </div>
      </div>

      <RatingTabs active="decisions" openTicketCount={openCount} />

      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
            No decisions yet — enable the automation in settings, then watch this page.
          </div>
        )}
        {rows.map((r) => (
          <Decision key={r.id} row={r} />
        ))}
      </div>
    </main>
  );
}

function Decision({ row }: { row: DecisionRow }) {
  const status = row.action.replace("rating.", "");
  const isHappy = status === "sent" || status === "dry_run";

  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isHappy
                ? "bg-emerald-50 text-emerald-700"
                : status === "skipped"
                ? "bg-slate-100 text-slate-600"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {status}
          </span>
          <span className="font-mono text-xs text-slate-500">{row.target}</span>
        </div>
        <span className="text-xs text-slate-500">
          {formatDubai(row.ts)} ({relativeTime(row.ts)})
        </span>
      </div>

      {row.meta.reason && (
        <div className="mt-2 text-sm text-slate-700">{row.meta.reason}</div>
      )}

      {row.meta.message && (
        <div className="mt-3 rounded bg-slate-50 p-3 text-sm">
          <div className="text-xs text-slate-500">
            Template <span className="font-mono">{row.meta.message.templateName}</span> →{" "}
            <span className="font-mono">{row.meta.message.to}</span>
          </div>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
            {row.meta.message.preview}
          </pre>
        </div>
      )}

      {row.meta.filterTrace && row.meta.filterTrace.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {row.meta.filterTrace.map((f, i) => (
            <span
              key={i}
              className={`rounded px-1.5 py-0.5 font-medium ${
                f.pass
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
              title={f.reason ?? ""}
            >
              {f.pass ? "✓" : "✗"} {f.filterId}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

