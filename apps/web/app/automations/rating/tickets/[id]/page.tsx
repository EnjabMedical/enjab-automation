import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  getDb,
  schema,
  getTicketDetail,
  getTicketReplies,
  countOpenTickets,
  type TicketStatus,
  type TicketReplyRow,
  type TicketWithContextRow,
} from "@enjab/db";
import { RatingTabs } from "@/components/RatingTabs";
import { formatDubai, relativeTime } from "@/lib/format";
import {
  claimTicketAction,
  startTicketAction,
  completeTicketAction,
  dismissTicketAction,
} from "../../../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ticket = await getTicketDetail(id);
  if (!ticket) notFound();

  const [replies, openCount, viewerName, claimer] = await Promise.all([
    getTicketReplies({ mrNo: ticket.mrNo, since: ticket.createdAt }),
    countOpenTickets(),
    cookies().then((c) => c.get("staffName")?.value ?? ""),
    findLatestClaimer(id),
  ]);

  // Strip non-digits FIRST, then gate — a phone with only "+" or junk should
  // not produce a broken wa.me/ link.
  const digits = ticket.patientPhone?.replace(/[^0-9]/g, "") ?? "";
  const waLink = digits ? `https://wa.me/${digits}` : null;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <Link
            href="/automations/rating/tickets"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← All tickets
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Ticket{" "}
            <span className="font-mono text-base text-slate-500">
              {ticket.ticketId.slice(0, 8)}
            </span>
          </h1>
        </div>
        <StatusPill status={ticket.status} />
      </div>

      <RatingTabs active="tickets" openTicketCount={openCount} />

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Patient context block */}
        <div className="md:col-span-2 rounded border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Patient & Visit
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Name">{ticket.patientName ?? "—"}</Field>
            <Field label="MR No"><span className="font-mono text-xs">{ticket.mrNo}</span></Field>
            <Field label="Phone">
              {ticket.patientPhone ? (
                waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-700 hover:underline"
                    title="Open in WhatsApp"
                  >
                    {ticket.patientPhone} ↗
                  </a>
                ) : (
                  <span className="font-mono text-xs">{ticket.patientPhone}</span>
                )
              ) : (
                "—"
              )}
            </Field>
            <Field label="Language">{ticket.patientLanguage ?? "—"}</Field>
            <Field label="Doctor">{ticket.doctorName ?? "—"}</Field>
            <Field label="Nationality">{ticket.nationalityName ?? "—"}</Field>
            <Field label="Bill"><span className="font-mono text-xs">{ticket.billNo}</span></Field>
            <Field label="Visit opened">{formatDubai(ticket.openDate)}</Field>
            <Field label="Rating">
              <span className="text-base font-semibold text-rose-700">
                {"★".repeat(ticket.score)}
                <span className="text-slate-300">{"★".repeat(5 - ticket.score)}</span>
              </span>
              <span className="ml-1 text-xs text-slate-500">({ticket.score}/5, mode {ticket.mode})</span>
            </Field>
            <Field label="Concern area">
              {ticket.concernArea ? (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {ticket.concernArea}
                </span>
              ) : (
                <span className="text-slate-400 text-xs">awaiting patient reply</span>
              )}
            </Field>
            <Field label="Rated at">{formatDubai(ticket.receivedAt)}</Field>
            <Field label="Ticket opened">
              {formatDubai(ticket.createdAt)}{" "}
              <span className="text-xs text-slate-500">({relativeTime(ticket.createdAt)})</span>
            </Field>
            {ticket.claimedAt && (
              <Field label="Claimed at">
                {formatDubai(ticket.claimedAt)}
                {claimer && (
                  <span className="ml-1 text-xs text-slate-500">by {claimer}</span>
                )}
              </Field>
            )}
            {ticket.completedAt && (
              <Field label={ticket.status === "dismissed" ? "Dismissed at" : "Completed at"}>
                {formatDubai(ticket.completedAt)}
              </Field>
            )}
            {ticket.resolutionNotes && (
              <div className="col-span-2 mt-2 rounded bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {ticket.status === "dismissed" ? "Dismissal reason" : "Resolution notes"}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {ticket.resolutionNotes}
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* Lifecycle actions */}
        <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Actions
          </h2>
          <ActionsPanel ticket={ticket} defaultName={viewerName} />
        </div>
      </div>

      {/* Replies timeline */}
      <div className="mt-6 rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Patient replies ({replies.length})
        </h2>
        {replies.length === 0 ? (
          <div className="rounded bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No replies yet. Free-form messages from the patient after the followup
            template will appear here.
          </div>
        ) : (
          <ul className="space-y-3">
            {replies.map((r) => (
              <ReplyItem key={r.id} reply={r} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ActionsPanel({
  ticket,
  defaultName,
}: {
  ticket: TicketWithContextRow;
  defaultName: string;
}) {
  if (ticket.status === "completed" || ticket.status === "dismissed") {
    return (
      <p className="text-sm text-slate-500">
        Ticket is {ticket.status}. No further actions available.
      </p>
    );
  }

  const NameInput = () => (
    <label className="block text-xs">
      <span className="text-slate-600">Your name</span>
      <input
        type="text"
        name="actorName"
        defaultValue={defaultName}
        required
        placeholder="e.g. Mais"
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      {ticket.status === "new" && (
        <form action={claimTicketAction} className="space-y-2">
          <NameInput />
          <input type="hidden" name="ticketId" value={ticket.ticketId} />
          <button
            type="submit"
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Claim ticket
          </button>
        </form>
      )}

      {ticket.status === "claimed" && (
        <form action={startTicketAction} className="space-y-2">
          <NameInput />
          <input type="hidden" name="ticketId" value={ticket.ticketId} />
          <button
            type="submit"
            className="w-full rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Mark in progress
          </button>
        </form>
      )}

      {(ticket.status === "claimed" || ticket.status === "in_progress") && (
        <form action={completeTicketAction} className="space-y-2 border-t border-slate-100 pt-4">
          <NameInput />
          <input type="hidden" name="ticketId" value={ticket.ticketId} />
          <label className="block text-xs">
            <span className="text-slate-600">Resolution notes</span>
            <textarea
              name="notes"
              required
              minLength={3}
              rows={4}
              placeholder="What did you do to address the concern?"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Complete ticket
          </button>
        </form>
      )}

      <form action={dismissTicketAction} className="space-y-2 border-t border-slate-100 pt-4">
        <NameInput />
        <input type="hidden" name="ticketId" value={ticket.ticketId} />
        <label className="block text-xs">
          <span className="text-slate-600">Dismissal reason</span>
          <textarea
            name="reason"
            required
            minLength={3}
            rows={2}
            placeholder="Why is this ticket not actionable?"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Dismiss
        </button>
      </form>
    </div>
  );
}

/**
 * Find the most recent staffer who claimed this ticket. Looks in the events
 * audit log (actor field) since claimedBy on the ticket row stays NULL in the
 * no-auth phase.
 */
async function findLatestClaimer(ticketId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ actor: schema.events.actor })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.target, ticketId),
        inArray(schema.events.action, ["ticket.claimed", "ticket.started"]),
      ),
    )
    .orderBy(desc(schema.events.ts))
    .limit(1);
  return row?.actor ?? null;
}

function ReplyItem({ reply }: { reply: TicketReplyRow }) {
  const body = reply.body as {
    kind?: string;
    text?: string;
    payload?: string;
    interactiveTitle?: string;
  };
  const kind = body.kind ?? "text";

  // Render hint differs by message kind so staff can tell a button-tap from a typed reply.
  let label = "Patient";
  let content = body.text ?? body.interactiveTitle ?? body.payload ?? `[${kind}]`;
  if (kind === "button_reply") {
    label = "Patient tapped";
    content = body.payload ?? "[button]";
  } else if (kind === "interactive") {
    label = "Patient tapped";
    content = body.interactiveTitle ?? "[interactive]";
  }

  return (
    <li className="rounded bg-emerald-50 p-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium text-emerald-800">{label}</span>
        <span>
          {formatDubai(reply.createdAt)} ({relativeTime(reply.createdAt)})
        </span>
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{content}</div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
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
    <span className={`rounded px-2.5 py-1 text-xs font-medium ${palette[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
