# Swasthya Setu (स्वास्थ्य सेतु)

Voice-first multilingual triage and emergency coordination hackathon prototype for patient intake, hospital queue management, and live emergency dispatch.

> **Demo Data: Simulated.** All patient records, hospital bed numbers, and emergency alerts are synthetic.

---

## 🚀 How to Run

### Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- npm v9+

### 1. Install & Start Everything
```bash
npm install
npm run dev
```
`npm run dev` starts both the Express local backend (port `8787`) and the Vite React frontend (port `5173`) concurrently. Vite automatically proxies `/api/*` to `http://localhost:8787`.

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8787

### 2. Run Smoke Tests
```bash
npm run smoke
```
Executes the automated end-to-end verification script testing the 4 required demo paths:
1. Green patient gets token and priority score.
2. Patient mentioning chest pain ("seene mein dard" / "सीने में दर्द") is deterministically escalated to RED.
3. Emergency broadcast sent to top 3 capable hospitals, one declines, another accepts, others cancelled.
4. Flipping antivenom to `out` removes that hospital from snakebite requests.

### 3. Run Unit Tests
```bash
npm test
```
Runs pure unit tests for `server/scoring.ts` (base scores, moderate red-flag bonus, age/pregnancy/chronic risk, wait-time calculation).

---

## ⚙️ Environment Variables

Create `.env` (or copy from `.env.example`):
```env
GEMINI_API_KEY=
DEMO_TIMEOUT_SECONDS=20
DEMO_OTP=1234
```
*Note: The app works completely even if `GEMINI_API_KEY` is empty or the API fails. Deterministic triage rules, question banks, and templates ensure 100% reliable functionality.*

---

## 📡 API Endpoint Reference

All endpoints return JSON. Errors are formatted as `{ "error": { "code": "...", "message": "..." } }`.

### 1. Hospitals & Public Lookups
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/hospitals?lat&lng` | Returns hospitals ranked best first with distance, queue length, ICU beds, and recommendation reason. |
| `POST` | `/api/patient/lookup` | Synthetic ABHA patient lookup (e.g. `91-1234-5678-9012`). |
| `POST` | `/api/otp/verify` | Accepts `DEMO_OTP` (default: `1234`). |

### 2. Triage & Patient Queue (Green/Yellow Flow)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/intake` | Deterministic red-flag keyword rules (EN, Hinglish, Devanagari). Returns `{ escalated_colour, reasons, tags, followup_question, done }`. Max 3 follow-ups. Escalate-only. |
| `POST` | `/api/queue/submit` | Computes score via pure `scoring.ts`, creates token (e.g. `T-102`) and returns `{ entry_id, token, position, score, breakdown }`. |
| `GET` | `/api/queue/status?entry_id` | Returns `{ position, total, eta_min, colour, score, token }`. |

### 3. Clinician & Doctor Queue
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/doctor/queue?hospital_id` | Entries sorted by current score descending. Recomputes waiting time (+1 per 5m) on every call. Returns breakdown, review flags, summary, and transcript. |
| `POST` | `/api/doctor/override` | `{ entry_id, new_colour, reason }`. Reason is mandatory; doctor can escalate or reprioritise. |
| `POST` | `/api/doctor/approve` | `{ entry_id, edited_summary }`. Saves doctor-approved intake summary. |

### 4. Emergency Coordination (Red Flow & Hospital Desk)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/emergency/create` | Hard-filters capable hospitals (resource status not "out", ICU/OT/ventilators), ranks by distance, broadcasts to top 3 candidates. |
| `POST` | `/api/emergency/answers` | Attaches up to 3 open follow-up answers to alert without delaying broadcast. |
| `GET` | `/api/emergency/status?request_id` | Returns `{ status, accepted_hospital, round, seconds_left, fallback }`. First accept wins; handles timeout and 108 fallback. |
| `POST` | `/api/emergency/retry` | Retries broadcast round. |
| `GET` | `/api/desk/incoming?hospital_id` | Incoming emergency cards with ETA, summary, transcript, and suggestion badge (`can_accept` or `check_needed`) with reasons. |
| `POST` | `/api/desk/respond` | `{ request_id, hospital_id, action: accept\|decline, reason? }`. Decline reason picker (`no_bed`, `no_specialist`, `no_equipment`, `other`). Accept holds 1 bed for 30 mins. Conflict (409) if already accepted. |

