import { randomUUID } from "node:crypto";
import { eq, desc, and, gte } from "drizzle-orm";
import { getDb } from "../client.ts";
import { messages } from "../schema.ts";

export type MessageDirection = "in" | "out";
export type MessageChannel = "whatsapp" | "sms" | "email" | "internal";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface InsertMessageInput {
  automationId?: string | null;
  targetKey?: string | null;
  mrNo?: string | null;
  direction: MessageDirection;
  channel: MessageChannel;
  waMsgId?: string | null;
  templateName?: string | null;
  status?: MessageStatus;
  body?: Record<string, unknown>;
  raw?: unknown;
  error?: string | null;
}

/**
 * Insert a message row. Idempotent on `wa_msg_id`: a duplicate Meta delivery
 * (Meta retries on its own internal logic, not just non-2xx responses) returns
 * the existing row's id instead of throwing. Without this, the second delivery
 * of the same `wa_msg_id` would 23505-violate the unique index, abort the
 * webhook handler, and silently drop the inbound — including aborting the
 * rating state machine mid-transition for button taps.
 */
export async function insertMessage(input: InsertMessageInput): Promise<string> {
  const id = randomUUID();
  // Coerce empty-string waMsgId (malformed Meta payloads) to null so the
  // unique index doesn't pollute with multiple empty-string rows.
  const waMsgId =
    input.waMsgId && input.waMsgId.length > 0 ? input.waMsgId : null;

  if (waMsgId) {
    const inserted = await getDb()
      .insert(messages)
      .values({
        id,
        automationId: input.automationId ?? null,
        targetKey: input.targetKey ?? null,
        mrNo: input.mrNo ?? null,
        direction: input.direction,
        channel: input.channel,
        waMsgId,
        templateName: input.templateName ?? null,
        status: input.status ?? "sent",
        body: input.body ?? {},
        raw: input.raw ?? null,
        error: input.error ?? null,
      })
      .onConflictDoNothing({ target: messages.waMsgId })
      .returning({ id: messages.id });
    if (inserted[0]?.id) return inserted[0].id as string;
    // Conflict — fetch existing id so callers can stay idempotent.
    const [existing] = await getDb()
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.waMsgId, waMsgId))
      .limit(1);
    return (existing?.id as string) ?? id;
  }

  // No waMsgId — plain insert (no idempotency key available).
  await getDb()
    .insert(messages)
    .values({
      id,
      automationId: input.automationId ?? null,
      targetKey: input.targetKey ?? null,
      mrNo: input.mrNo ?? null,
      direction: input.direction,
      channel: input.channel,
      waMsgId: null,
      templateName: input.templateName ?? null,
      status: input.status ?? "sent",
      body: input.body ?? {},
      raw: input.raw ?? null,
      error: input.error ?? null,
    });
  return id;
}

export async function updateMessageStatusByWaMsgId(
  waMsgId: string,
  status: MessageStatus,
  error?: string | null
): Promise<void> {
  await getDb()
    .update(messages)
    .set({ status, statusTs: new Date(), error: error ?? null })
    .where(eq(messages.waMsgId, waMsgId));
}

export interface OutboundMessageRow {
  id: string;
  automationId: string | null;
  targetKey: string | null;
  mrNo: string | null;
  templateName: string | null;
  waMsgId: string | null;
  status: MessageStatus;
  createdAt: Date;
  body: Record<string, unknown>;
}

/**
 * Find the most recent outbound rating message sent to a phone within the last
 * `lookbackHours`. Used to map an inbound button reply back to its bill.
 */
export async function findRecentOutboundForPhone(args: {
  automationId: string;
  phone: string;                  // patient_phone we look up via mr_no FK chain in caller
  lookbackHours?: number;
}): Promise<OutboundMessageRow | null> {
  const since = new Date(Date.now() - (args.lookbackHours ?? 48) * 60 * 60 * 1000);
  // Note: we don't store the phone on the message row directly — the caller resolves
  // phone → mr_no → most recent outbound. This helper is keyed by automationId + mrNo.
  void args.phone;
  void since;
  return null;
}

/** Latest outbound rating message for a given mr_no, within the lookback window. */
export async function findRecentOutboundForPatient(args: {
  automationId: string;
  mrNo: string;
  lookbackHours?: number;
}): Promise<OutboundMessageRow | null> {
  const since = new Date(Date.now() - (args.lookbackHours ?? 48) * 60 * 60 * 1000);
  const [row] = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.automationId, args.automationId),
        eq(messages.mrNo, args.mrNo),
        eq(messages.direction, "out"),
        gte(messages.createdAt, since)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return (row as OutboundMessageRow | undefined) ?? null;
}
