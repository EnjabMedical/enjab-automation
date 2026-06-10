import type { AutomationDef } from "./types.ts";

const _registry = new Map<string, AutomationDef<any, any>>();

export function registerAutomation<C, F>(def: AutomationDef<C, F>): void {
  if (_registry.has(def.id)) {
    throw new Error(`automation already registered: ${def.id}`);
  }
  _registry.set(def.id, def);
}

export function getAutomation(id: string): AutomationDef<any, any> | undefined {
  return _registry.get(id);
}

export function listAutomations(): AutomationDef<any, any>[] {
  return [..._registry.values()];
}

export function clearRegistry(): void {
  _registry.clear();
}
