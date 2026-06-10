# Insta HMS — Endpoint & Data Map for Enjab Automations

> Authoritative reference for what's available in the on-prem Insta HMS at Enjab,
> mapped from a read-only exploration on 2026-04-29.
> Every URL is relative to `http://192.168.1.220/instahms`.

## Auth

- `GET /loginForm.do` → issues `SESSION` cookie (Spring Session, `Path=/instahms/`).
- `POST /login.do` form-urlencoded `hospital=enjab&userId=<u>&password=<p>&hashFragment=` → 302 `/home.do?…` + rotated `SESSION` cookie.
- All authenticated endpoints expect that cookie. **The HMS drops sessions under load** — auto re-login on 302 is mandatory in any client.

## Workflow reality at Enjab (clinic-specific, confirmed from data)

This is how Enjab actually uses Insta HMS — not what the product theoretically supports:

| Event | When it happens | Signal in HMS |
|---|---|---|
| Patient books appointment | Manual / phone | `appointment_status = Booked` |
| Patient arrives | Reception clicks "Arrive" | `appointment_status = Arrived`, `arrival_time` set |
| Doctor sees patient | — | **No HMS signal** (consultation_status stays null, Act. Cons. Start Time stays empty) |
| **Doctor finishes** | Reception **opens bill** as a manual confirmation | **`bill.open_date` set** ← this is our visit-end trigger |
| Patient pays | Could be same day or weeks later (insurance) | `bill.status` Open → Closed → Finalized |
| (formal discharge) | **Not used** at Enjab | All bills say "Not Discharged" |
| (formal visit close) | **Not used** at Enjab | `Visit Closed Time` is always empty |

**Implication:** the only reliable visit-end signal at this clinic is `bill.open_date`.

## Endpoint catalog

### Bills

```
GET /pages/BillDischarge/BillList.do
    ?_method=getBills
    &status=A|C|F                  (Active / Closed / Finalized — pick one or repeat)
    &visit_type=i&visit_type=o     (IP / OP — repeat for both)
    &creditnote=N
    &sortOrder=open_date&sortReverse=true
    &date_range=today|week|month
    &title=<UI title>
```

- Returns HTML, table `#resultTable`, columns: `MR No`, `Visit ID`, `Patient Name`, `Bill No`, `Bill Type`, `Claim Status`, **`Open Date`**, amounts, `Sponsor`, `Discharge Status`.
- Each `<tr>` has `onclick="… {mrNo, billNo, visitId, visit_id, patient_id, bill_type, bill_no, visit_type, …}"` — extract directly, no per-row API call needed for `mrNo`/`billNo`/`visitId`/`visit_type`.
- Patient name visible cell is truncated; the full name lives in `label[title]`.
- Open Date format: `DD-MM-YYYY HH:mm` (Asia/Dubai local).

### Patient details (JSON)

```
POST /pages/registration/regUtils.do?_method=getPatientDetailsJSON&mrno=<MR>
```

Returns `application/x-json`. Top-level keys include `patient`, `pVisitBean`, `previousDocVisits`, `patientLastIpVisit`, `nationalIds`, `consultation_status`, `send_sms`, `send_email`. All discharge fields (`disch_date`, `discharge_time`, `patient_discharge_status`) are **not used** at Enjab — they stay null/N.

Useful `patient.*` fields for automations:

| Field | Use |
|---|---|
| `full_name` | Personalization |
| `patient_phone` | E.164 already (`+971…`); WhatsApp-ready |
| `patient_email` | For email channel |
| `custom_list8_value` | **HIE Consent** (Riayati/Malaffi data-sharing) — NOT messaging consent |
| `admitted_dept_name` | Filter by department |
| `visit_type` | `o` (OP) or `i` (IP) |
| `reg_date` (epoch ms) | First registration |

Useful top-level fields:

| Field | Use |
|---|---|
| `send_sms` | `"Y"`/`"N"` — global SMS consent (correct gate for messaging) |
| `send_email` | `"Y"`/`"N"` — global email consent |
| `consultation_status` | Always null at Enjab — don't rely on |
| `lastVisitId`, `activeIPVisitId`, `lastVisitIdInThisCenter` | Linking to most-recent visit |

### OP Visits list

```
GET /outpatient/OpListAction.do?_method=list&status=A&status=P&visit_status=A&date_range=week
```

