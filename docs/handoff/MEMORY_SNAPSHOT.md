# Memory Snapshot — Enjab Automations

> Exported 2026-05-24. This file aggregates every memory note the
> previous agent maintained. The next agent should read top-to-bottom.

---


---

## `MEMORY.md`

- [User profile](user.md) — CEO of Enjab Hospital (UAE), informal English, expects real-data proof.
- [Feedback: ask 1-by-1](feedback_one_by_one.md) — never batch many planning questions in one go.
- [Feedback: ground in real data](feedback_real_data.md) — don't theorize, run probes against the live HMS.
- [Feedback: git identity](feedback_git_identity.md) — commit as `mhd12e <mhd12@devlix.org>`, NOT `ceo@enjab.ae`.
- [Project: Enjab Automations vision](project_platform_vision.md) — modular self-hosted automation platform; rating is automation #1 of many.
- [Project: locked decisions](project_locked_decisions.md) — WA Option B + custom dashboard, Docker Compose, Postgres queue (no Redis), Meta Cloud API direct.
- [Project: clinic workflow](project_clinic_workflow.md) — bill.open_date is the visit-end signal at Enjab; send_sms="Y" is the real messaging gate.
- [Project: HMS server quirks](project_hms_quirks.md) — slow + drops sessions under load; client must do bounded concurrency + auto re-login.
- [Reference: HMS endpoint map](reference_hms_map.md) — docs/hms-map.md is the authoritative endpoint catalog.
- [Reference: prior planning transcript](reference_transcript.md) — `enjab automation.txt` at repo root has the full prior session.
- [Project: rating automation spec](project_rating_automation_spec.md) — full v1 spec (modes A/B, branching, ticket workflow, "automations own their UI" rule).
- [Project: WhatsApp setup](project_wa_setup.md) — verified name, templates already approved (enjab_review_en/ar, appointment_reminder), existing n8n webhook to migrate.
- [Project: open interview questions](project_open_questions.md) — what's still unanswered before we can start building.


---

## `user.md`

---
name: User profile
description: Who the user is and how they communicate
type: user
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
CEO of Enjab Hospital (clinic) in the UAE. Email ceo@enjab.ae. Owns the InstaHMS deployment and is the decision-maker on the automation platform.

Writes English informally (Arabic-first likely — short sentences, occasional typos, casual tone like "bruh", "abt", "dw"). Reads code and architecture diagrams comfortably; will push back on anything wrong with concrete reasoning ("isnt open bill more reliable?"). Likes ASCII diagrams and tables in answers, dislikes long theory without proof on real data.

Expects me to be a thinking partner, not a stenographer — when I propose something he disagrees with he'll say so directly, and when I'm wrong he expects me to admit it and fix it (e.g. the parallel-fetch silent-timeout bug).


---

## `feedback_one_by_one.md`

---
name: Ask planning questions one at a time
description: When eliciting decisions for a non-trivial build, ask one question at a time, not a batch
type: feedback
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
When eliciting decisions for the platform plan, ask ONE question at a time and wait for the answer before the next.

**Why:** User explicitly said "feel free to ask me questions but 1 by 1 until you get the full picture." A wall of 8 questions at once gets a partial answer and we lose state.

**How to apply:** Fine to *list* the open topics so the user sees the agenda, but actively ask only the most-blocking question. After he answers, ask the next. The exception is light yes/no clarifications about a single decision — those can be grouped.


---

## `feedback_real_data.md`

---
name: Ground claims in real data, not theory
description: Run probes against the live HMS before drawing architectural conclusions
type: feedback
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
Before making architectural claims about the clinic's data, *probe the live HMS* and show real numbers. Don't theorize about "what if no phone" — fetch and count. Don't assume an opt-out rate — measure it across the latest N rows.

**Why:** I made two embarrassing mistakes in the prior session: (1) treated parallel-fetch timeouts as "no phone on file" — user immediately spotted it because he could see the phones in the UI; (2) declared a "consent crisis" based on `custom_list8_value` being Opt-Out for 19/20 patients without checking what that field actually meant — turned out to be HIE Consent (Riayati/Malaffi) not messaging consent. Both wasted user time and required walking back conclusions.

