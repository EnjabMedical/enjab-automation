import "node:process";
import { readFileSync } from "node:fs";
import { InstaHmsClient } from "./instahms.ts";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {}
}

loadEnv();

const baseUrl = process.env.INSTAHMS_BASE_URL ?? "http://192.168.1.220/instahms";
const hospital = process.env.INSTAHMS_HOSPITAL ?? "enjab";
const userId = process.env.INSTAHMS_USER_ID;
const password = process.env.INSTAHMS_PASSWORD;

if (!userId || !password) {
  console.error("Set INSTAHMS_USER_ID and INSTAHMS_PASSWORD in .env (or env vars).");
  process.exit(1);
}

const client = new InstaHmsClient({ baseUrl, hospital, userId, password });
const result = await client.login();

if (result.ok) {
  console.log("✓ login ok");
  console.log("  session cookie:", result.sessionCookie);
  console.log("  landing url:   ", result.landingUrl);

  // Sanity check: hit home.do with the session and confirm it's authenticated.
  const home = await client.get("/home.do");
  const text = await home.text();
  const isLoginPage = /loginForm\.do|loginStatus\s*=/i.test(text);
  console.log("  home.do status:", home.status, isLoginPage ? "(redirected to login — session NOT valid)" : "(authenticated ✓)");
} else {
  console.error("✗ login failed:", result.reason, "(http", result.status + ")");
  if (result.reason === "mfa_required") {
    console.error("  → MFA challenge present. Submit OTP to /MultiFactorAuthentication.do");
  }
  process.exit(2);
}
