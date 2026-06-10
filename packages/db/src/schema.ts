import {
  pgTable, pgEnum,
  text, integer, boolean, jsonb, timestamp,
  uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────

export const visitType = pgEnum("visit_type", ["o", "i"]);
export const messageDirection = pgEnum("message_direction", ["in", "out"]);
export const messageStatus = pgEnum("message_status", [
  "queued", "sent", "delivered", "read", "failed",
]);
export const channel = pgEnum("channel", ["whatsapp", "sms", "email", "internal"]);
export const optOutSource = pgEnum("opt_out_source", ["stop", "meta_block", "manual"]);
export const jobStatus = pgEnum("job_status", [
  "pending", "running", "completed", "failed", "expired", "cancelled",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "new", "claimed", "in_progress", "completed", "dismissed",
]);
export const ratingMode = pgEnum("rating_mode", ["a1", "a2", "b"]);
export const userRole = pgEnum("user_role", ["admin", "staff"]);
export const threadStatus = pgEnum("thread_status", ["open", "closed"]);

// ─── Patients & bills (mirrored from HMS) ─────────────────────────────────

export const patients = pgTable("patients", {
  mrNo: text("mr_no").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),                                // E.164 or null
  /** "en" | "ar" — derived from raw_json.nationality_name. Null until detected. */
  language: text("language"),
  rawJson: jsonb("raw_json"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bills = pgTable(
  "bills",
  {
    billNo: text("bill_no").primaryKey(),
    mrNo: text("mr_no").notNull().references(() => patients.mrNo, { onDelete: "restrict" }),
    visitId: text("visit_id"),
    visitType: visitType("visit_type").notNull(),
    openDate: timestamp("open_date", { withTimezone: true }).notNull(),
    billStatus: text("bill_status"),
    rawJson: jsonb("raw_json"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("bills_mr_no_idx").on(t.mrNo),
    index("bills_open_date_idx").on(t.openDate),
  ]
);

// ─── Automation registry ──────────────────────────────────────────────────

export const automations = pgTable("automations", {
  id: text("id").primaryKey(),                         // e.g. "rating"
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default({}),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Scheduled jobs (durable record alongside BullMQ) ─────────────────────

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),                       // ULID
    automationId: text("automation_id").notNull().references(() => automations.id),
    targetKey: text("target_key").notNull(),           // e.g. bill_no
    fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("scheduled_jobs_automation_target_uq").on(t.automationId, t.targetKey),
    index("scheduled_jobs_fire_at_idx").on(t.fireAt),
    index("scheduled_jobs_status_idx").on(t.status),
  ]
);

// ─── Messages (every send + every webhook event) ──────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),                       // ULID
    automationId: text("automation_id").references(() => automations.id),
    targetKey: text("target_key"),
    mrNo: text("mr_no").references(() => patients.mrNo),
    direction: messageDirection("direction").notNull(),
    channel: channel("channel").notNull(),
    waMsgId: text("wa_msg_id"),                        // Meta's wamid
    templateName: text("template_name"),
    status: messageStatus("status").notNull().default("queued"),
    statusTs: timestamp("status_ts", { withTimezone: true }).defaultNow().notNull(),
    body: jsonb("body").notNull().default({}),         // structured: { text, buttons, ... }
    error: text("error"),
    raw: jsonb("raw"),                                 // raw Meta payload
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("messages_wa_msg_id_uq").on(t.waMsgId),
    index("messages_mr_no_idx").on(t.mrNo),
    index("messages_target_key_idx").on(t.targetKey),
  ]
);

// ─── Inbox threads (one per patient) ──────────────────────────────────────

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),                       // ULID
    mrNo: text("mr_no").notNull().references(() => patients.mrNo).unique(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    unreadCount: integer("unread_count").notNull().default(0),
    claimedBy: text("claimed_by").references(() => users.id),
    status: threadStatus("status").notNull().default("open"),
  },
  (t) => [index("threads_last_message_idx").on(t.lastMessageAt)]
);

// ─── Opt-outs (platform-side block list) ──────────────────────────────────

export const optOuts = pgTable("opt_outs", {
  phone: text("phone").primaryKey(),
  source: optOutSource("source").notNull(),
  reason: text("reason"),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  actor: text("actor"),                                // user id, or "system"
});

// ─── Ratings & low-rating tickets (rating-automation-scoped) ──────────────

export const ratings = pgTable(
  "ratings",
  {
    id: text("id").primaryKey(),                       // ULID
    billNo: text("bill_no").notNull().references(() => bills.billNo).unique(),
    score: integer("score").notNull(),                 // 1..5
    comment: text("comment"),
    mode: ratingMode("mode").notNull(),
    /**
     * One of the 6 concern-area buttons the patient picked after a low rating
     * (Reception, Doctor, Nursing, Billing, Laser, Other). Null until they tap.
     * Stored as the canonical English slug regardless of which language template
     * they replied to.
     */
    concernArea: text("concern_area"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ratings_score_idx").on(t.score)]
);

export const ratingTickets = pgTable("rating_tickets", {
  id: text("id").primaryKey(),
  ratingId: text("rating_id").notNull().references(() => ratings.id).unique(),
  status: ticketStatus("status").notNull().default("new"),
  claimedBy: text("claimed_by").references(() => users.id),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Audit log (every state transition) ───────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),                       // ULID
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    actor: text("actor").notNull(),                    // user id, automation id, or "system"
    action: text("action").notNull(),                  // e.g. "rating.scheduled"
    target: text("target"),                            // e.g. bill_no, ticket_id
    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [index("events_ts_idx").on(t.ts), index("events_target_idx").on(t.target)]
);

// ─── Users & sessions (dashboard auth) ────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),                         // ULID
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRole("role").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  ua: text("ua"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Magic-link login challenges (issued, then redeemed for a session)
export const loginTokens = pgTable("login_tokens", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
});