Columns: `MR No`, `Name`, `Visit Time`, `Est Cons. Start`, **`Act Cons. Start`** (always empty here), `Appointment Time`, `Complaint`, `Department`, `Doctor`, `Triage Done`, `Visit Mode`. Each row's `onclick` includes `consultation_id`, `patient_id`, `doctor_id`, `mr_no`. Useful for "what visits are queued today" but **not** for visit-end detection.

### Appointments — TODAY

```
GET /pages/resourcescheduler/todaysappointments.do
    ?_method=getTodaysPatientAppointments
    &startTime=today
    &resFilter=ALL
    &appoint_status=Booked&appoint_status=Confirmed&appoint_status=Arrived
    &appoint_status=Closed&appoint_status=Cancelled&appoint_status=NoShow
```

22-column table including: `Date`, `Time`, `Arrival Time`, `MR No`, `Visit Id`, `Name`, **`Mobile No` (already in list — no patient JSON lookup needed!)**, `Appointment Type`, `Primary Resource (doctor)`, `Bill Status` (`Okay` / `Payment Due` / `-`), `Visit Closed Time` (always empty here), `Visit Mode`. Each row's `onclick` has `appointment_id`, `appointment_status`, `mr_no`, `appointment_patientcontact`, `appointment_patientname`.

Statuses present at Enjab: `Booked`, `Arrived`. Not seen: `Closed`, `NoShow`, `Cancelled` (probably exist but rare).

### Appointments — for a specific date

`startTime=today` is special-cased. **Passing `startTime=30-04-2026` returns today's data** — the `_method=getTodaysPatientAppointments` ignores arbitrary dates. To get tomorrow's appointments we'll need a different method (likely `getSearchScreen` on `appointments.do` with date params) — not yet identified.

### Registration form (read-only inspection)

```
GET /pages/registration/outPatientRegistration.do?_method=getdetails
GET /pages/registration/IpRegistration.do?_method=getdetails
GET /pages/registration/editvisitdetails.do?_method=getEditVisitScreen&ps_status=active
```

Reveals the *labels* attached to custom fields. For Enjab:

| Field id | Label |
|---|---|
| `custom_list1_value` | Remarks |
| `custom_list4_value` | Blood Group |
| **`custom_list8_value`** | **HIE Consent** (options: `Global Opt-In`, `Global Opt-Out`) |
| custom_list2/3/5/6/7/9 | (unused / blank labels) |

`send_sms` / `send_email` are NOT in the registration form — they're set in a separate "Edit Communication Settings" UI (the SPA referenced this).

## Triggers we can build today

| # | Automation | Trigger source | Filter (data we have) | Notes |
|---|---|---|---|---|
| 1 | Post-visit rating | `BillList.do` polls Open Bills, fires at `open_date + 60min` | `visit_type='o'`, `send_sms='Y'`, phone present, idempotency key `bill_no` | Already have all data |
| 2 | Appointment reminder (tomorrow) | `todaysappointments.do` for tomorrow at 10:00 cron | `appoint_status in {Booked,Confirmed}`, has phone in row | **Blocked** until we find the by-date endpoint |
| 3 | Appointment confirmation (2h before) | poll today's appointments at boot, schedule per row | same, `appoint_status='Booked'` | Phone is in the list — no patient JSON needed |
| 4 | No-show follow-up | poll today's appointments hourly, watch for `appoint_status='NoShow'` | not previously sent for this `appointment_id` | |
| 5 | Outstanding-balance reminder | poll Closed/Finalized bills, gate on `Pat Due > 0` and N days since `open_date` | `send_sms='Y'`, phone | Closed bills list confirmed working |
| 6 | Lab/result-ready notification | EMR endpoint not yet probed | TBD | Future |

## What we ruled out / can't use

- `disch_date`, `discharge_time`, `patient_discharge_status`, `Visit Closed Time` → all empty at Enjab; clinic doesn't use the discharge feature.
- `consultation_status`, `Act Cons. Start Time` → not populated; can't detect when doctor started/finished.
- `custom_list8_value` (HIE Consent) → wrong field for messaging gate; ignore for our purposes.

## Open questions for the user

1. Confirm `send_sms = "Y"` is the right opt-in gate. If yes, default behavior reaches ~all patients (good) and per-patient overrides are honored.
2. Confirm IP visits are rare/unused at Enjab — sample shows zero IP open bills today. If correct, scope v1 to OP only.
3. Reception's "Edit Communication Settings" UI — anyone using it actively? If they routinely turn off SMS for some patients, the gate works as intended; if it's never touched, it's an admin-only switch.
