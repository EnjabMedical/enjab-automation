import { Queue, Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import {
  bootstrapAutomations,
  listAutomations,
  processAutomationJob,
} from "@enjab/automations";
import {
  ensureAutomationRow,
  getAutomationRow,
  tryInsertScheduledJob,
  claimJob,
  completeJob,
  recordEvent,
} from "@enjab/db";
import { getRedis } from "./redis.ts";
import { logger } from "./log.ts";

const log = logger("scheduler");

const QUEUE = "automations";

let queue: Queue | null = null;
let worker: Worker | null = null;

/**
 * Boot-time setup for the automation engine:
 * 1. Register every built-in automation in the in-memory registry.
 * 2. Ensure each has a row in the `automations` table (idempotent — never overwrites
 *    config or enabled state).
 * 3. Spin up BullMQ queue + worker for the "automations" jobs (delayed fires).
 */
export async function startScheduler(): Promise<void> {
  bootstrapAutomations();

  for (const def of listAutomations()) {
    await ensureAutomationRow({
      id: def.id,
      name: def.name,
      defaultConfig: def.defaultConfig as Record<string, unknown>,
    });
  }

  const connection = getRedis();
  queue = new Queue(QUEUE, { connection });

  worker = new Worker(
    QUEUE,
    async (job: Job) => {
      const { scheduledJobId, automationId, targetKey } = job.data as {
        scheduledJobId: string;
        automationId: string;
        targetKey: string;
      };
      return processFireJob(scheduledJobId, automationId, targetKey);
    },
    { connection, concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    log.error("automations job failed", { id: job?.id, err: String(err) });
  });

  log.info(`ready (${listAutomations().length} automations registered)`);
}

export async function stopScheduler(): Promise<void> {
  await worker?.close();
  await queue?.close();
}

/**
 * Per-cycle scheduling pass. For every enabled automation, pull candidates,
 * persist `scheduled_jobs` rows (UNIQUE (automation_id, target_key) makes
 * this idempotent), and enqueue delayed BullMQ jobs.
 *
 * Called after each bill-poll cycle.
 */
export async function runScheduler(): Promise<void> {
  if (!queue) return;
  const now = new Date();

  for (const def of listAutomations()) {
    const row = await getAutomationRow(def.id);
    if (!row || !row.enabled) continue;

    const config = { ...def.defaultConfig, ...row.config };
    let candidates: { targetKey: string; fireAt: Date }[];
    try {
      candidates = await def.findCandidates({ config, now });
    } catch (e) {
      log.warn(`${def.id}: findCandidates failed`, { err: String((e as Error).message ?? e) });
      continue;
    }

    let scheduled = 0;
    for (const c of candidates) {
      const id = randomUUID();
      const inserted = await tryInsertScheduledJob({
        id,
        automationId: def.id,
        targetKey: c.targetKey,
        fireAt: c.fireAt,
      });
      if (!inserted) continue;

      const delayMs = Math.max(0, c.fireAt.getTime() - now.getTime());
      await queue.add(
        def.id,
        { scheduledJobId: id, automationId: def.id, targetKey: c.targetKey },
        {
          delay: delayMs,
          jobId: `${def.id}--${c.targetKey}`,
          removeOnComplete: 200,
          removeOnFail: 100,
        }
      );
      scheduled++;

      await recordEvent({
        actor: def.id,
        action: `${def.id}.scheduled`,
        target: c.targetKey,
        meta: { fireAt: c.fireAt.toISOString() },
      });
    }

    if (scheduled > 0) {
      log.info(`${def.id}: scheduled ${scheduled} new (${candidates.length} candidates)`);
    }
  }
}

async function processFireJob(
  scheduledJobId: string,
  automationId: string,
  targetKey: string
): Promise<void> {
  const claimed = await claimJob(scheduledJobId);
  if (!claimed) {
    log.warn(`already claimed or completed: ${scheduledJobId}`);
    return;
  }

  const def = listAutomations().find((a) => a.id === automationId);
  if (!def) {
    await completeJob(scheduledJobId, "failed", `unknown automation: ${automationId}`);
    return;
  }
  const row = await getAutomationRow(automationId);
  if (!row) {
    await completeJob(scheduledJobId, "failed", `no automations row: ${automationId}`);
    return;
  }
  const config = { ...def.defaultConfig, ...row.config };

  const outcome = await processAutomationJob(def, config, targetKey, new Date());

  // Translate outcome.status to a scheduled_jobs.status enum value.
  const final =
    outcome.status === "sent" || outcome.status === "dry_run" || outcome.status === "skipped"
      ? "completed"
      : outcome.status === "expired"
      ? "expired"
      : "failed";

  await completeJob(scheduledJobId, final, outcome.reason ?? null);

  await recordEvent({
    actor: automationId,
    action: `${automationId}.${outcome.status}`,
    target: targetKey,
    meta: {
      reason: outcome.reason,
      message: outcome.message,
      filterTrace: outcome.filterTrace,
    },
  });

  log.info(
    `${automationId} ${targetKey}: ${outcome.status}${outcome.reason ? ` — ${outcome.reason}` : ""}`
  );
}