**How to apply:** When the user shares a hypothesis or I'm tempted to draw a conclusion, write a quick probe script (read-only — he gave permission to "explore but don't edit"), run it, paste the actual rows. Distinguish fetch errors from missing data in any output. Verify field meaning against the registration form's label, not its name.


---

## `feedback_git_identity.md`

---
name: Use mhd12@devlix.org for git authoring, not ceo@enjab.ae
description: When committing on the user's behalf, use mhd12@devlix.org as author/committer email
type: feedback
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
When making git commits on the user's behalf, ALWAYS use `mhd12e <mhd12@devlix.org>` as the author/committer identity. NEVER use `ceo@enjab.ae` even though that's what the conversation context surfaces as the user's email.

**Why:** `ceo@enjab.ae` is a forwarding/role address for the hospital, not the user's dev identity. When commits with `ceo@enjab.ae` get pushed to GitHub, they get attributed to whatever account has that email registered (which surfaced as a name the user didn't recognize — "EnjabMedical"). On 2026-05-06 the user had to force-rewrite all 7 commits' authoring email to clean this up. He was understandably annoyed ("dumb ass").

**How to apply:** When `git commit` is needed and the user hasn't set local git config (which we are NOT to touch per system policy), pass identity inline:
```
git -c user.email='mhd12@devlix.org' -c user.name='mhd12e' commit -m "..."
```
The `mhd12e` username is correct and matches his GitHub account `github.com/mhd12e`. Do not change the username, only the email.


---

## `project_platform_vision.md`

---
name: Enjab Automations — platform vision
description: What we're building and how the user thinks about it
type: project
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
The repo is the seed of **Enjab Automations** — a self-hosted modular automation platform that sits on top of the on-prem InstaHMS. The user's framing (verbatim): "this will be the first of manyyyyyy automations… modular and easy to add on and secure and MAX UX FOR EMPLOIES."

**Why:** Hospital wants to layer multiple workflows (rating, appointment reminders, no-show recovery, AR collection, lab notifications, birthdays, etc.) without writing new plumbing each time. Adding automation #N should be a config row + new template + a poll source — not new core code.

**How to apply:** When designing anything in this repo, prefer abstractions that generalize across automations: `triggers → filters → actions` engine, `scheduled_jobs` table, central audit log, dashboard with per-automation pause/dry-run/test-to-me. v1 ships with exactly one automation enabled (OP rating, +60min after bill open) but the engine should already be plural.

The locked v1 trigger: bill.open_date + 60 min for visit_type='o', gated on send_sms='Y' AND has phone AND not in platform opt_outs, idempotent on bill_no, max age 24h, quiet hours 22:00–08:00 Asia/Dubai.


---

## `project_locked_decisions.md`

---
name: Locked architectural decisions
description: Decisions the user has already made — don't re-litigate
type: project
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
These are user-decisions from the planning session — don't bring them up again unless he asks:

