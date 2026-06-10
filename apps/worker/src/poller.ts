import { Queue, Worker, type Job } from "bullmq";
import { getRedis } from "./redis.ts";
import { logger } from "./log.ts";
import { pollBills } from "./sync/bills.ts";

const log = logger("poller");

const QUEUE = "polls";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? `${5 * 60 * 1000}`, 10);

let queue: Queue | null = null;
let worker: Worker | null = null;

export async function startPoller(): Promise<void> {
  const connection = getRedis();

  queue = new Queue(QUEUE, { connection });

  worker = new Worker(
    QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case "poll-bills":
          return pollBills();
        default:
          log.warn(`unknown job name: ${job.name}`);
      }
    },
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    log.error(`job ${job?.name ?? "?"} failed`, { id: job?.id, err: String(err) });
  });

  // Recurring scheduler — runs every POLL_INTERVAL_MS forever.
  await queue.upsertJobScheduler(
    "poll-bills-recurring",
    { every: POLL_INTERVAL_MS },
    { name: "poll-bills", data: {}, opts: { removeOnComplete: 100, removeOnFail: 50 } }
  );

  // Kick one off immediately so the dashboard isn't empty until the next tick.
  await queue.add(
    "poll-bills",
    {},
    { jobId: `boot-${Date.now()}`, removeOnComplete: 100, removeOnFail: 50 }
  );

  log.info(`ready (interval ${Math.round(POLL_INTERVAL_MS / 1000)}s)`);
}

export async function stopPoller(): Promise<void> {
  await worker?.close();
  await queue?.close();
}
