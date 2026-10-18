# 🏥 Swasthya Setu 2.0

## One Health Journey. One Intelligent Health Record.

> **Healthcare in your language — from first symptom to the right care.**

Swasthya Setu 2.0 is an AI-assisted healthcare coordination platform designed to connect **patients, doctors, hospitals and health records** into one continuous journey.

Instead of treating every hospital visit as a new beginning, Swasthya Setu creates a structured health journey:

**Patient → AI Intake → Triage → Doctor Validation → Referral → Hospital → Longitudinal Health Record**

The system is designed especially for situations where language barriers, long queues, fragmented medical records and delayed referrals make healthcare difficult to navigate.

---

## 🎯 The Problem

Healthcare journeys are often fragmented.

A patient may have to:

- Explain the same symptoms repeatedly
- Struggle with language or medical terminology
- Wait in long queues without knowing priority
- Carry physical prescriptions and reports
- Visit different hospitals without continuity
- Face delays during emergencies
- Depend on staff to manually interpret and organize information

At the same time, doctors receive incomplete or unstructured information.

### Swasthya Setu aims to solve this by creating a common digital layer between:

**Patient ↔️ Doctor ↔️ Hospital ↔️ Health Records**

---

# 💡 Our Solution

Swasthya Setu converts a patient's natural-language or voice-based description into a structured clinical case that can be reviewed by a doctor.

### The core principle:

> **AI drafts. Doctors decide.**

AI is used for:

- Voice/text intake
- Clinical information extraction
- Controlled follow-up questions
- Red-flag detection
- Deterministic priority scoring
- OCR-based report extraction
- Hospital recommendation

The final clinical decision remains with the healthcare professional.

---

# 🔄 End-to-End Workflow

```mermaid
flowchart TD

    A[👤 Patient] --> B[🌐 Language Selection]
    B --> C[🪪 ABHA / New Patient]
    C --> D[🎙️ Voice / Text Intake]

    D --> E[🤖 AI Intake Engine]

    E --> F[🛡️ Safety & Red-Flag Detection]

    F -->|Emergency| G[🚨 Emergency Flow]
    F -->|Routine / Urgent| H[📋 Structured Case Sheet]

    H --> I[📊 Priority Score]

    I --> J[🏥 Doctor Queue]

    J --> K[👨‍⚕️ Doctor Validation]

    K --> L[📄 Clinical Summary]
    K --> M[🧾 OCR Medical Records]

    K --> N{Care Required?}

    N -->|No| O[🏠 Continue Care]
    N -->|Yes| P[🏥 Hospital Recommendation]

    P --> Q[🔄 Digital Referral]

    Q --> R[🏥 Receiving Hospital]

    R --> S[📍 Continued Care]

    S --> T[🧬 Unified Health Timeline]

    G --> U[🚑 Emergency Broadcast]
    U --> V[🏥 Nearby Hospitals]
    U --> W[📞 108 / 112 Fallback]

    T --> A
