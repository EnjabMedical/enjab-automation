import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies the X-Hub-Signature-256 header against the raw body. */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader) return false;
  const m = /^sha256=([a-f0-9]+)$/i.exec(signatureHeader);
  if (!m) return false;
  const expectedHex = m[1];
  const computedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (expectedHex.length !== computedHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(computedHex, "hex"));
  } catch {
    return false;
  }
}

export interface WaWebhookEvent {
  inboundMessages: InboundMessage[];
  statuses: StatusUpdate[];
}

export interface InboundMessage {
  from: string;             // E.164 without leading + (e.g. "971585808996")
  waMsgId: string;
  timestamp: number;        // unix seconds
  type:
    | "text"
    | "button"
    | "interactive"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "unknown";
  text?: string;
  buttonPayload?: string;   // template QUICK_REPLY tap value
  buttonText?: string;
  /** For type=interactive: which button/list option the user picked. */
  interactiveTitle?: string;
  interactiveId?: string;
  raw: Record<string, unknown>;
}

export interface StatusUpdate {
  waMsgId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: number;
  recipientId: string;
  errorCode?: number;
  errorTitle?: string;
  errorMessage?: string;
  raw: Record<string, unknown>;
}

export function parseWebhookEvent(payload: unknown): WaWebhookEvent {
  const result: WaWebhookEvent = { inboundMessages: [], statuses: [] };
  if (!isObj(payload) || (payload as Record<string, unknown>).object !== "whatsapp_business_account") {
    return result;
  }

  const entries = ((payload as Record<string, unknown>).entry as Array<Record<string, unknown>>) ?? [];
  for (const entry of entries) {
    const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = (change.value as Record<string, unknown>) ?? {};

      const messages = (value.messages as Array<Record<string, unknown>>) ?? [];
      for (const m of messages) {
        result.inboundMessages.push(parseInboundMessage(m));
      }

      const statuses = (value.statuses as Array<Record<string, unknown>>) ?? [];
      for (const s of statuses) {
        result.statuses.push(parseStatus(s));
      }
    }
  }
  return result;
}

function parseInboundMessage(m: Record<string, unknown>): InboundMessage {
  const t = String(m.type ?? "unknown");
  const allowed = ["text", "button", "interactive", "image", "audio", "video", "document"] as const;
  const type: InboundMessage["type"] = (allowed as readonly string[]).includes(t)
    ? (t as InboundMessage["type"])
    : "unknown";

  // Don't coerce a missing id to "" — empty strings poison the unique index
  // downstream. Pass "" through and let insertMessage normalize to NULL.
  const id = m.id == null ? "" : String(m.id);
  const out: InboundMessage = {
    from: String(m.from ?? ""),
    waMsgId: id,
    timestamp: parseInt(String(m.timestamp ?? "0"), 10),
    type,
    raw: m,
  };

  if (type === "text") {
    out.text = (m.text as { body?: string } | undefined)?.body;
  } else if (type === "button") {
    const b = m.button as { payload?: string; text?: string } | undefined;
    out.buttonPayload = b?.payload;
    out.buttonText = b?.text;
  } else if (type === "interactive") {
    const i = m.interactive as
      | {
          type?: string;
          button_reply?: { id?: string; title?: string };
          list_reply?: { id?: string; title?: string };
        }
      | undefined;
    const reply = i?.button_reply ?? i?.list_reply;
    out.interactiveId = reply?.id;
    out.interactiveTitle = reply?.title;
  }

  return out;
}

function parseStatus(s: Record<string, unknown>): StatusUpdate {
  const errs = s.errors as Array<{ code?: number; title?: string; message?: string }> | undefined;
  return {
    waMsgId: String(s.id ?? ""),
    status: String(s.status ?? "sent") as StatusUpdate["status"],
    timestamp: parseInt(String(s.timestamp ?? "0"), 10),
    recipientId: String(s.recipient_id ?? ""),
    errorCode: errs?.[0]?.code,
    errorTitle: errs?.[0]?.title,
    errorMessage: errs?.[0]?.message,
    raw: s,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
