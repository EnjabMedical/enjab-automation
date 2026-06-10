import { WaClient } from "./client.ts";

let _client: WaClient | null = null;

/** Process-singleton WaClient — uses env vars: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_GRAPH_VERSION. */
export function getWaClient(): WaClient {
  if (_client) return _client;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const accessToken = process.env.WA_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("WA_PHONE_NUMBER_ID and WA_ACCESS_TOKEN must be set");
  }
  _client = new WaClient({
    phoneNumberId,
    accessToken,
    graphVersion: process.env.WA_GRAPH_VERSION ?? "v22.0",
  });
  return _client;
}

export { WaClient };
export type { WaClientConfig, SendTemplateInput, SendTemplateResult } from "./client.ts";

export { verifyWebhookSignature, parseWebhookEvent } from "./webhook.ts";
export type { WaWebhookEvent, InboundMessage, StatusUpdate } from "./webhook.ts";
