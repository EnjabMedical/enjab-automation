# WhatsApp Templates — Submission Spec (v2, bilingual)

> **One-shot reference for submitting to Meta.** Approval typically takes 1–24h
> per template; submit all in parallel for ~1 day calendar time max.
>
> This doc is the source of truth for what the rating automation expects.

---

## State of the WABA

- **WABA ID**: `1489640969164404`
- **Phone Number ID**: `992034593999704`
- **Verified business name**: `Enjab Medical Center` (matches patient-facing sender)
- **Display number**: `+971 6 556 3433`
- **Quality rating**: GREEN

## Per-patient language selection

- Detected from `nationality_name` in patient JSON. Match list = 22 Arab League states + common variant spellings (`UAE`, `KSA`, `Saudi`, `Syria`, `State of Palestine`, etc.) + Western Sahara → Arabic. Everyone else (including null/unknown) → English. Full list in `packages/automations/src/core/lang.ts` (`DEFAULT_ARABIC_NATIONALITIES`).
- Stored in `patients.language` (`en` / `ar`).
- Picked at send time from the templates listed below — same `{{1}}` and `{{2}}` params, different template name.

## The rating flow (visual)

```
        Initial template (admin toggles A1 OR A2)
        │
        ├── A1: 5★ buttons         A2: Great / Good / Bad
        │
   ┌────┴───┬────────────────────────────────┐
   │        │                                │
TOP tier  LOWER tier (4–1★, or Good/Bad)
   │        │
   ▼        ▼
thanks   concern-question template (6 buttons)
+ Google     │
Reviews      ▼ (patient picks area)
            confirmation template
            "feedback received, please reply with details
             — someone will call you shortly"
            │
            ▼
            free-form reply lands in inbox + ticket flagged
```

---

# All 10 templates

**Category:** UTILITY for all templates **except 5 and 6** (`rating_thanks_high_*`), which Meta auto-classifies as **MARKETING** because asking for a Google review is a promotional CTA by definition. Submit those two as marketing — see the *Marketing-category note* further down.

**Body params:** Only the initial templates (1–4) take body params: `{{1}}` = patient first name, `{{2}}` = doctor noun phrase. The 6 follow-up templates (5–10) take **no** body params — by the time they fire, the patient has already engaged and the message is contextual. See *Doctor display rules* below for how `{{2}}` is computed at send time.

> ⚠️ **Arabic drafts below are starting points** — have a UAE Arabic-native review the wording before submission. Meta rejects bad translations and patients notice awkward phrasing.

## Arabic gender inclusivity convention

UAE clinic Arabic UX standard: where a verb is conjugated for the **addressee's gender** (2nd person verbs, imperatives), use the inclusive form `masculine_stem/ي` so the same template reads naturally for both male and female patients. Examples:

| English | Masc only | Inclusive (use this) |
|---|---|---|
| (you) rate | `تقيّم` | `تقيّم/ي` |
| (you) hope / expect | `تأمل` | `تأمل/ي` |
| write | `اكتب` | `اكتب/ي` |
| share | `شارك` | `شارك/ي` |

**What we leave unchanged:**
- Possessive `ك` suffixes (`زيارتك`, `تجربتك`) — undotted Arabic doesn't distinguish M/F here.
- Adjectives that agree with grammatical-not-addressee gender — `ممتازة`, `جيدة`, `سيئة` agree with feminine `تجربة`, not with the patient.
- Verbs in non-2nd person — `يسعدنا` (1st p. pl.), `يرجى` (passive impersonal), `سيتصل بك` (3rd p. about staff).
- The standard greeting `مرحباً` — the masculine form is used neutrally in UAE Arabic.

## Doctor display rules (how `{{2}}` is filled)

HMS stores `doctor_name` with a `Dr.` prefix for real doctors, plus two special placeholders for non-doctor visits (verified against live data 2026-05-14):

