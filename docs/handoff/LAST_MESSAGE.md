# Last Message To Re-Output On Resume

> When the user says "continue" / "where were we" / similar, the next agent
> should re-output the message below VERBATIM (preserving the markdown,
> emoji, table structure, and tone). The user expects to pick up exactly
> where the previous session left off.
>
> The user has explicitly chosen the **skip-test-recipients** path and wants
> to go directly to production. That decision is locked.
>
> Lines beginning with `>` (including this preamble) are NOT part of the
> message — only the content between the two `--- BEGIN/END MESSAGE ---`
> markers is the verbatim text.

--- BEGIN MESSAGE ---

OK, skip-test-recipients path. Revised blockers:

---

## 🚫 Hard blockers (same #1, different #2)

**1. Add payment method** — same as before, no change. Mandatory regardless of dev/live mode.

**2. Publish the Meta app** — this is what unlocks sending to any number, not just test recipients. Requires Meta to approve a few fields first:

| Field | Status | Notes |
|---|---|---|
| **Privacy Policy URL** | 🔴 missing | Biggest hurdle. Needs a real URL on a domain you own. I can build `/privacy` on automations.enjab.ae in ~15 min — say the word. |
| **Data deletion instructions URL** | 🔴 missing | Can be a section of the privacy policy. I'll include both in the same page. |
| **App icon** (1024×1024 PNG) | 🔴 missing | You need to upload one. Use your Enjab logo if you have a square version. If not, I can generate a simple placeholder text-mark from your branding — but a real logo is better. |
| **Category** | 🟡 dropdown | Pick "Business and Pages" or "Health & Fitness". Either works. |
| **Business verification** | 🟡 maybe | Meta sometimes requires this for Live mode. If they ask, it's a separate flow (~1-3 days) to submit company docs (UAE trade license). Worth flagging in advance. |

---

## ⚠️ Stuff you need to understand before going live

The moment we flip `dryRun=false` and a new OP bill opens, **real patients start receiving real messages 60 min later**. Risks:

| Risk | Mitigation |
|---|---|
| Arabic RTL rendering bug only visible in production | Will check the very first send carefully; can flip dryRun back if wrong |
| Patients confused by unsolicited message from a new number | Number is verified "Enjab Medical Center" — should be recognizable |
| Quality rating drops if patients block | Start conservative; if we see blocks, pause and revisit |
| New WABA tier limit (250 conversations/day) | At your ~35/day volume, way under cap |
| `rating_followup_ar` registered as `en` (Option B hack) | Works, but messy. Recommended to recreate cleanly before scale — not blocking for launch |

---

## What I need from you to proceed

In one message back, give me:
1. ✅/❌ Payment method added?
2. **App icon** — attach the file or say "use placeholder" and I'll do something basic
3. ✅ Permission to build the `/privacy` page on automations.enjab.ae?

Once I have those three answers, I can:
- Build the privacy page (~15 min)
- You publish the app
- I flip `dryRun=false`
- We watch the first real send fire

That's it. No test-recipient detour.

--- END MESSAGE ---

## Continuation playbook (for the new agent's reference, not for the user)

Once the user answers items 1/2/3:

1. **If payment method = ❌:** stop and remind them it's the only hard
   blocker; everything else can proceed in parallel but no real sends until
   payment.
2. **If permission to build `/privacy` = ✅:** create `apps/web/app/privacy/page.tsx`
   with sections for: data collected (HMS visit data, WhatsApp delivery
   statuses, message content within the rating flow), how it's used, retention,
   patient rights (access/delete/opt out), contact email, and a "Data Deletion
   Instructions" subsection that satisfies Meta's separate-URL requirement
   pointing back to itself. Use a clinic-appropriate, conservative tone. Tailwind
   styling matching the rest of the dashboard. Skip auth — must be publicly
   accessible.
3. **App icon — if "use placeholder":** generate a 1024×1024 PNG via something
   simple like `convert` (ImageMagick) — text-mark "EM" on the brand color
   from the WhatsApp manager dashboard. Save to `apps/web/public/app-icon.png`
   AND give the file to the user to upload to Meta. The icon itself doesn't
   ship via our app — Meta needs the PNG uploaded in the App Settings UI.
4. **After app publish:** Meta `app_mode` flips from Development → Live.
   Verify by hitting
   `GET /v22.0/{APP_ID}?fields=app_domains,server_ip_whitelist&access_token=APP_ID|APP_SECRET`
   or just check the WhatsApp Manager UI.
5. **Then flip `dryRun=false`** in the dashboard at `/automations/rating`.
6. **Watch the first send** — the next bill opened in HMS triggers a
   scheduled job in `scheduled_jobs`; visible at `/automations/rating/upcoming`.
   60 min after `bill.open_date` (or end of quiet hours) it fires. Audit
   trail at `/automations/rating/decisions`. If `status=sent`, the patient
   got the message.
7. **First real button tap** — should land in
   `/automations/rating/tickets` (if low rating) or just record a rating
   (if high). The webhook handler is at `apps/web/app/api/wa/webhook/route.ts`.

If any of those steps fail, the audit log in `events` table (or
`/automations/rating/decisions`) tells you exactly why.
