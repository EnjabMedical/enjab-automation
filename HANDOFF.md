# HANDOFF — Enjab Automations Platform

> **New agent: read this first, then `docs/handoff/MEMORY_SNAPSHOT.md` for the
> full project context, then `docs/handoff/LAST_MESSAGE.md` for the exact
> message to re-output to the user when they next say "continue".**

Snapshot taken: **2026-05-24** at the close of Phase 5.

---

## In one paragraph

Enjab Medical Center (UAE) is a small clinic running on-prem InstaHMS. This
platform is a self-hosted modular automation layer that sits on top of HMS and
runs WhatsApp-driven automations against patient/visit data. Automation #1 is
post-visit rating: 60 min after reception opens an OP bill, send a bilingual
WhatsApp template asking the patient to rate the visit; high ratings get a
Google Reviews ask; low ratings open a triage ticket and a 6-button concern
flow that customer-service staff work through a dashboard pane. The platform
is designed to be modular — "automations own their UI" — so future automations
(appointment reminders, follow-ups) drop in as packages.

## Where the code lives

- **Repo root:** `/home/server/enjab_automation` (npm workspaces monorepo)
- Apps: `apps/web` (Next.js 15 App Router dashboard + webhook), `apps/worker`
  (BullMQ poller + cron scans)
- Packages: `packages/db` (Drizzle + Postgres), `packages/hms-client` (InstaHMS
  scraper), `packages/wa-client` (Meta Cloud API client), `packages/automations`
  (rating automation module + core engine types)
- Infra: Docker Compose at repo root, nginx-certbot for TLS, Postgres 17,
  Redis 7

## What's done

- ✅ Phase 0: monorepo scaffold + schema + Docker stack
- ✅ Phase 1: HMS bill/patient sync (Netbird VPN → 192.168.1.220)
- ✅ Phase 2: automation engine + rating module + dashboard
- ✅ Phase 3: WhatsApp Cloud API + rating template ingestion
- 🗑️ Phase 4: **dropped** (no inbox UI — staff use WhatsApp Business app via
  Meta Coexistence mode, enabled after launch)
- ✅ Phase 5: Low-Rating Triage pane + 3-step bilingual rating flow + multi-step
  inbound state machine + 26-finding adversarial review with fixes applied

## What's NOT done (next phase)

- Phase 6: production hardening
  - Magic-link auth (schema is ready, code is 0%)
  - Real Dockerfiles (web/worker run as `node:24-alpine` + bind-mount today)
  - Backups (off-box `pg_dump`)
  - Monitoring / uptime ping
  - Staff onboarding doc

## Current launch state

- All 10 WhatsApp templates **approved by Meta** as of 2026-05-24
- One template has a Meta-side bug: `rating_followup_ar` was created with
  Language="English". The code handles this via an explicit override in
  `packages/automations/src/rating/messages.ts`
  (`TEMPLATE_LANGUAGE_CODE_OVERRIDES`). Marked TEMP — remove after the user
  recreates the template as Arabic.
- Meta credentials filled into `.env` (NOT committed)
- Webhook configured + linked at both App and WABA layers; verify handshake
  returns 200
- App is still in Meta **Development mode** — needs publishing before sending
  to non-test recipients
- Rating automation is set to `dryRun: true` — flip to false to start real
  sends

**The user is in the launch-prep loop right now.** The last message I sent
to them (the launch blockers list) lives verbatim in
`docs/handoff/LAST_MESSAGE.md`. When the user says "continue" to the next
agent, re-output that message verbatim.

## Key files to read next

In order:
1. `docs/handoff/MEMORY_SNAPSHOT.md` — every memory file copied in, with
   user profile, locked decisions, project state, references, feedback
2. `docs/handoff/LAST_MESSAGE.md` — the exact message to re-output to resume
3. `docs/whatsapp-templates.md` — submission spec, body texts, validity
   periods, button types, gender-inclusive rules
4. `packages/automations/src/rating/` — the rating module
   (`config.ts`, `messages.ts`, `inbound.ts`, `index.ts`, `doctor.ts`)
5. `apps/web/app/automations/rating/tickets/` — the new triage UI (Phase 5)
6. `apps/web/app/api/wa/webhook/route.ts` — Meta webhook handler

## Things I do NOT have a token for / cannot see

- Meta WhatsApp Business account dashboard — credentials are in `.env`, you
  can call the Graph API but can't click around the WhatsApp Manager UI
- The user's email inbox, calendar, etc.
- The InstaHMS UI — only the scraper client can hit it via Netbird

## Things the user has a strong opinion on

See `docs/handoff/MEMORY_SNAPSHOT.md` "Feedback" section for the full list,
but the highlights:

- **Ground in real data.** Don't theorize about HMS or patient behavior —
  run probes against the live DB or HMS. Reject "I think the schema probably
  has X" — go look.
- **Ask 1-by-1.** Never batch 5 clarifying questions in one message. One at
  a time, with the next question gated on the previous answer.
- **Git identity.** Commits must be authored as
  `mhd12e <mhd12@devlix.org>`. Don't use `ceo@enjab.ae` — that's the
  *user's* email but not the git identity they want on commits.
- **Don't `git config --global`.** Use inline
  `git -c user.email='mhd12@devlix.org' -c user.name='mhd12e' commit ...`.

## How to commit in this project

```bash
git -c user.email='mhd12@devlix.org' -c user.name='mhd12e' \
  commit -m "Your message"
```

## Quick orientation commands

```bash
# stack state
docker compose ps

# tail logs
docker compose logs -f web worker

# DB shell
docker compose exec postgres psql -U enjab -d enjab

# typecheck
npx --no-install tsc --noEmit -p apps/web/tsconfig.json
npx --no-install tsc --noEmit -p packages/automations/tsconfig.json
npx --no-install tsc --noEmit -p packages/db/tsconfig.json

# verify Meta webhook handshake (uses verify token from .env)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://automations.enjab.ae/api/wa/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=ping"

# list approved Meta templates (uses access token from .env)
source .env && curl -s \
  "https://graph.facebook.com/v22.0/${WA_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,language,status,category&access_token=${WA_ACCESS_TOKEN}" \
  | python3 -m json.tool
```

## After cloning on the new VPS

1. Restore `.env` from secure notes (it's gitignored — contents are NOT in
   this repo by design)
2. `docker compose up -d` to start the stack
3. Verify Meta webhook handshake returns 200 (see command above)
4. Verify the 10 rating templates are still APPROVED with the Graph API
5. Re-read `docs/handoff/LAST_MESSAGE.md` so you know exactly where the user
   left off, then output that message verbatim and proceed

Good luck. The user is the CEO of the clinic and moves fast. Be concise.
