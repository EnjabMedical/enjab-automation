import { InstaHmsClient } from "@enjab/hms-client";
import { logger } from "./log.ts";

const log = logger("hms");

let _client: InstaHmsClient | null = null;

/**
 * Process-singleton InstaHmsClient. The first call performs login(); subsequent
 * calls return the same instance, which auto-relogs in on any 302→loginForm.
 */
export async function getHmsClient(): Promise<InstaHmsClient> {
  if (_client) return _client;
  const required = ["INSTAHMS_BASE_URL", "INSTAHMS_HOSPITAL", "INSTAHMS_USER_ID", "INSTAHMS_PASSWORD"];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`${k} is not set`);
  }
  const c = new InstaHmsClient({
    baseUrl: process.env.INSTAHMS_BASE_URL!,
    hospital: process.env.INSTAHMS_HOSPITAL!,
    userId: process.env.INSTAHMS_USER_ID!,
    password: process.env.INSTAHMS_PASSWORD!,
  });
  const r = await c.login();
  if (!r.ok) throw new Error(`HMS login failed: ${r.reason}`);
  log.info("HMS login ok", { user: process.env.INSTAHMS_USER_ID });
  _client = c;
  return c;
}
