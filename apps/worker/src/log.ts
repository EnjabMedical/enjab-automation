type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = (process.env.LOG_LEVEL ?? "info") as Level;

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  if (order[level] < order[minLevel]) return;
  const ts = new Date().toISOString();
  const e = extra === undefined ? "" : " " + JSON.stringify(extra);
  console.log(`${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${e}`);
}

export function logger(scope: string) {
  return {
    debug: (m: string, extra?: unknown) => emit("debug", scope, m, extra),
    info: (m: string, extra?: unknown) => emit("info", scope, m, extra),
    warn: (m: string, extra?: unknown) => emit("warn", scope, m, extra),
    error: (m: string, extra?: unknown) => emit("error", scope, m, extra),
  };
}
