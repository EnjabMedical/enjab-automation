import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../client.ts";
import { bills, messages, patients, ratings, ratingTickets } from "../schema.ts";

export type RatingMode = "a1" | "a2";

/** Canonical English slugs for the 6 concern-area buttons. */
export type ConcernArea =
  | "reception"
  | "doctor"
  | "nursing"
  | "billing"
  | "laser"
  | "other";

export interface RatingRow {
  id: string;
  billNo: string;
  score: number;
  comment: string | null;
  mode: RatingMode;
  concernArea: ConcernArea | null;
  receivedAt: Date;
}

export interface InsertRatingInput {
  billNo: string;
  score: number;          // 1..5
  comment?: string | null;
  mode: RatingMode;
}

/** Insert a rating row. ON CONFLICT (bill_no) DO NOTHING — only first reply counts. */
export async function tryInsertRating(input: InsertRatingInput): Promise<RatingRow | null> {
  const id = randomUUID();
  const inserted = await getDb()
    .insert(ratings)
    .values({
      id,
      billNo: input.billNo,
      score: input.score,
      comment: input.comment ?? null,
      mode: input.mode,
    })
    .onConflictDoNothing({ target: ratings.billNo })
    .returning();
  return (inserted[0] as RatingRow | undefined) ?? null;
}

/**
 * Attach the concern area the patient picked. Idempotent: only writes if the
 * row exists and concern_area is still null (first answer wins, like the
 * rating itself). Returns the updated row or null if not found / already set.
 */
export async function setRatingConcernArea(args: {
  billNo: string;
  concernArea: ConcernArea;
}): Promise<RatingRow | null> {
  const updated = await getDb()
    .update(ratings)
    .set({ concernArea: args.concernArea })
    .where(and(eq(ratings.billNo, args.billNo), isNull(ratings.concernArea)))
    .returning();
  return (updated[0] as RatingRow | undefined) ?? null;
}

export async function getRatingByBill(billNo: string): Promise<RatingRow | null> {
  const [row] = await getDb().select().from(ratings).where(eq(ratings.billNo, billNo)).limit(1);
  return (row as RatingRow | undefined) ?? null;
}

export async function getRecentRatings(limit = 50): Promise<RatingRow[]> {
  const rows = await getDb()
    .select()
    .from(ratings)
    .orderBy(desc(ratings.receivedAt))
    .limit(limit);
  return rows as RatingRow[];
}

// ─── Rating tickets (Low-Rating Triage pane) ───────────────────────────────

export type TicketStatus = "new" | "claimed" | "in_progress" | "completed" | "dismissed";

