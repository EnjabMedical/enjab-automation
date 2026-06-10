import { countOpenTickets, getAutomationRow } from "@enjab/db";
import { mergeRatingConfig, type RatingConfig } from "@enjab/automations";
import { RatingTabs } from "@/components/RatingTabs";
import { updateRatingConfigAction } from "../actions";

export const dynamic = "force-dynamic";

const MODES: { value: RatingConfig["mode"]; label: string; hint: string }[] = [
  { value: "a1", label: "A1 — 5-star buttons", hint: "★★★★★ … ★ quick-reply buttons" },
  { value: "a2", label: "A2 — Great / Good / Bad", hint: "3 quick-reply buttons" },
];

export default async function RatingSettingsPage() {
  const [row, openCount] = await Promise.all([getAutomationRow("rating"), countOpenTickets()]);
  if (!row) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-slate-600">Rating automation not registered yet.</p>
      </main>
    );
  }
  const config = mergeRatingConfig(row.config as Partial<RatingConfig>);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rating Automation</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sends a rating message ~{config.delayMinutes} min after reception opens an OP bill.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              row.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {row.enabled ? "Enabled" : "Disabled"}
          </span>
          {config.dryRun && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              dry-run
            </span>
          )}
        </div>
      </div>

      <div className="mb-6">
        <RatingTabs active="settings" openTicketCount={openCount} />
      </div>

      <form action={updateRatingConfigAction} className="space-y-6">
        <Section label="Outbound mode">
          <div className="space-y-2">
            {MODES.map((m) => (
              <label key={m.value} className="flex items-start gap-3 rounded border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name="mode"
                  value={m.value}
                  defaultChecked={config.mode === m.value}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">{m.label}</div>
                  <div className="text-xs text-slate-500">{m.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        <Section label="Behavior">
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="dryRun"
                defaultChecked={config.dryRun}
              />
              <span className="text-sm text-slate-700">
                Dry-run (build messages, don't send via WhatsApp)
              </span>
            </label>

            <Field label="Delay after bill open (minutes)" hint="Default: 60">
              <input
                type="number"
                name="delayMinutes"
                defaultValue={config.delayMinutes}
                min={0}
                className="w-32"
              />
            </Field>

            <Field label="Max age (hours)" hint="Skip if bill is older than this on fire">
              <input
                type="number"
                name="maxAgeHours"
                defaultValue={config.maxAgeHours}
                min={1}
                className="w-32"
              />
            </Field>

            <Field label="Low-rating threshold (★)" hint="≤ this score → concern-area prompt + triage ticket">
              <input
                type="number"
                name="lowRatingThreshold"
                defaultValue={config.lowRatingThreshold}
                min={1}
                max={5}
                className="w-32"
              />
            </Field>
          </div>
        </Section>

        <Section label="Follow-up content">
          <Field label="Google Reviews URL" hint="Embedded in the rating_thanks_high_* template's URL button">
            <input
              type="url"
              name="googleReviewUrl"
              defaultValue={config.googleReviewUrl}
              className="w-full"
            />
          </Field>
        </Section>

        <div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Save changes
          </button>
        </div>
      </form>
    </main>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-slate-200 bg-white p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="ml-2 text-xs text-slate-500">{hint}</span>}
      <div className="mt-1 [&_input]:rounded [&_input]:border [&_input]:border-slate-300 [&_input]:px-2 [&_input]:py-1 [&_input]:text-sm [&_textarea]:rounded [&_textarea]:border [&_textarea]:border-slate-300 [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:text-sm">
        {children}
      </div>
    </label>
  );
}