### 5. Hospital Resource Management & Live Demo Control
| Method | Endpoint | Description |
|---|---|---|
| `PATCH` | `/api/hospital/resources` | `{ hospital_id, resource, status: available\|low\|out }`. Marks values older than 60m as stale. |
| `PATCH` | `/api/hospital/beds` | `{ hospital_id, bed_type, available }`. Updates available ICU/general beds. |
| `POST` | `/api/demo/reset` | Resets all in-memory store state to fresh seed. |
| `POST` | `/api/demo/flip` | `{ hospital_id, resource, status }`. Live demo flip for testing instant exclusion of depleted resources. |

---

## 🎬 4-Step Hackathon Demo Script

### Step 1: Routine (Green) Intake & Doctor Queue
1. Open http://localhost:5173.
2. Click **English** or **हिन्दी** (or toggle anytime via Header).
3. Allow location or enter manual PIN code (e.g. `110001`).
4. Select **Routine check-up (Green)**:
   - Enter synthetic ABHA ID: `91-1234-5678-9012` (loads Ramesh Kumar, prior hypertension/diabetes).
   - Click **Recommend a hospital for me** → Best hospital selected with distance & ICU capacity badge.
   - Describe complaint via mic or type: *"I have had mild joint pain for 3 days"*.
   - Answer the open follow-up questions (voice or text).
   - Submit → Token `T-102` issued with live wait time and position.
5. Click **Staff Login** in header:
   - Select **Doctor** role and hospital → Enter Dashboard.
   - Notice live OPD queue updating every 3 seconds.
   - Expand **Priority Score Breakdown** (Base + Age + Chronic + Wait time).
   - Inspect side-by-side **AI Draft Summary** and **Raw Patient Transcript**.
   - Test **Override Priority** (e.g. to `YELLOW` with mandatory clinical note) or **Approve**.

### Step 2: Deterministic Red-Flag Escalation
1. Start a new Routine check-up (Green path).
2. In the symptom input, type or speak:
   - *"Doctor, I have severe chest pain and left arm numbness"* (or Hinglish *"seene mein dard"* or Hindi *"सीने में दर्द"*).
3. Tap Submit:
   - Notice the system immediately intercepts and escalates the patient to **Emergency (Red)** with reasons displayed.
   - The LLM never decides priority — deterministic keyword rules safeguard patient safety.

### Step 3: Emergency (Red) Flow & Admissions Desk
1. On Home Screen, tap the big red **Emergency** button.
2. Notice **Call Ambulance** and **Call 108** work immediately without any login or delay.
3. Type or speak: *"Bitten by a snake on left leg while working in the field"*.
4. Tap **Call Ambulance** / **Send Emergency Request**:
   - Alert broadcasts immediately to top 3 capable hospitals.
   - Live status card displays 20-second response countdown.
   - Up to 3 open clinician questions appear one by one with voice and text answer options.
5. In another tab or via Staff Login, open **Hospital Desk** for candidate hospital:
   - Notice incoming emergency card with **SUGGESTION: CAN ACCEPT** and distance ETA.
   - Click **Accept Emergency** → Holds 1 ICU bed for 30 minutes.
   - Return to patient tab: card immediately updates to green **Accepted by [Hospital]** with address!

### Step 4: Resource Depletion & Live Demo Flip
1. In Hospital Desk view, observe the Bed Counts & Critical Resources panel (ICU beds, Antivenom ASV, Thrombolysis).
2. Under "Live Demo Quick Flip", click **Flip Antivenom to "OUT"**.
3. Now create a new snakebite emergency request.
4. Notice that the hospital with ASV marked "out" is immediately excluded from the capable candidate broadcast list!

---

## 🔒 Architecture & Safety Principles
- **LLM Safety**: Deterministic code alone determines priority scores, triage colours, and hospital eligibility.
- **Escalation Direction**: Priority strictly escalates upward (`GREEN` → `YELLOW` → `RED`).
- **No Yes/No Buttons**: Patient follow-ups are open voice or text queries.
- **Pure Scoring**: Prioritization algorithm implemented as an isolated, unit-tested pure function (`server/scoring.ts`).

## Team

Swasthya Setu 2.0 is developed by a collaborative team working across
AI/triage, backend/security, patient experience, and staff/hospital workflows.