export interface TicketRow {
  id: string;
  ratingId: string;
  status: TicketStatus;
  claimedBy: string | null;
  claimedAt: Date | null;
  completedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Statuses that mean the ticket is still actionable. */
export const OPEN_TICKET_STATUSES: ReadonlyArray<TicketStatus> = [
  "new",
  "claimed",
  "in_progress",
];

export async function insertRatingTicket(args: { ratingId: string }): Promise<TicketRow | null> {
  const id = randomUUID();
  const inserted = await getDb()
    .insert(ratingTickets)
    .values({ id, ratingId: args.ratingId })
    .onConflictDoNothing({ target: ratingTickets.ratingId })
    .returning();
  return (inserted[0] as TicketRow | undefined) ?? null;
}

// Removed `getOpenTickets()` — its name promised "open" but the query had no
// status filter and returned every row, ever. The dashboard uses
// listTicketsWithContext / countOpenTickets instead; nothing else called it.

/** Denormalized row used for both the tickets list and the detail header. */
export interface TicketWithContextRow {
  ticketId: string;
  ratingId: string;
  status: TicketStatus;
  claimedBy: string | null;
  claimedAt: Date | null;
  completedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Joined fields */
  billNo: string;
  mrNo: string;
  openDate: Date;
  visitType: "o" | "i";
  patientName: string | null;
  patientPhone: string | null;
  patientLanguage: string | null;
  doctorName: string | null;
  nationalityName: string | null;
  score: number;
  comment: string | null;
  mode: RatingMode;
  concernArea: ConcernArea | null;
  receivedAt: Date;
}

/**
 * Tickets filtered by status (default: open = new + claimed + in_progress),
 * joined with rating + bill + patient. Newest first.
 *
 * Pulls doctor_name + nationality_name from patients.raw_json so the list view
 * can show the doctor even if the rating row only knows bill_no.
 */
export async function listTicketsWithContext(
  statuses: ReadonlyArray<TicketStatus> = OPEN_TICKET_STATUSES,
  limit = 200,
): Promise<TicketWithContextRow[]> {
  const rows = await getDb()
    .select({
      ticketId: ratingTickets.id,
      ratingId: ratingTickets.ratingId,
      status: ratingTickets.status,
      claimedBy: ratingTickets.claimedBy,
      claimedAt: ratingTickets.claimedAt,
      completedAt: ratingTickets.completedAt,
      resolutionNotes: ratingTickets.resolutionNotes,
      createdAt: ratingTickets.createdAt,
      updatedAt: ratingTickets.updatedAt,
      billNo: bills.billNo,
      mrNo: bills.mrNo,
      openDate: bills.openDate,
      visitType: bills.visitType,
      patientName: patients.fullName,
      patientPhone: patients.phone,
      patientLanguage: patients.language,
      doctorName: sql<string | null>`${patients.rawJson}->>'doctor_name'`,
      nationalityName: sql<string | null>`${patients.rawJson}->>'nationality_name'`,
      score: ratings.score,
      comment: ratings.comment,
      mode: ratings.mode,
      concernArea: ratings.concernArea,
      receivedAt: ratings.receivedAt,
    })
    .from(ratingTickets)
    .innerJoin(ratings, eq(ratings.id, ratingTickets.ratingId))
    .innerJoin(bills, eq(bills.billNo, ratings.billNo))
    .leftJoin(patients, eq(patients.mrNo, bills.mrNo))
    .where(inArray(ratingTickets.status, statuses as TicketStatus[]))
    .orderBy(desc(ratingTickets.createdAt))
    .limit(limit);
  return rows as TicketWithContextRow[];
}

export async function getTicketDetail(ticketId: string): Promise<TicketWithContextRow | null> {
  const rows = await getDb()
    .select({
      ticketId: ratingTickets.id,
      ratingId: ratingTickets.ratingId,
      status: ratingTickets.status,
      claimedBy: ratingTickets.claimedBy,
      claimedAt: ratingTickets.claimedAt,
      completedAt: ratingTickets.completedAt,
      resolutionNotes: ratingTickets.resolutionNotes,
      createdAt: ratingTickets.createdAt,
      updatedAt: ratingTickets.updatedAt,
      billNo: bills.billNo,
      mrNo: bills.mrNo,
      openDate: bills.openDate,
      visitType: bills.visitType,
      patientName: patients.fullName,
      patientPhone: patients.phone,
      patientLanguage: patients.language,
      doctorName: sql<string | null>`${patients.rawJson}->>'doctor_name'`,
      nationalityName: sql<string | null>`${patients.rawJson}->>'nationality_name'`,
      score: ratings.score,
      comment: ratings.comment,
      mode: ratings.mode,
      concernArea: ratings.concernArea,
      receivedAt: ratings.receivedAt,
    })
    .from(ratingTickets)
    .innerJoin(ratings, eq(ratings.id, ratingTickets.ratingId))
    .innerJoin(bills, eq(bills.billNo, ratings.billNo))
    .leftJoin(patients, eq(patients.mrNo, bills.mrNo))
    .where(eq(ratingTickets.id, ticketId))
    .limit(1);
  return (rows[0] as TicketWithContextRow | undefined) ?? null;
}

export async function countOpenTickets(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(ratingTickets)
    .where(inArray(ratingTickets.status, OPEN_TICKET_STATUSES as TicketStatus[]));
  return (row?.n ?? 0) as number;
}

/**
 * Inbound patient messages tied to a ticket. Inbound messages don't carry
 * targetKey (only outbound rating sends do), so we look up by mrNo, filtered
 * to direction=in and to messages that arrived after the ticket was opened.
 */
export interface TicketReplyRow {
  id: string;
  waMsgId: string | null;
  createdAt: Date;
  body: Record<string, unknown>;
  templateName: string | null;
}

export async function getTicketReplies(args: {
  mrNo: string;
  since: Date;
  limit?: number;
}): Promise<TicketReplyRow[]> {
  const rows = await getDb()
    .select({
      id: messages.id,
      waMsgId: messages.waMsgId,
      createdAt: messages.createdAt,
      body: messages.body,
      templateName: messages.templateName,
    })
    .from(messages)
    .where(
      and(
        eq(messages.mrNo, args.mrNo),
        eq(messages.direction, "in"),
        gte(messages.createdAt, args.since),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(args.limit ?? 200);
  return rows as TicketReplyRow[];
}

// ─── Ticket lifecycle transitions ─────────────────────────────────────────
//
// All transitions are race-safe via a status guard in the WHERE clause. If
// the guard fails (someone else already advanced the ticket, or it was closed)
// the UPDATE matches no rows and we return null — callers surface that as
// "already claimed" / "already closed" in the UI.
//
// claimedBy is intentionally LEFT NULL right now: there is no auth layer yet,
// so we can't stamp a valid users.id (FK would violate). The actor name is
// captured in events.actor instead — see app/automations/actions.ts.

export async function claimTicket(ticketId: string): Promise<TicketRow | null> {
  const updated = await getDb()
    .update(ratingTickets)
    .set({ status: "claimed", claimedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(ratingTickets.id, ticketId), eq(ratingTickets.status, "new")))
    .returning();
  return (updated[0] as TicketRow | undefined) ?? null;
}

export async function startTicket(ticketId: string): Promise<TicketRow | null> {
  const updated = await getDb()
    .update(ratingTickets)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(and(eq(ratingTickets.id, ticketId), eq(ratingTickets.status, "claimed")))
    .returning();
  return (updated[0] as TicketRow | undefined) ?? null;
}

export async function completeTicket(args: {
  ticketId: string;
  notes: string;
}): Promise<TicketRow | null> {
  const updated = await getDb()
    .update(ratingTickets)
    .set({
      status: "completed",
      completedAt: new Date(),
      resolutionNotes: args.notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ratingTickets.id, args.ticketId),
        inArray(ratingTickets.status, ["claimed", "in_progress"]),
      ),
    )
    .returning();
  return (updated[0] as TicketRow | undefined) ?? null;
}

export async function dismissTicket(args: {
  ticketId: string;
  reason: string;
}): Promise<TicketRow | null> {
  const updated = await getDb()
    .update(ratingTickets)
    .set({
      status: "dismissed",
      completedAt: new Date(),
      resolutionNotes: args.reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ratingTickets.id, args.ticketId),
        inArray(ratingTickets.status, ["new", "claimed", "in_progress"]),
      ),
    )
    .returning();
  return (updated[0] as TicketRow | undefined) ?? null;
}

/**
 * Open ticket lookup result. Used by the webhook to attach inbound free-form
 * replies to the right ticket.
 */
export interface OpenTicketForPatientRow {
  ticketId: string;
  ratingId: string;
  billNo: string;
  status: TicketStatus;
  createdAt: Date;
}

/** Lookup a single open ticket by its bill_no. */
export async function findOpenTicketByBill(
  billNo: string,
): Promise<OpenTicketForPatientRow | null> {
  const rows = await getDb()
    .select({
      ticketId: ratingTickets.id,
      ratingId: ratingTickets.ratingId,
      billNo: ratings.billNo,
      status: ratingTickets.status,
      createdAt: ratingTickets.createdAt,
    })
    .from(ratingTickets)
    .innerJoin(ratings, eq(ratings.id, ratingTickets.ratingId))
    .where(
      and(
        eq(ratings.billNo, billNo),
        inArray(ratingTickets.status, OPEN_TICKET_STATUSES as TicketStatus[]),
      ),
    )
    .limit(1);
  return (rows[0] as OpenTicketForPatientRow | undefined) ?? null;
}

/**
 * Find the most recent open rating ticket for a patient by mr_no.
 * Fallback used by the webhook only when there's no recent outbound to anchor
 * the reply to a specific bill. Naively returns the newest open ticket; a
 * patient with multiple concurrent open tickets is rare but possible.
 */
export async function findOpenTicketForPatient(
  mrNo: string,
): Promise<OpenTicketForPatientRow | null> {
  const rows = await getDb()
    .select({
      ticketId: ratingTickets.id,
      ratingId: ratingTickets.ratingId,
      billNo: ratings.billNo,
      status: ratingTickets.status,
      createdAt: ratingTickets.createdAt,
    })
    .from(ratingTickets)
    .innerJoin(ratings, eq(ratings.id, ratingTickets.ratingId))
    .innerJoin(bills, eq(bills.billNo, ratings.billNo))
    .where(
      and(
        eq(bills.mrNo, mrNo),
        inArray(ratingTickets.status, OPEN_TICKET_STATUSES as TicketStatus[]),
      ),
    )
    .orderBy(desc(ratingTickets.createdAt))
    .limit(1);
  return (rows[0] as OpenTicketForPatientRow | undefined) ?? null;
}
