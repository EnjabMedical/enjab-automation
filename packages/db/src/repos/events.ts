import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../client.ts";
import { events } from "../schema.ts";

export interface EventRow {
  id: string;
  ts: Date;
  actor: string;
  action: string;
  target: string | null;
  meta: Record<string, unknown>;
}

export interface RecordEventInput {
  actor: string;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  await getDb().insert(events).values({
    id: randomUUID(),
    actor: input.actor,
    action: input.action,
    target: input.target ?? null,
    meta: input.meta ?? {},
  });
}

export async function getRecentEvents(args: {
  action?: string;
  actor?: string;
  limit?: number;
}): Promise<EventRow[]> {
  const conds = [];
  if (args.action) conds.push(eq(events.action, args.action));
  if (args.actor) conds.push(eq(events.actor, args.actor));
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const q = getDb()
    .select()
    .from(events)
    .orderBy(desc(events.ts))
    .limit(args.limit ?? 50);
  const rows = where ? await q.where(where) : await q;
  return rows as EventRow[];
}
