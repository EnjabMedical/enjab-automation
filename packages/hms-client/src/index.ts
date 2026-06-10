import { InstaHmsClient } from "./instahms.ts";

export { InstaHmsClient } from "./instahms.ts";
export type { LoginResult, InstaHmsConfig, PatientDetails } from "./instahms.ts";

export { fetchOpenBills, parseBillList, parseHmsDate } from "./bills.ts";
export type {
  BillRow,
  BillStatusCode,
  VisitType,
  FetchOpenBillsOptions,
} from "./bills.ts";

export { fetchPatient } from "./patient.ts";
export type { PatientRow } from "./patient.ts";

let _client: InstaHmsClient | null = null;
let _loginPromise: Promise<InstaHmsClient> | null = null;

/**
 * Process-singleton InstaHmsClient — env-driven, logs in on first call,
 * auto-relogs in on session-dead (handled inside the client itself).
 */
export async function getHmsClient(): Promise<InstaHmsClient> {
  if (_client) return _client;
  if (_loginPromise) return _loginPromise;

  _loginPromise = (async () => {
    const required = [
      "INSTAHMS_BASE_URL",
      "INSTAHMS_HOSPITAL",
      "INSTAHMS_USER_ID",
      "INSTAHMS_PASSWORD",
    ];
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
    _client = c;
    return c;
  })();
  return _loginPromise;
}
