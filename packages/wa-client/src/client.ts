export interface WaClientConfig {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
}

export interface TemplateBodyParam {
  type: "text";
  text: string;
}

export interface SendTemplateInput {
  to: string;                     // E.164 with + (e.g. +971585808996)
  templateName: string;
  language: string;               // e.g. "en"
  bodyParams?: string[];          // ordered text params for the body
  /** Per-button positional URL parameter (only for templates with a {{}} in the URL). */
  urlButtonParam?: string;
}

export interface SendTemplateResult {
  waMsgId: string;       // e.g. wamid.HBgMOTcxNTg1ODA4OTk2FQIAERgSMjQ...
  contactWaId: string;   // patient's wa_id (without +)
  raw: unknown;
}

export class WaClient {
  constructor(private readonly cfg: WaClientConfig) {}

  private url(path: string): string {
    const v = this.cfg.graphVersion ?? "v22.0";
    return `https://graph.facebook.com/${v}${path}`;
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
    const components: Array<Record<string, unknown>> = [];

    if (input.bodyParams && input.bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: input.bodyParams.map((text) => ({ type: "text", text })),
      });
    }
    if (input.urlButtonParam) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: input.urlButtonParam }],
      });
    }

    const body = {
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language },
        components,
      },
    };

    const res = await fetch(this.url(`/${this.cfg.phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: number } }).error;
      const detail = err?.message ?? JSON.stringify(json);
      throw new Error(`WA sendTemplate ${res.status}: ${detail}`);
    }

    const messages = (json as { messages?: Array<{ id: string }> }).messages ?? [];
    const contacts = (json as { contacts?: Array<{ wa_id: string }> }).contacts ?? [];
    return {
      waMsgId: messages[0]?.id ?? "",
      contactWaId: contacts[0]?.wa_id ?? "",
      raw: json,
    };
  }

  /** Send a free-form text message — only valid inside the 24h conversation window. */
  async sendText(to: string, body: string): Promise<SendTemplateResult> {
    const res = await fetch(this.url(`/${this.cfg.phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json as { error?: { message?: string } }).error;
      throw new Error(`WA sendText ${res.status}: ${err?.message ?? JSON.stringify(json)}`);
    }
    const messages = (json as { messages?: Array<{ id: string }> }).messages ?? [];
    const contacts = (json as { contacts?: Array<{ wa_id: string }> }).contacts ?? [];
    return {
      waMsgId: messages[0]?.id ?? "",
      contactWaId: contacts[0]?.wa_id ?? "",
      raw: json,
    };
  }
}
