import Link from "next/link";
import { listAutomationRows } from "@enjab/db";
import { setAutomationEnabledAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const rows = await listAutomationRows();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each automation is a self-contained module — its own config, dashboard pages,
          and message types. Toggle one off here and its entire flow stops.
        </p>
      </div>

      <div className="rounded border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400">
            No automations registered. (Worker bootstrap inserts them on startup.)
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link
                    href={`/automations/${a.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {a.name}
                  </Link>
                  <div className="mt-0.5 font-mono text-xs text-slate-500">{a.id}</div>
                </div>
                <div className="flex items-center gap-3">
                  {(a.config as { dryRun?: boolean }).dryRun ? (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      dry-run
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      live
                    </span>
                  )}
                  <form action={setAutomationEnabledAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="enabled" value={a.enabled ? "off" : "on"} />
                    <button
                      type="submit"
                      className={`rounded px-3 py-1 text-sm font-medium ${
                        a.enabled
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      }`}
                    >
                      {a.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
