import { CookieJar } from "tough-cookie";
import { fetch as undiciFetch } from "undici";

export type LoginResult =
  | { ok: true; sessionCookie: string; landingUrl: string }
  | { ok: false; reason: "auth_failure" | "mfa_required" | "unknown"; status: number; body: string };

export interface InstaHmsConfig {
  baseUrl: string;
  hospital: string;
  userId: string;
  password: string;
}

export class InstaHmsClient {
  readonly baseUrl: string;
  readonly hospital: string;
  readonly userId: string;
  readonly password: string;
  readonly jar = new CookieJar();

  constructor(cfg: InstaHmsConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.hospital = cfg.hospital;
    this.userId = cfg.userId;
    this.password = cfg.password;
  }

  private async request(
    path: string,
    init: { method?: string; headers?: HeadersInit; body?: BodyInit; redirect?: "follow" | "manual"; timeoutMs?: number; retries?: number } = {}
  ) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const timeoutMs = init.timeoutMs ?? 30_000;
    const maxAttempts = (init.retries ?? 2) + 1;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const cookieHeader = await this.jar.getCookieString(url);
      const headers = new Headers(init.headers ?? {});
      if (cookieHeader) headers.set("Cookie", cookieHeader);
      if (!headers.has("User-Agent")) {
        headers.set("User-Agent", "Mozilla/5.0 (instahms-client/0.1) AppleWebKit/537.36");
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await undiciFetch(url, {
          method: init.method,
          headers,
          body: init.body,
          redirect: init.redirect ?? "manual",
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const setCookies = res.headers.getSetCookie?.() ?? [];
        for (const c of setCookies) await this.jar.setCookie(c, url);
        return res;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        if (attempt < maxAttempts) {
          const backoff = 250 * 2 ** (attempt - 1);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  async login(): Promise<LoginResult> {
    // 1. Prime the SESSION cookie.
    const formRes = await this.request("/loginForm.do");
    if (formRes.status !== 200) {
      return { ok: false, reason: "unknown", status: formRes.status, body: await formRes.text() };
    }

    // 2. Submit credentials.
    const body = new URLSearchParams({
      hospital: this.hospital,
      userId: this.userId,
      password: this.password,
      hashFragment: "",
    });

    const loginRes = await this.request("/login.do", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    // Spring forwards on success → 302 to /home.do (or MFA page).
    if (loginRes.status >= 300 && loginRes.status < 400) {
      const location = loginRes.headers.get("location") ?? "";
      // Walk the redirect chain so the final landing-page cookies stick.
      const landing = await this.followRedirects(location);
      const session = await this.getSessionCookie();
      if (!session) return { ok: false, reason: "unknown", status: landing.status, body: "" };
      if (/MultiFactorAuthentication|mfaForm|otp/i.test(landing.body)) {
        return { ok: false, reason: "mfa_required", status: landing.status, body: landing.body };
      }
      return { ok: true, sessionCookie: session, landingUrl: landing.url };
    }

    // 200 on the same page = auth failure (loginStatus injected into HTML).
    const text = await loginRes.text();
    if (/loginStatus\s*=\s*'auth_failure'/i.test(text)) {
      return { ok: false, reason: "auth_failure", status: loginRes.status, body: text };
    }
    if (/MultiFactorAuthentication|mfaForm/i.test(text)) {
      return { ok: false, reason: "mfa_required", status: loginRes.status, body: text };
    }
    return { ok: false, reason: "unknown", status: loginRes.status, body: text };
  }

  private async followRedirects(startPath: string, maxHops = 5) {
    let url = startPath.startsWith("http") ? startPath : `${this.baseUrl}${startPath.startsWith("/") ? startPath : `/${startPath}`}`;
    let body = "";
    let status = 0;
    for (let i = 0; i < maxHops; i++) {
      const res = await this.request(url);
      status = res.status;
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        url = loc.startsWith("http") ? loc : `${this.baseUrl}${loc.startsWith("/") ? loc : `/${loc}`}`;
        continue;
      }
      body = await res.text();
      break;
    }
    return { url, body, status };
  }

  async getSessionCookie(): Promise<string | null> {
    // Cookie path is /instahms/ — use trailing slash to satisfy path-match.
    const cookies = await this.jar.getCookies(`${this.baseUrl}/`);
    const session = cookies.find((c) => c.key === "SESSION");
    return session ? `${session.key}=${session.value}` : null;
  }

  /** Re-export the cookie header for ad-hoc fetches. */
  async cookieHeader(url = `${this.baseUrl}/`): Promise<string> {
    return this.jar.getCookieString(url);
  }

  /** Authenticated GET helper — auto re-logs in if session expired. */
  async get(path: string) {
    return this.authedRequest(() => this.request(path), `GET ${path}`);
  }

  /** Authenticated POST helper — auto re-logs in if session expired. */
  async post(path: string, body?: BodyInit, headers: Record<string, string> = {}) {
    return this.authedRequest(
      () => this.request(path, { method: "POST", body, headers }),
      `POST ${path}`
    );
  }

  /** Detect "session dead" responses: 302 → loginForm, or 200 with login HTML. */
  private async isSessionDead(res: Response): Promise<boolean> {
    if (res.status === 302) {
      const loc = res.headers.get("location") ?? "";
      if (/loginForm\.do/i.test(loc)) return true;
    }
    return false;
  }

  /** Run an authenticated request; on session-dead response, re-login once and retry. */
  private async authedRequest(
    fn: () => Promise<Response>,
    op: string
  ): Promise<Response> {
    let res = await fn();
    if (await this.isSessionDead(res)) {
      // Session expired mid-run — silently re-login and retry once.
      const r = await this.login();
      if (!r.ok) throw new Error(`${op}: re-login failed (${r.reason})`);
      res = await fn();
      if (await this.isSessionDead(res)) {
        throw new Error(`${op}: session still dead after re-login`);
      }
    }
    return res;
  }

  /**
   * Fetch full patient detail JSON by MR No.
   * Endpoint: POST /pages/registration/regUtils.do?_method=getPatientDetailsJSON&mrno=<MR>
   * Returned shape (relevant fields only): { patient: { full_name, patient_phone, ... } }
   */
  async getPatientByMrNo(mrNo: string): Promise<PatientDetails> {
    const path = `/pages/registration/regUtils.do?_method=getPatientDetailsJSON&mrno=${encodeURIComponent(mrNo)}`;
    const res = await this.post(path);
    if (res.status !== 200) {
      throw new Error(`getPatientByMrNo(${mrNo}) failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { patient?: Record<string, unknown> };
    if (!json.patient) throw new Error(`getPatientByMrNo(${mrNo}): no patient field`);
    return json.patient as PatientDetails;
  }
}

export interface PatientDetails {
  full_name: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email?: string | null;
  patient_dob?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  visit_type?: string | null;
  // …many more fields available; add as needed.
  [key: string]: unknown;
}
