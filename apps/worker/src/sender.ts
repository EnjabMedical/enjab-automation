import { logger } from "./log.ts";

const log = logger("sender");

// Phase 3 will fill this in: BullMQ Worker that claims due jobs, re-evaluates
// filters, sends WhatsApp via Meta Cloud API, records into messages table.
export async function startSender(): Promise<void> {
  log.info("ready (stub — Phase 3 will implement WhatsApp sender)");
}
