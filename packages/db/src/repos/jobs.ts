import { eq, and, gte, lte, asc, sql, desc } from "drizzle-orm";
import { getDb } from "../client.ts";
import { scheduledJobs } from "../schema.ts";

export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled";

export interface ScheduledJobRow {
  id: string;
  automationId: string;
  targetKey: string;
  fireAt: Date;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertScheduledJobInput {
  id: string;
  automationId: string;
  targetKey: string;
  fireAt: Date;
  payload?: Record<string, unknown>;
}

/**
 * Insert a scheduled job; do nothing if (automation_id, target_key) already exists.
 * Returns true iff a new row was inserted.
 */
export async function tryInsertScheduledJob(input: UpsertScheduledJobInput): Promise<boolean> {
  const inserted = await getDb()
    .insert(scheduledJobs)
    .values({
      id: input.id,
      automationId: input.automationId,
      targetKey: input.targetKey,
      fireAt: input.fireAt,
      status: "pending",
      payload: input.payload ?? {},
    })
    .onConflictDoNothing({ target: [scheduledJobs.automationId, scheduledJobs.targetKey] })
    .returning({ id: scheduledJobs.id });
  return inserted.length > 0;
}

export async function getScheduledJob(id: string): Promise<ScheduledJobRow | null> {
  const [row] = await getDb()
    .select()
    .from(scheduledJobs)
    .where(eq(scheduledJobs.id, id))
    .limit(1);
  return (row as ScheduledJobRow | undefined) ?? null;
}

export async function getScheduledJobByTarget(
  automationId: string,
  targetKey: string
): Promise<ScheduledJobRow | null> {
  const [row] = await getDb()
    .select()
    .from(scheduledJobs)
    .where(
      and(eq(scheduledJobs.automationId, automationId), eq(scheduledJobs.targetKey, targetKey))
    )
    .limit(1);
  return (row as ScheduledJobRow | undefined) ?? null;
}

/** Mark a job as `running` if it's still `pending`. Returns true on successful claim. */
export async function claimJob(id: string): Promise<boolean> {
  const claimed = await getDb()
    .update(scheduledJobs)
    .set({ status: "running", attempts: sql`${scheduledJobs.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.status, "pending")))
    .returning({ id: scheduledJobs.id });
  return claimed.length > 0;
}

export async function completeJob(
  id: string,
  status: JobStatus,
  lastError?: string | null
): Promise<void> {
  await getDb()
    .update(scheduledJobs)
    .set({
      status,
      lastError: lastError ?? null,
      updatedAt: new Date(),
    })
    .where(eq(scheduledJobs.id, id));
}

export interface UpcomingJobRow extends ScheduledJobRow {}

export async function getUpcomingJobs(
  automationId: string,
  withinHours: number,
  limit = 100
): Promise<UpcomingJobRow[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.automationId, automationId),
        eq(scheduledJobs.status, "pending"),
        gte(scheduledJobs.fireAt, now),
        lte(scheduledJobs.fireAt, horizon)
      )
    )
    .orderBy(asc(scheduledJobs.fireAt))
    .limit(limit);
  return rows as UpcomingJobRow[];
}

export async function getRecentJobs(
  automationId: string,
  limit = 50
): Promise<ScheduledJobRow[]> {
  const rows = await getDb()
    .select()
    .from(scheduledJobs)
    .where(eq(scheduledJobs.automationId, automationId))
    .orderBy(desc(scheduledJobs.updatedAt))
    .limit(limit);
  return rows as ScheduledJobRow[];
}
