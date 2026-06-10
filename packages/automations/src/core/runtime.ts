import type { AutomationDef, Filter, FilterResult, FireResult } from "./types.ts";

export interface FilterRunResult {
  passed: boolean;
  failed?: { filterId: string; reason?: string };
  evaluated: { filterId: string; pass: boolean; reason?: string }[];
}

export async function runFilters<Ctx>(
  filters: Filter<Ctx>[],
  ctx: Ctx
): Promise<FilterRunResult> {
  const evaluated: FilterRunResult["evaluated"] = [];
  for (const f of filters) {
    const r: FilterResult = await f.evaluate(ctx);
    evaluated.push({ filterId: f.id, pass: r.pass, reason: r.reason });
    if (!r.pass) {
      return { passed: false, failed: { filterId: f.id, reason: r.reason }, evaluated };
    }
  }
  return { passed: true, evaluated };
}

export interface ProcessJobOutcome {
  status: FireResult["status"];
  reason?: string;
  message?: FireResult["message"];
  filterTrace: FilterRunResult["evaluated"];
}

export async function processAutomationJob<C, F>(
  def: AutomationDef<C, F>,
  config: C,
  targetKey: string,
  now: Date = new Date()
): Promise<ProcessJobOutcome> {
  const ctx = await def.loadFireContext({ config, targetKey, now });
  if (!ctx) {
    return {
      status: "skipped",
      reason: "context_missing",
      filterTrace: [],
    };
  }

  const filtered = await runFilters(def.filters, ctx);
  if (!filtered.passed) {
    const f = filtered.failed!;
    return {
      status: "skipped",
      reason: `${f.filterId}: ${f.reason ?? ""}`.trim(),
      filterTrace: filtered.evaluated,
    };
  }

  try {
    const result = await def.fire(ctx);
    return {
      status: result.status,
      reason: result.reason,
      message: result.message ?? null,
      filterTrace: filtered.evaluated,
    };
  } catch (e) {
    return {
      status: "failed",
      reason: String((e as Error).message ?? e),
      filterTrace: filtered.evaluated,
    };
  }
}
