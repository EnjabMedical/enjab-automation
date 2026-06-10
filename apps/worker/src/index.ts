import { getClient, closeDb } from "@enjab/db";
import { getRedis } from "./redis.ts";
import { logger } from "./log.ts";
import { startPoller, stopPoller } from "./poller.ts";
import { startScheduler, stopScheduler } from "./scheduler.ts";
import { startSender } from "./sender.ts";

const log = logger("worker");

async function main() {
  log.info("booting", { node: process.version, tz: process.env.TZ });

  // Verify Postgres
  const sql = getClient();
  const [{ ok }] = await sql`select 1 as ok`;
  if (ok !== 1) throw new Error("postgres self-check failed");
  log.info("postgres ok");

  // Verify Redis
  const redis = getRedis();
  const pong = await redis.ping();
  if (pong !== "PONG") throw new Error(`redis self-check failed: ${pong}`);
  log.info("redis ok");

  // Start the three loops. startScheduler must run before startPoller so that
  // post-poll runScheduler() finds the queue ready.
  await startScheduler();
  await Promise.all([startPoller(), startSender()]);

  log.info("worker up — Ctrl-C to stop");
  // Stay alive so the loops keep running.
  await new Promise<void>((resolve) => {
    const shutdown = (sig: string) => async () => {
      log.info(`shutting down on ${sig}`);
      await stopPoller();
      await stopScheduler();
      await redis.quit();
      await closeDb();
      resolve();
      process.exit(0);
    };
    process.once("SIGINT", shutdown("SIGINT"));
    process.once("SIGTERM", shutdown("SIGTERM"));
  });
}

main().catch((e) => {
  log.error("fatal", { err: String(e?.stack ?? e) });
  process.exit(1);
});
