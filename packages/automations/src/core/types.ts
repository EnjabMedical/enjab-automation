export interface AutomationDef<Config, FireCtx> {
  /** Stable identifier — used as the automations.id row, BullMQ job name, URL slug. */
  id: string;
  name: string;
  description: string;
  defaultConfig: Config;

  /** Periodic scan: returns target keys + computed fire-at to be scheduled. */
  findCandidates(args: {
    config: Config;
    now: Date;
  }): Promise<ScheduleCandidate[]>;

  /** Fetch everything filters + fire need at fire time. Returns null if target is gone. */
  loadFireContext(args: {
    config: Config;
    targetKey: string;
    now: Date;
  }): Promise<FireCtx | null>;

  /** Filter chain — re-evaluated at fire time. First skip wins. */
  filters: Filter<FireCtx>[];

  /** Build + (in non-dry-run) send the message. */
  fire(ctx: FireCtx): Promise<FireResult>;
}

export interface ScheduleCandidate {
  targetKey: string;
  fireAt: Date;
}

export interface Filter<Ctx> {
  id: string;
  evaluate(ctx: Ctx): FilterResult | Promise<FilterResult>;
}

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export type FireStatus = "sent" | "dry_run" | "skipped" | "expired" | "failed";

export interface BuiltMessage {
  templateName: string;
  to: string;
  params: Record<string, unknown>;
  preview: string;
}

export interface FireResult {
  status: FireStatus;
  reason?: string;
  message?: BuiltMessage | null;
}
