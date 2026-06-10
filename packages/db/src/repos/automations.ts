import { eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { automations } from "../schema.ts";

export interface AutomationRow {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  pausedUntil: Date | null;
  updatedAt: Date;
}

/** Insert a row for this automation if missing; never overwrite stored config/enabled. */
export async function ensureAutomationRow(args: {
  id: string;
  name: string;
  defaultConfig: Record<string, unknown>;
}): Promise<void> {
  await getDb()
    .insert(automations)
    .values({
      id: args.id,
      name: args.name,
      enabled: false,
      config: args.defaultConfig,
    })
    .onConflictDoNothing();
}

export async function getAutomationRow(id: string): Promise<AutomationRow | null> {
  const [row] = await getDb()
    .select()
    .from(automations)
    .where(eq(automations.id, id))
    .limit(1);
  return (row as AutomationRow | undefined) ?? null;
}

export async function listAutomationRows(): Promise<AutomationRow[]> {
  const rows = await getDb().select().from(automations);
  return rows as AutomationRow[];
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  await getDb()
    .update(automations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automations.id, id));
}

export async function updateAutomationConfig(
  id: string,
  patch: Record<string, unknown>
): Promise<AutomationRow | null> {
  const current = await getAutomationRow(id);
  if (!current) return null;
  const merged = { ...current.config, ...patch };
  await getDb()
    .update(automations)
    .set({ config: merged, updatedAt: new Date() })
    .where(eq(automations.id, id));
  return { ...current, config: merged };
}
