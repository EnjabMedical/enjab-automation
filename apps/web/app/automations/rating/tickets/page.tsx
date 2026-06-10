import Link from "next/link";
import {
  listTicketsWithContext,
  countOpenTickets,
  OPEN_TICKET_STATUSES,
  type TicketStatus,
  type TicketWithContextRow,
} from "@enjab/db";
import { RatingTabs } from "@/components/RatingTabs";
import { formatDubai, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; statuses: TicketStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["new", "claimed", "in_progress"] },
  { key: "new", label: "New", statuses: ["new"] },
  { key: "in_progress", label: "In progress", statuses: ["claimed", "in_progress"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "dismissed", label: "Dismissed", statuses: ["dismissed"] },
  {
    key: "all",
    label: "All",
    statuses: ["new", "claimed", "in_progress", "completed", "dismissed"],
  },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function TicketsListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const activeKey = sp.status ?? "open";
  const active = FILTERS.find((f) => f.key === activeKey) ?? FILTERS[0];

  const [rows, openCount] = await Promise.all([
    listTicketsWithContext(active.statuses),
    countOpenTickets(),
  ]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rating — Tickets</h1>
          <p className="mt-1 text-sm text-slate-600">
            Low-rating triage queue. Claim a ticket, call the patient via WhatsApp,
            mark it complete with notes.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {openCount} open · showing {rows.length}
        </div>
      </div>

      <RatingTabs active="tickets" openTicketCount={openCount} />

      <div className="mt-4 flex gap-2 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/automations/rating/tickets" : `/automations/rating/tickets?status=${f.key}`}
            className={
              f.key === active.key
                ? "rounded-full bg-slate-900 px-3 py-1 font-medium text-white"
                : "rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Opened</th>
              <th className="px-4 py-2 font-medium">★</th>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Doctor</th>
              <th className="px-4 py-2 font-medium">Concern</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No tickets in this filter.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <TicketRow key={t.ticketId} t={t} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function TicketRow({ t }: { t: TicketWithContextRow }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2 align-top tabular-nums">
        <Link
          href={`/automations/rating/tickets/${t.ticketId}`}
          className="text-slate-900 hover:text-slate-600"
        >
          <div className="text-sm">{formatDubai(t.createdAt)}</div>
          <div className="text-xs text-slate-500">{relativeTime(t.createdAt)}</div>
        </Link>
      </td>
      <td className="px-4 py-2 align-top text-base font-semibold text-rose-700">
        {"★".repeat(t.score)}
        <span className="text-slate-300">{"★".repeat(5 - t.score)}</span>
      </td>
      <td className="px-4 py-2 align-top">
        <Link
          href={`/automations/rating/tickets/${t.ticketId}`}
          className="font-medium text-slate-900 hover:text-slate-600"
        >
          {t.patientName ?? "—"}
        </Link>
        <div className="font-mono text-[10px] text-slate-400">MR {t.mrNo}</div>
      </td>
      <td className="px-4 py-2 align-top font-mono text-xs text-slate-700">
        {t.patientPhone ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-2 align-top text-sm text-slate-700">{t.doctorName ?? "—"}</td>
      <td className="px-4 py-2 align-top text-sm text-slate-700">
        {t.concernArea ? (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            {t.concernArea}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">awaiting reply</span>
        )}
      </td>
      <td className="px-4 py-2 align-top">
        <StatusPill status={t.status} />
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: TicketStatus }) {
  const palette: Record<TicketStatus, string> = {
    new: "bg-rose-100 text-rose-700",
    claimed: "bg-amber-100 text-amber-800",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    dismissed: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${palette[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