1. **WhatsApp via Meta Cloud API direct** — not Twilio, not Wati, not whatsapp-web.js / Baileys. **The hospital's number is ALREADY migrated and connected to Meta Cloud API as of 2026-05-05.** No further Meta paperwork from his side; I just request env vars (WA_PHONE_NUMBER_ID, WA_BUSINESS_ACCOUNT_ID, WA_ACCESS_TOKEN, WA_APP_SECRET, etc.) when I'm ready to wire them. NOT Coexistence — user explicitly rejected coexistence as too complex.
2. **Two-way chat must live in the platform.** Because the number is API-only post-migration and patients sometimes message in, the dashboard must be a full inbox: surface inbound WhatsApp messages, let staff reply from the platform UI. Not just a sender.
3. **Hosting: VPS, public-facing directly.** Currently a Hetzner Ubuntu 24.04 box (fsn1, 4GB, public IPv4 178.105.105.106). No Cloudflare Tunnel — TLS terminated on the VPS itself (nginx + Let's Encrypt is the obvious path).
4. **HMS access: Netbird mesh VPN tunnel back to 192.168.1.220.** Netbird gets installed on both ends; the VPS hits the HMS as if it were on the same LAN. Tunnel uptime is operationally critical — if the tunnel drops, polling pauses (handle gracefully, alert).
5. **Queue: Redis** (NOT Postgres — user's call). Use BullMQ or similar; keep idempotency keys in Redis or in Postgres as the durable record alongside.
6. **Single Docker Compose stack** — postgres, redis, worker, web (Next.js), nginx. No cloudflared.
7. **No Twilio / Wati / AiSensy / 360dialog.** Hospital's own number, direct Meta.
8. **TypeScript end-to-end**, Next.js for the dashboard, Drizzle for the ORM (proposed; not yet explicitly acked but consistent with current code).
9. **Trigger source: `bill.open_date`** — locked. Not disch_date, not consultation_status, not visit_closed_time. Bills are opened by reception *after* the doctor finishes the visit, so open_date is the visit-end signal.
10. **All-English UI.** Single language for: WA templates, rating page (Mode B), dashboard. No Arabic at launch, no per-patient language detection.
11. **Operational defaults (acked 2026-05-05):** Active window 07:00–24:00 Asia/Dubai (quiet hours 00:00–07:00, pending confirmation). HMS bill poll every 5 min during active window, every 30 min off-hours. Patient JSON cache TTL 6h. Max-age for pending rating jobs = 24h. Magic-link auth (no passwords), 30d sessions, first user `ceo@enjab.ae`. Daily `pg_dump` + Redis RDB snapshot to local VPS volume, retained 30d. Push-to-phone notifications OFF at launch.
12. **Sync idempotency:** Patients keyed on `mr_no` (no dupes ever). Rating jobs keyed on `bill_no` (every new finished visit fires a new rating, even repeat patients).

**Why:** Each of these took a back-and-forth to settle. Re-asking burns trust.

**How to apply:** Build/plan against these defaults silently. Only re-open if a new constraint forces a revisit.


---

## `project_clinic_workflow.md`

---
name: Enjab clinic workflow facts (drives all trigger logic)
description: Clinic-specific HMS usage — what fields are populated and what they actually mean
type: project
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
What the clinic actually does in InstaHMS, confirmed from data on 2026-04-29:

| Event | Who/when | HMS signal |
|---|---|---|
| Patient arrives | Reception clicks "Arrive" | `appointment_status=Arrived`, `arrival_time` set |
| Doctor finishes | — (no HMS signal directly) | none |
| Reception opens bill | Manual confirmation that doctor finished | **`bill.open_date` set** ← this is our visit-end trigger |
| Patient pays | Same day or weeks later (insurance) | `bill.status` Open → Closed → Finalized |
| Formal discharge / Visit Close | **NOT used at Enjab** | always empty |

Effectively-OP-only clinic right now (zero IP open bills observed in the sample).

**Consent fields — easy to mix up:**
- `custom_list8_value` ("Global Opt-In" / "Global Opt-Out" / blank) = **HIE Consent** (Health Information Exchange — UAE Riayati/Malaffi national data sharing). NOT messaging consent. Almost everyone is "Global Opt-Out" for HIE. Ignore for messaging decisions.
- `send_sms` ("Y"/"N") and `send_email` ("Y"/"N") = the actual messaging-consent gates. Defaults to "Y" at registration; reception can flip it via the SPA's "Edit Communication Settings" link.

**Why this matters:** I burned a planning round acting like the clinic had a consent crisis (19/20 opted out) — false alarm caused by reading the wrong field.

**How to apply:** **The user's final call (2026-05-05) is to ignore `send_sms` entirely** — always message patients with a phone, gate consent platform-side via STOP replies / Meta-block webhooks / manual dashboard opt-outs only. Never gate on `custom_list8_value` either. Don't propose adding either field back to the filter chain unless he raises it.

Phone numbers in the JSON are already E.164 (`+9715…`) — WhatsApp-ready, no reformatting.


---

## `project_hms_quirks.md`

---
name: HMS server quirks the client must handle
description: The on-prem InstaHMS is slow and drops sessions — design implications
type: project
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
The on-prem InstaHMS at `http://192.168.1.220/instahms` is slow and aggressively sheds load. Two failure modes I've already eaten:

1. **Parallel requests time out silently.** Firing 20 parallel `getPatientByMrNo` POSTs caused the server to hang on the tail. Solved with bounded concurrency = 3 in `pool()` + per-request timeout (30s) + retries with exponential backoff.
2. **The session dies mid-run.** The HMS returns 302 → `loginForm.do` partway through a job. Solved with `isSessionDead` detection inside `authedRequest`, which silently re-logs in and retries once. Both `client.get()` and `client.post()` go through this — anything that hits the HMS authenticated must too.

**Why:** It's a Spring app on a clinic-grade box, and the deployment is undersized for our polling cadence. Will not change.

**How to apply:** Any new HMS endpoint we wire up must use `client.get()` / `client.post()` (already wrap auto-relogin) and stay inside the bounded-concurrency pool. Never `Promise.all` raw fan-outs against the HMS. For the platform's poll loops, plan a cadence that respects the 30s/request reality (a full-list scan + 30 patient lookups = ~minutes).

Auth recipe (also in docs/hms-map.md): GET `/loginForm.do` (primes SESSION cookie, Path=/instahms/) → POST `/login.do` form-urlencoded `hospital=enjab&userId=<u>&password=<p>&hashFragment=` → 302 to `/home.do` with rotated SESSION cookie. No JWT, no CSRF, no client-side hashing.


---

## `project_wa_setup.md`

---
name: project-wa-setup
description: "WhatsApp Cloud API state — account rotated 2026-05-15, awaiting new credentials + new template approvals"
metadata: 
  node_type: memory
  type: project
  originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---

**Account state**
On 2026-05-15 the user rotated the Meta Business account (the old WABA was an unrelated existing setup). The new account's identity values are not yet known; `.env` slots for `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID`, `WA_ACCESS_TOKEN`, `WA_APP_ID`, `WA_APP_SECRET` are blank pending the user filling them in.

**Webhook**
- Callback URL (locked): `https://automations.enjab.ae/api/wa/webhook`
- Current verify token (in `.env`): `4fcd656381b2c582959b1cc14ad83858a690fb6dcabb6cd9`. Rotated 2026-05-15. Rotate any time via `openssl rand -hex 24` — must update both `.env` and Meta's webhook config, then `docker compose up -d --force-recreate web` so Next.js picks up the new env var (env vars are snapshotted at container start).
- Subscribe to `messages` field — covers both inbound messages AND delivery statuses. The handler is in `apps/web/app/api/wa/webhook/route.ts`.
- mTLS / client cert option: **leave OFF**. Nginx isn't configured to validate the cert, and HMAC `X-Hub-Signature-256` (using `WA_APP_SECRET`) is sufficient auth.
- App must be **published** to receive production webhooks. Unpublished apps only receive test events from the app dashboard.

**Templates (v2 bilingual, 10 total)**
The pre-existing approved templates (`enjab_review_en/ar`, `appointment_reminder`, `hello_world`) belong to the OLD account and are gone with the rotation. New submission list lives in `docs/whatsapp-templates.md` — 5 functional × 2 languages. All UTILITY category. Submit in parallel; approval is typically 1–24h per template.

**How to apply**
- When user fills in the new account credentials, recreate the web + worker containers so env vars propagate. Then verify the webhook handshake with: `curl "https://automations.enjab.ae/api/wa/webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=ping" — expect 200 + "ping" echoed.
- When you reference templates in code, use `config.templateNames[step][language]` — not hard-coded names like `enjab_review_en`.
- Don't reuse `enjab_review_*` or `appointment_reminder` template names — those belong to the rotated account.

**Related**
- [[project-rating-automation-spec]] — flow that uses these templates
- [[project-open-questions]] — what user still needs to do


---

## `project_rating_automation_spec.md`

---
name: project-rating-automation-spec
description: "Post-visit rating automation — v2 spec (bilingual, multi-step concern flow, dropped Mode B + WhatsApp Flow)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---

Locked spec for Automation #1 — post-OP-visit rating. Originally agreed 2026-05-05; reshaped 2026-05-14 (bilingual + doctor-name) and 2026-05-15 (multi-step concern flow).

**Trigger**
- Source: `bill.open_date` (visit_type='o') + delayMinutes (default 60).
- Gates: has phone, not in platform opt_outs, idempotent on bill_no, max age 24h, NOT in quiet hours (00:00–07:00 Asia/Dubai). `send_sms` is intentionally ignored. Consent enforced platform-side via STOP replies + Meta-block webhooks + manual dashboard opt-outs.

**Outbound modes (down from 3 to 2)**
Admin toggles A1 vs A2 in the dashboard. Each maps to a Meta-approved template pair (en + ar):
- **A1** — `rating_a1_stars_{en,ar}` with 5 quick-reply buttons: ★★★★★ down to ★.
- **A2** — `rating_a2_simple_{en,ar}` with 3 quick-reply buttons: Great / Good / Bad (ممتازة / جيدة / سيئة). 4★ and 2★ granularity lost intentionally.
- **Why:** Mode B (URL form) and the old A2 (in-chat Flow JSON) were both dropped. The 6-button concern flow + free-form reply replaces Mode B's hosted form. See [[project-locked-decisions]].

**Bilingual everything**
- 5 functional templates × 2 languages = 10 templates total. See `docs/whatsapp-templates.md` for exact bodies.
- All UTILITY category EXCEPT `rating_thanks_high_{en,ar}` (templates 5, 6) — Meta auto-classifies those as MARKETING because asking for a Google review is a promotional CTA by definition. Submit as marketing; ~$7/month delta vs utility, no code change needed (category is Meta-side metadata).
- Language is per-patient, derived from `nationality_name`. Arab League → ar; everyone else (including null/unknown) → en. User flipped null/unknown briefly to Arabic on 2026-05-14, then back to English on 2026-05-15. See `packages/automations/src/core/lang.ts`.

**3-step flow (new, replaces simple thanks/sorry)**
1. **Initial** template (a1 or a2) — takes `{{1}}` = first name, `{{2}}` = doctor noun phrase. `{{2}}` is computed by `formatDoctorParam()` (`rating/doctor.ts`) — handles `Dr. IN HOUSE` and `Outside Dr` HMS placeholders by substituting "our team" / "فريقنا".
2. Patient taps a button:
   - Top tier (5★ or "Great") → send `rating_thanks_high_*` with static URL button → Google Reviews.
   - Lower tier (≤4★ or "Good"/"Bad") → send `rating_concern_*` with 6 area buttons (Reception, Doctor, Nursing, Billing, Laser, Other). Open triage ticket NOW.
3. Patient taps a concern-area button → `setRatingConcernArea()` writes the slug, send `rating_followup_*` ("feedback received, please reply with details").
4. Patient replies free-form within the 24h window → attached to the existing rating ticket as context. Staff replies manually via the WhatsApp Business mobile app (coexistence mode), NOT via a built-in inbox UI. Phase 4 (inbox UI) is dropped — see [[project-open-questions]].

All follow-up templates (5–10) take **zero** body params — by the time they fire, context is already established. Only templates 1–4 take `{{1}}` and `{{2}}`.

**Branching threshold**
- `lowRatingThreshold` (default 3): score ≤ this → concern-flow + Low-Rating Triage ticket. ≥4 → Google Reviews handoff.

**Inbound state-machine routing**
`inbound.ts` detects which step by looking at the `template_name` of the most-recent outbound to that patient (last 48h). Prefix match:
- `rating_a1_stars_*` or `rating_a2_simple_*` → step 1 reply (record rating + branch).
- `rating_concern_*` → step 2 reply (record concern area + send follow-up).
- Anything else → log `rating.inbound_unrouted` and skip.

**Architectural rule — automations own their UI**
Still holds. The Low-Rating Triage pane, mode toggle, threshold config, Google Reviews URL, template names — all live inside the rating automation's scope, not in platform core. Adding automation #2 = drop a new module in `packages/automations/<name>/` with its own UI, config, handlers.

**Related**
- [[project-wa-setup]] — Meta account state, webhook config, verify token rotation.
- [[project-locked-decisions]] — why Mode B and Flow A2 were dropped.


---

## `project_open_questions.md`

---
name: project-open-questions
description: Where we left off — paused on Meta template approval + new WhatsApp account credentials
metadata: 
  node_type: memory
  type: project
  originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---

**Status as of 2026-05-15:** Code is fully reshaped for the v2 bilingual + multi-step flow. Production launch is gated on three external steps the user must do.

**What user must come back with:**
1. **10 templates submitted to Meta** per `docs/whatsapp-templates.md` — bilingual pairs: `rating_a1_stars_{en,ar}`, `rating_a2_simple_{en,ar}`, `rating_thanks_high_{en,ar}`, `rating_concern_{en,ar}`, `rating_followup_{en,ar}`. Arabic drafts need a UAE Arabic-native review before submission.
2. **New Meta account credentials filled into `.env`** — WABA was rotated 2026-05-15. The slots `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID`, `WA_ACCESS_TOKEN`, `WA_APP_ID`, `WA_APP_SECRET` are blank pending the new account.
3. **WABA webhook repointed** to `https://automations.enjab.ae/api/wa/webhook` with verify token `4fcd656381b2c582959b1cc14ad83858a690fb6dcabb6cd9` (current value in `.env`). Subscribe to the `messages` field. The verify-handshake handler is confirmed working as of 2026-05-15.
4. **Meta app must be published** — apps in dev/unpublished state only deliver test webhooks from the app dashboard, not real patient traffic. User flagged this as a reminder for themselves on 2026-05-15.

**When user returns, do this in order:**
1. Verify all 10 templates show `APPROVED` via `GET /v22.0/{WABA_ID}/message_templates`.
2. Recreate web + worker containers so the new `.env` is picked up (`docker compose up -d --force-recreate web worker`). Env vars are snapshotted at container start — `.env` edits alone do not propagate.
3. Verify webhook is configured + meta app published.
4. Flip `dryRun` to `false` in `/automations/rating` settings.
5. Watch the next scheduled rating job fire — should be visible in `/automations/rating/upcoming`.
6. **First real send** — confirm initial template arrives on patient's phone with `{{2}}` rendering correctly (real doctor name vs. "our team" for in-house). Status webhook should record `wa_msg_id` transitions.
7. **First real initial button-tap** — confirm rating row created, then either `rating_thanks_high_*` fires (≥4★) or `rating_concern_*` fires (≤3★, with triage ticket opened immediately).
8. **First real concern-area tap** — confirm `concern_area` column gets the canonical English slug, then `rating_followup_*` fires.
9. **Then** build Phase 5 (Low-Rating Triage pane) — the only remaining UI work.

**Locked but unimplemented things to remember:**
- ~~Phase 5 — DONE 2026-05-24.~~ Tickets list at `/automations/rating/tickets` (filter chips: Open / New / In progress / Completed / Dismissed / All), detail page with patient context + WhatsApp-clickable phone + replies timeline + lifecycle action panel (claim / start / complete-with-notes / dismiss-with-reason). All transitions race-safe via WHERE-clause status guards. Shared `RatingTabs` component (apps/web/components/RatingTabs.tsx) replaces the inline tab strips that were duplicated across Settings/Upcoming/Decisions; carries an open-ticket count badge. Webhook persists inbound text/interactive replies and links them to the right ticket via the most-recent-outbound chain (avoids cross-contamination when a patient has multiple open tickets). `insertMessage` is now idempotent on `wa_msg_id` (ON CONFLICT DO NOTHING) so Meta retries don't break the rating state machine.
- **Phase 5 deferred items** (low-priority polish, not blocking launch): list-page pagination beyond 200 rows, "All tickets" back-link preserving filter via `?from=`, double-click submit-button debounce (would need client component), empty-state copy for fresh-install vs filter-mismatch, replies-timeline scroll container + virtualization at high counts, disclaimer banner on detail "replies = all patient inbound since ticket opened, may include unrelated conversations".
- **Phase 5 staff-name no-auth notes:** lifecycle actions capture a typed "Your name" + persist via `staffName` cookie (`httpOnly:true`, `secure:true`, `sameSite:strict`, path-scoped). Reserved actor names (`system`/`worker`/`automation`/`rating`/`wa-webhook`/`hms-sync`) are rejected by `normalizeActorName`. `claimedBy` FK stays NULL; the claimer's name is read from the events audit log for display. Real auth is Phase 6.
- Phase 6: production hardening (Dockerfiles for web/worker instead of node:24-alpine + bind-mount, monitoring, backups to off-box S3, staff onboarding) **+ magic-link auth** so the deferred-auth shortcuts in Phase 5 can be retired (claimedBy gets populated, admin actions get role gates, CSRF protection stops relying solely on Next.js allowedOrigins).

**Don't re-discuss (already decided):**
- `send_sms` field — IGNORED, no consent gate from HMS side, only platform-side opt_outs.
- Mode B (URL form) — fully removed from code on 2026-05-15. The `/rate/[token]/` route is gone.
- Old Mode A2 (WhatsApp Flow widget) — parked indefinitely; A2 is now redefined as "3-button Great/Good/Bad".
- Per-patient Arabic — wired via `nationality_name` detection. Doctor name from HMS already exposed; in-house/outside-Dr placeholders handled by `formatDoctorParam()`.
- **Phase 4 (inbox UI) — DROPPED on 2026-05-15.** Staff will reply manually via the WhatsApp Business mobile app once Meta coexistence mode is enabled on the number. Our dashboard does not need a chat/inbox view; the Low-Rating Triage pane just needs to show free-form replies as context on the ticket, not provide a reply UI. The `threads` table in `packages/db/src/schema.ts` is now orphaned — leave it for now, remove during Phase 6 cleanup if it stays unused.
- **Coexistence mode** — enable AFTER rating automation is stable in production, not before. Meta-side config flip, no code changes; only follow-up code work is detecting `from_me=true` on inbound webhooks so staff-sent messages don't get logged as patient input.

**Related**
- [[project-rating-automation-spec]] — full v2 spec
- [[project-wa-setup]] — Meta account state, webhook verify token
- [[project-locked-decisions]] — why Mode B and Flow A2 were dropped


---

## `reference_hms_map.md`

---
name: HMS endpoint catalog
description: Authoritative endpoint + field map for the InstaHMS at Enjab
type: reference
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
`docs/hms-map.md` in this repo is the live endpoint + field catalog from a 2026-04-29 read-only recon. It documents:
- Auth flow (loginForm.do → login.do → SESSION cookie)
- Bills list (`/pages/BillDischarge/BillList.do?_method=getBills&...`) — query syntax, columns, onclick payload shape
- Patient JSON (`/pages/registration/regUtils.do?_method=getPatientDetailsJSON&mrno=`) — useful fields, send_sms vs HIE distinction
- OP visits list, today's appointments, registration forms — endpoints + which fields are populated at Enjab
- "Triggers we can build today" table mapping each future automation to its HMS source
- "What we ruled out / can't use" — fields that look useful but are always empty at Enjab

When proposing a new automation, check this doc *first* for the source endpoint before probing the HMS again. Update the doc as new endpoints get wired up.


---

## `reference_transcript.md`

---
name: Prior planning transcript
description: Full prior session transcript with the user — read for context on past back-and-forth
type: reference
originSessionId: 16adfdd7-c3c7-468e-8222-5c8c1ee9540a
---
`enjab automation.txt` at the repo root (~3,500 lines) is the full Claude Code session that produced this codebase + the planning conversation. Useful when:
- The user references a decision that's not in the code ("we agreed to X" — search the transcript)
- I need to reconstruct the *reasoning* behind a memory entry
- The user asks "what did we say about Y last time?"

Don't re-read it routinely; it's a one-time recovery resource. The distilled facts are already in the project memories and `docs/hms-map.md`.