| HMS value (sample) | `{{2}}` English | `{{2}}` Arabic |
|---|---|---|
| `Dr. Osama Abdelsalam` | `Doctor Osama Abdelsalam` | `د. Osama Abdelsalam` |
| `Dr. IN HOUSE` (laser/beauty staff) | `our team` | `فريقنا` |
| `Outside Dr` (referred from outside) | `our team` | `فريقنا` |
| null / empty | `our team` | `فريقنا` |

The full phrase (including the title) goes into `{{2}}`, so a single Meta-approved template body works for both real-doctor and in-house visits.

Implementation: `formatDoctorParam(doctorName, language)` in `packages/automations/src/rating/doctor.ts`. The Arabic title is `د.` (short form) — mixing Arabic title with the English name is the standard UAE-clinic bilingual convention, since HMS stores doctor names in English only.

## Marketing-category note (templates 5 & 6)

Meta's classifier auto-bumps `rating_thanks_high_*` to MARKETING because the body asks for a Google review — that's a promotional CTA by Meta's own definition, regardless of wording. **Submit them as MARKETING; don't waste time fighting it through Business Support review.**

What changes when a template is marketing:
- **Cost:** marketing ≈ $0.034/conversation in UAE vs $0.024/conversation utility. Templates 5 & 6 fire only on high ratings (~70% of patients). At 35 OP visits/day, the marketing portion is ~$25/month vs ~$18/month if it were utility — **~$7/month delta**.
- **Daily quota:** marketing conversations count against the marketing-tier limit (starting tier 1k/day — far above our volume).
- **Opt-outs:** patients can opt out of marketing separately from utility. A marketing opt-out blocks template 5/6 but doesn't affect the rest of the flow.
- **No code change required** — the rating automation calls `sendTemplate` by name; category is metadata Meta tracks for billing/quota, not something we pass at send time.

Templates 1, 2, 3, 4, 7, 8, 9, 10 should all pass UTILITY review — they're tied to a specific patient transaction (the visit) and don't contain promotional asks.

## Message validity period (per-template)

Meta defaults each template to **10 minutes** — far too short for our use case. Patients don't always have their phone open right after a clinic visit. We tune per-step:

| Template | Set validity to | Why |
|---|---|---|
| 1, 2, 3, 4 (initial rating prompt) | **12 hours** | Sent 60 min after visit-end. Patient may not check WhatsApp for hours; 12h keeps the visit fresh enough that the rating still matters. |
| 5, 6, 7, 8, 9, 10 (all follow-ups) | **1 hour** | Sent in response to a patient button tap. Useful only while the conversation feels live. After an hour, a delayed "thanks" or "tell us more" feels out of context. |

Undelivered messages aren't charged — short follow-up validity also doubles as a small cost guardrail. Where Meta exposes the setting in the template builder: "**Set custom validity period for your message**" toggle, then enter `12h` or `1h`.

## Button-type cheat sheet (Meta UI)

When the WhatsApp Manager template builder asks "Button type", here's what to pick for each button in our templates:

| Our button | Meta UI choice | Notes |
|---|---|---|
| All quick-reply buttons (★ ratings, Great/Good/Bad, concern areas) | **Custom → Custom** | The nested "Custom" — not "Preconfigured response". This gives a free-text quick-reply button. The button label becomes the payload we receive in the webhook. |
| Google Reviews URL button (templates 5, 6) | **Visit website** | URL type: **Static**. Paste `https://g.page/r/CTxj1xpz5jo1EBM/review`. |
| (we don't use) Call on WhatsApp | — | Skip — opens a chat with another number. |
| (we don't use) Call phone number | — | Skip — would dial; not what we want for either flow. |

**Per-template button summary:**

| Template | Buttons | Type |
|---|---|---|
| 1, 2 (`rating_a1_stars_*`) | 5 stars | Custom → Custom × 5 |
| 3, 4 (`rating_a2_simple_*`) | Great / Good / Bad | Custom → Custom × 3 |
| 5, 6 (`rating_thanks_high_*`) | Leave a Google Review | Visit website (static URL) |
| 7, 8 (`rating_concern_*`) | 6 concern areas | Custom → Custom × 6 |
| 9, 10 (`rating_followup_*`) | (none) | — |

## 1. `rating_a1_stars_en` (initial, 5-star, English)

- **Category:** Utility
- **Language:** English
- **Header (Text):** `Your visit feedback`
- **Body:** `Hi {{1}}, thank you for your visit with {{2}} at Enjab Medical Center. How would you rate your visit?`
- **Body samples:** `{{1}}=Sara`, `{{2}}=Doctor Osama Abdelsalam`
- **Footer:** `Enjab Medical Center`
- **Buttons:** 5 × **Custom → Custom** quick-reply. Labels: `★★★★★`, `★★★★`, `★★★`, `★★`, `★`
- **Validity:** `12 hours`

## 2. `rating_a1_stars_ar` (initial, 5-star, Arabic)

- **Category:** Utility
- **Language:** Arabic
- **Header (Text):** `تقييم زيارتك`
- **Body:** `مرحباً {{1}}، شكراً على زيارتك مع {{2}} في مركز إنجاب الطبي. كيف تقيّم/ي زيارتك؟`
- **Body samples:** `{{1}}=سارة`, `{{2}}=د. Osama Abdelsalam`
- **Footer:** `مركز إنجاب الطبي`
- **Buttons:** 5 × **Custom → Custom** quick-reply. Labels: `★★★★★`, `★★★★`, `★★★`, `★★`, `★`
- **Validity:** `12 hours`

## 3. `rating_a2_simple_en` (initial, 3-button, English)

- **Category:** Utility
- **Language:** English
- **Header (Text):** `Your visit feedback`
- **Body:** `Hi {{1}}, thank you for your visit with {{2}} at Enjab Medical Center. How was your experience?`
- **Body samples:** `{{1}}=Sara`, `{{2}}=Doctor Osama Abdelsalam`
- **Footer:** `Enjab Medical Center`
- **Buttons:** 3 × **Custom → Custom** quick-reply. Labels: `Great`, `Good`, `Bad`
- **Validity:** `12 hours`

## 4. `rating_a2_simple_ar` (initial, 3-button, Arabic)

- **Category:** Utility
- **Language:** Arabic
- **Header (Text):** `تقييم زيارتك`
- **Body:** `مرحباً {{1}}، شكراً على زيارتك مع {{2}} في مركز إنجاب الطبي. كيف كانت تجربتك؟`
- **Body samples:** `{{1}}=سارة`, `{{2}}=د. Osama Abdelsalam`
- **Footer:** `مركز إنجاب الطبي`
- **Buttons:** 3 × **Custom → Custom** quick-reply. Labels: `ممتازة`, `جيدة`, `سيئة`
- **Validity:** `12 hours`

## 5. `rating_thanks_high_en` (after 5★ or "Great", English)

- **Category:** **Marketing** ⚠️ (Meta auto-classifies any review-ask as marketing — see *Marketing-category note* below)
- **Language:** English
- **Body:** `Thank you! We're glad your visit went well. Would you share your experience on Google? It helps other families find us.`
- **Buttons:** 1 × **Visit website**. URL type: **Static**. Label: `Leave a Google Review`. URL: `https://g.page/r/CTxj1xpz5jo1EBM/review`
- **Validity:** `1 hour`

## 6. `rating_thanks_high_ar` (after 5★ or "ممتازة", Arabic)

- **Category:** **Marketing** ⚠️ (see *Marketing-category note*)
- **Language:** Arabic
- **Body:** `شكراً لك! يسعدنا أن زيارتك كانت ممتازة. هل يمكنك مشاركة تجربتك على Google؟ ذلك يساعد عائلات أخرى في العثور علينا.`
- **Buttons:** 1 × **Visit website**. URL type: **Static**. Label: `اكتب/ي تقييمك على Google`. URL: `https://g.page/r/CTxj1xpz5jo1EBM/review`
- **Validity:** `1 hour`

## 7. `rating_concern_en` (apology + 6 area buttons, English)

- **Category:** Utility
- **Language:** English
- **Body:** `We're sorry your visit didn't fully meet expectations. To help management follow up personally, which area was your concern about?`
- **Buttons:** 6 × **Custom → Custom** quick-reply. Labels:
  1. `Reception & booking`
  2. `Doctor's consultation`
  3. `Nursing & lab`
  4. `Billing & insurance`
  5. `Laser & beauty therapy`
  6. `Other`
- **Validity:** `1 hour`

## 8. `rating_concern_ar` (apology + 6 area buttons, Arabic)

- **Category:** Utility
- **Language:** Arabic
- **Body:** `نأسف أن زيارتك لم تكن كما تأمل/ي. لمساعدة الإدارة على المتابعة شخصياً، ما الجانب الذي كان لديك اعتراض بشأنه؟`
- **Buttons:** 6 × **Custom → Custom** quick-reply. Labels:
  1. `الاستقبال والحجز`
  2. `الاستشارة الطبية`
  3. `التمريض والمختبر`
  4. `الفواتير والتأمين`
  5. `الليزر والتجميل`
  6. `أخرى`
- **Validity:** `1 hour`

## 9. `rating_followup_en` (after concern button, English)

- **Category:** Utility
- **Language:** English
- **Body:** `Your feedback has been received and management has been notified. Please share any more details by replying to this message — someone will call you shortly.`
- **Buttons:** *(none — patient replies free-form within 24h conversation window)*
- **Validity:** `1 hour`

## 10. `rating_followup_ar` (after concern button, Arabic)

- **Category:** Utility
- **Language:** Arabic
- **Body:** `تم استلام تعليقاتك وإبلاغ الإدارة. يرجى مشاركة أي تفاصيل إضافية بالرد على هذه الرسالة — سيتصل بك أحدنا قريباً.`
- **Buttons:** *(none)*
- **Validity:** `1 hour`

---

# Submitting

## Path A — WhatsApp Manager UI (easiest with boss in the room)

For each of the 10 templates:

1. business.facebook.com → top-left menu → **WhatsApp Manager**
2. Left sidebar → **Message Templates** → blue **Create Template** button
3. **Category**: Utility
4. **Name**: paste template name from above
5. **Language**: English or Arabic (match suffix)
6. Header → **Text** → paste header text (if any)
7. Body → paste body text exactly (including the `{{1}}` `{{2}}` placeholders). Meta then asks for sample values — fill them in.
8. Footer → paste (if any)
9. Buttons → click **Add** → pick type (Quick Reply / URL) → fill labels and URLs
10. **Submit for review**

Submit all 10 in parallel. Calendar time ~1 day worst case.

## Path B — API (if you'd rather script it)

Example for template 1 (`rating_a1_stars_en`):

```bash
source .env
curl -X POST "https://graph.facebook.com/v22.0/${WA_BUSINESS_ACCOUNT_ID}/message_templates" \
  -H "Authorization: Bearer ${WA_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "rating_a1_stars_en",
    "language": "en",
    "category": "UTILITY",
    "components": [
      { "type": "HEADER", "format": "TEXT", "text": "Your visit feedback" },
      {
        "type": "BODY",
        "text": "Hi {{1}}, thank you for your visit with {{2}} at Enjab Medical Center. How would you rate your visit?",
        "example": { "body_text": [["Sara", "Doctor Osama Abdelsalam"]] }
      },
      { "type": "FOOTER", "text": "Enjab Medical Center" },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "QUICK_REPLY", "text": "★★★★★" },
          { "type": "QUICK_REPLY", "text": "★★★★" },
          { "type": "QUICK_REPLY", "text": "★★★" },
          { "type": "QUICK_REPLY", "text": "★★" },
          { "type": "QUICK_REPLY", "text": "★" }
        ]
      }
    ]
  }'
```

For URL-button templates (5, 6), the buttons block is:

```json
{
  "type": "BUTTONS",
  "buttons": [
    { "type": "URL", "text": "Leave a Google Review",
      "url": "https://g.page/r/CTxj1xpz5jo1EBM/review" }
  ]
}
```

Templates 5 and 6 also need `"category": "MARKETING"` (not `UTILITY`) in the top-level submission JSON — see *Marketing-category note* above.

For Arabic templates, set `"language": "ar"` and the Arabic body / button text directly. Meta accepts Unicode without escaping.

## Verify status

After submission, poll:

```bash
curl -s "https://graph.facebook.com/v22.0/${WA_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,language,status,category&access_token=${WA_ACCESS_TOKEN}" | python3 -m json.tool
```

All 10 should show `"status": "APPROVED"`. Any `REJECTED` response includes a `rejected_reason` field — usually a content-policy nudge, fix the wording and resubmit.

---

# What the platform expects after approval

The rating automation reads template names from `automations.config.templateNames`. Once approved, populate the new bilingual structure:

```ts
templateNames: {
  a1:         { en: "rating_a1_stars_en",   ar: "rating_a1_stars_ar"   },
  a2:         { en: "rating_a2_simple_en",  ar: "rating_a2_simple_ar"  },
  thanksHigh: { en: "rating_thanks_high_en", ar: "rating_thanks_high_ar" },
  concernAsk: { en: "rating_concern_en",    ar: "rating_concern_ar"    },
  followUp:   { en: "rating_followup_en",   ar: "rating_followup_ar"   },
},
templateLanguageDefault: "en",
```

Send-time: look up patient's `language` → pick the right template variant → fill `{{1}}` with patient first name and `{{2}}` via `formatDoctorParam(doctorName, language)` (from `packages/automations/src/rating/doctor.ts`).

# Decisions log

- **Why 5 functional templates × 2 languages = 10?** A1 vs A2 are two parallel initial variants (admin toggles which is active). Both flows then converge on the same follow-up sequence.
- **Why drop Mode B (URL form)?** The new in-chat flow with concern buttons + free-form reply replaces it cleanly. Less code, fewer Meta approvals, better UX.
- **Why drop Mode A2 (WhatsApp Flow JSON)?** A2 is now redefined as "3-button Great/Good/Bad", not the in-chat Flow widget. The original Flow concept is parked indefinitely.
- **Why doctor name in the body?** User explicitly asked (2026-05-14) and the HMS already exposes `doctor_name` in the patient JSON we sync — zero extra integration cost.
- **Why Arabic UI for Arabic patients only (not also English)?** Per-patient detection from nationality covers the vast majority (~85% Arabic in current sample); English handles everyone else, including unknown nationalities. No translation cost per message at runtime.
- **Why English is the default for unknown/null nationality?** User preference (set 2026-05-14, reverted to English 2026-05-15). When `nationality_name` is missing, English is the broader-comprehensible fallback for the long tail.
- **Why `{{2}}` carries the full noun phrase ("Doctor X" / "our team") instead of just the doctor name?** HMS uses placeholder doctor names for non-doctor visits — `Dr. IN HOUSE` (2 visits) for in-house laser/beauty staff, `Outside Dr` (3 visits) for outside referrals. Hardcoding "Doctor" in the template body would produce "Doctor IN HOUSE" — embarrassing. Letting `{{2}}` carry the whole phrase keeps one bilingual template per step and lets send-time logic substitute `our team` / `فريقنا` for placeholders. Decided 2026-05-14 against live data.
- **Why Arabic doctor title is `د.` (short) and not `الدكتور` (full)?** HMS stores all doctor names in English. Mixing the long Arabic article `الدكتور` with an English name reads awkwardly; the short `د.` form is the standard UAE-clinic bilingual convention and flows naturally in WhatsApp.
