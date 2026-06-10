import { NextResponse } from "next/server";
import { getClient } from "@enjab/db";

export async function GET() {
  const checks: Record<string, "ok" | string> = { web: "ok" };

  try {
    const sql = getClient();
    const [{ ok }] = await sql`select 1 as ok`;
    checks.postgres = ok === 1 ? "ok" : `unexpected: ${ok}`;
  } catch (e) {
    checks.postgres = `error: ${(e as Error).message}`;
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ status: allOk ? "ok" : "degraded", checks }, { status: allOk ? 200 : 503 });
}
