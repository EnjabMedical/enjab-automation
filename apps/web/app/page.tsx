export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <h1 className="text-3xl font-semibold tracking-tight">Enjab Automations</h1>
      <p className="mt-3 text-sm text-slate-600">
        Platform scaffold — Phase 0. The dashboard, inbox, and rating automation will land in
        Phases 1–5.
      </p>
      <div className="mt-8 rounded border border-slate-200 bg-white p-4 text-sm">
        <div className="font-medium text-slate-700">Health</div>
        <div className="mt-1 text-slate-500">
          API:{" "}
          <a className="underline" href="/api/health">
            /api/health
          </a>
        </div>
      </div>
    </main>
  );
}
