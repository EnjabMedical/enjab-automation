"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  setAutomationEnabled,
  updateAutomationConfig,
  claimTicket,
  startTicket,
  completeTicket,
  dismissTicket,
  recordEvent,
} from "@enjab/db";

export async function setAutomationEnabledAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "off") === "on";
  if (!id) return;
  await setAutomationEnabled(id, enabled);
  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
}

export async function updateRatingConfigAction(formData: FormData): Promise<void> {
  const patch: Record<string, unknown> = {};

  const mode = formData.get("mode");
  if (mode === "a1" || mode === "a2") patch.mode = mode;

  if (formData.has("dryRun")) {
    patch.dryRun = formData.get("dryRun") === "on";
  }

  const delay = Number(formData.get("delayMinutes"));
  if (Number.isFinite(delay) && delay >= 0) patch.delayMinutes = delay;

  const maxAge = Number(formData.get("maxAgeHours"));
  if (Number.isFinite(maxAge) && maxAge > 0) patch.maxAgeHours = maxAge;

  const threshold = Number(formData.get("lowRatingThreshold"));
  if (Number.isFinite(threshold) && threshold >= 1 && threshold <= 5) {
    patch.lowRatingThreshold = threshold;
  }

  const reviewUrl = formData.get("googleReviewUrl");
  if (typeof reviewUrl === "string" && reviewUrl.length > 0) patch.googleReviewUrl = reviewUrl;

  await updateAutomationConfig("rating", patch);
  revalidatePath("/automations/rating");
}

// ─── Rating ticket lifecycle ──────────────────────────────────────────────
//
// No auth layer exists yet — the staffer types their name into the action form
// and we persist it in events.actor + a "staffName" cookie so the next form
// remembers it. claimedBy on rating_tickets stays NULL until proper auth in
// Phase 6. All transitions are race-safe via status guards inside the repo
// functions; race-losers get a `ticket.<verb>_race_lost` audit row with the
// typed notes attached so nothing the staffer typed is silently dropped.
//
// Cross-origin POSTs are blocked by Next.js server-action origin checks (see
// next.config.ts allowedOrigins) — that's the only thing preventing CSRF
// today. If you remove/widen that config OR convert these to plain route
// handlers, you re-expose unauthenticated actions to the public internet.
// Don't do it without finishing Phase 6 auth first.

/** Reserved actor strings used elsewhere in the audit log — must not collide. */
const RESERVED_ACTOR_NAMES = new Set([
  "system",
  "worker",
  "automation",
  "rating",
  "wa-webhook",
  "hms-sync",
]);
const MAX_ACTOR_NAME_LEN = 80;

/** Reject empty / reserved / oversized actor names; collapse whitespace. */
function normalizeActorName(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  if (collapsed.length > MAX_ACTOR_NAME_LEN) return null;
  if (RESERVED_ACTOR_NAMES.has(collapsed.toLowerCase())) return null;
  return collapsed;
}

async function persistStaffName(name: string): Promise<void> {
  const jar = await cookies();
  jar.set("staffName", name, {
    httpOnly: true, // no client JS reads this — keep it server-only
    secure: true,
    sameSite: "strict",
    path: "/automations/rating/tickets",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });
}

function revalidateTicket(ticketId: string): void {
  revalidatePath("/automations/rating/tickets");
  revalidatePath(`/automations/rating/tickets/${ticketId}`);
}

export async function claimTicketAction(formData: FormData): Promise<void> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const actorName = normalizeActorName(String(formData.get("actorName") ?? ""));
  if (!ticketId || !actorName) return;

  // Persist cookie up-front so a race-loser's name doesn't disappear from the form.
  await persistStaffName(actorName);

  const updated = await claimTicket(ticketId);
  if (!updated) {
    await recordEvent({
      actor: actorName,
      action: "ticket.claim_race_lost",
      target: ticketId,
      meta: {},
    });
  } else {
    await recordEvent({
      actor: actorName,
      action: "ticket.claimed",
      target: ticketId,
      meta: { ratingId: updated.ratingId },
    });
  }
  revalidateTicket(ticketId);
}

export async function startTicketAction(formData: FormData): Promise<void> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const actorName = normalizeActorName(String(formData.get("actorName") ?? ""));
  if (!ticketId || !actorName) return;

  await persistStaffName(actorName);

  const updated = await startTicket(ticketId);
  await recordEvent({
    actor: actorName,
    action: updated ? "ticket.started" : "ticket.start_race_lost",
    target: ticketId,
    meta: updated ? { ratingId: updated.ratingId } : {},
  });
  revalidateTicket(ticketId);
}

export async function completeTicketAction(formData: FormData): Promise<void> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const actorName = normalizeActorName(String(formData.get("actorName") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!ticketId || !actorName || !notes) return;

  await persistStaffName(actorName);

  const updated = await completeTicket({ ticketId, notes });
  await recordEvent({
    actor: actorName,
    action: updated ? "ticket.completed" : "ticket.complete_race_lost",
    target: ticketId,
    // Always keep the typed notes — losing a race shouldn't silently drop a
    // staffer's typed paragraph; they can recover it from the audit log.
    meta: updated ? { ratingId: updated.ratingId, notes } : { attemptedNotes: notes },
  });
  revalidateTicket(ticketId);
}

export async function dismissTicketAction(formData: FormData): Promise<void> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const actorName = normalizeActorName(String(formData.get("actorName") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!ticketId || !actorName || !reason) return;

  await persistStaffName(actorName);

  const updated = await dismissTicket({ ticketId, reason });
  await recordEvent({
    actor: actorName,
    action: updated ? "ticket.dismissed" : "ticket.dismiss_race_lost",
    target: ticketId,
    meta: updated ? { ratingId: updated.ratingId, reason } : { attemptedReason: reason },
  });
  revalidateTicket(ticketId);
}
