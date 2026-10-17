import type {
  Hospital,
  QueueRow,
  AdminOverview,
  IntakeResult,
  IntakeSummary,
  BedCategoryCount,
  ResourceItem,
  RecentDecision,
  DeclineReason,
  ResourceAvailability,
  ScoreBreakdown,
  StaffUser,
  EmergencyCardRow,
  OcrRecord,
} from '@/types';
import hospitalsData from '../../hospitals.json';

// In-memory data store for local edge simulation when remote Edge Function is unconfigured/404

const HOSP1_ID = '00000000-0000-4000-8000-000000000001';
const HOSP2_ID = '00000000-0000-4000-8000-000000000002';

// 1. Hospitals mapped from hospitals.json
export const LOCAL_HOSPITALS: Hospital[] = hospitalsData.map((h, i) => {
  const id =
    i === 0 ? HOSP1_ID
    : i === 1 ? HOSP2_ID
    : `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  return {
    id,
    name: h.name,
    area: h.area,
    city: h.city,
    lat: h.lat,
    lng: h.lng,
    specialties: ['General Medicine', 'Emergency Care', 'Toxicology'],
    icu_beds_available: h.beds?.icu ?? 10,
    ventilators_available: h.equipment?.ventilators ?? 5,
    emergency_capable: Boolean(h.capabilities?.emergency),
    queue_length: Math.floor(Math.random() * 8) + 2,
  };
});

// 2. Staff accounts
interface StoredStaff {
  id: string;
  username: string;
  password: string;
  role: 'DOCTOR' | 'RECEPTION' | 'ADMIN' | 'HOSPITAL_DESK';
  display_name: string;
  hospital_id: string;
  hospital_name: string;
}

const LOCAL_STAFF: StoredStaff[] = [
  {
    id: 'u-doc-1',
    username: 'doctor1',
    password: 'demo123',
    role: 'DOCTOR',
    display_name: 'Dr. Sharma (AIIMS OPD)',
    hospital_id: HOSP1_ID,
    hospital_name: 'Demo General Hospital 01',
  },
  {
    id: 'u-desk-1',
    username: 'desk1',
    password: 'demo123',
    role: 'HOSPITAL_DESK',
    display_name: 'Desk Officer Verma (AIIMS Emergency)',
    hospital_id: HOSP1_ID,
    hospital_name: 'Demo General Hospital 01',
  },
  {
    id: 'u-doc-2',
    username: 'doctor2',
    password: 'demo123',
    role: 'DOCTOR',
    display_name: 'Dr. Patel (Safdarjung OPD)',
    hospital_id: HOSP2_ID,
    hospital_name: 'Demo Medical Institute 02',
  },
  {
    id: 'u-adm-1',
    username: 'admin1',
    password: 'demo123',
    role: 'ADMIN',
    display_name: 'Superintendent Rao (Safdarjung)',
    hospital_id: HOSP2_ID,
    hospital_name: 'Demo Medical Institute 02',
  },
  {
    id: 'u-rec-1',
    username: 'reception1',
    password: 'demo123',
    role: 'RECEPTION',
    display_name: 'Reception Desk 1',
    hospital_id: HOSP1_ID,
    hospital_name: 'Demo General Hospital 01',
  },
];

// 3. Bed Inventories
const LOCAL_BEDS: Record<string, BedCategoryCount[]> = {
  [HOSP1_ID]: [
    { type: 'ICU', available: 8, total: 40, held: 1, updated_at: new Date().toISOString() },
    { type: 'EMERGENCY', available: 12, total: 25, held: 1, updated_at: new Date().toISOString() },
    { type: 'MATERNITY', available: 6, total: 15, held: 0, updated_at: new Date().toISOString() },
    { type: 'GENERAL', available: 35, total: 80, held: 2, updated_at: new Date().toISOString() },
  ],
  [HOSP2_ID]: [
    { type: 'ICU', available: 15, total: 100, held: 0, updated_at: new Date().toISOString() },
    { type: 'EMERGENCY', available: 20, total: 40, held: 1, updated_at: new Date().toISOString() },
    { type: 'MATERNITY', available: 10, total: 30, held: 0, updated_at: new Date().toISOString() },
    { type: 'GENERAL', available: 60, total: 150, held: 3, updated_at: new Date().toISOString() },
  ],
};

// 4. Resource statuses
const LOCAL_RESOURCES: Record<string, ResourceItem[]> = {
  [HOSP1_ID]: [
    { id: 'res-1', name: 'blood_bank_o_neg', category: 'SUPPLY', status: 'AVAILABLE', updated_at: new Date().toISOString() },
    { id: 'res-2', name: 'ct_scanner_32_slice', category: 'EQUIPMENT', status: 'AVAILABLE', updated_at: new Date().toISOString() },
    { id: 'res-3', name: 'cath_lab_cardiac', category: 'EQUIPMENT', status: 'AVAILABLE', updated_at: new Date().toISOString() },
    { id: 'res-4', name: 'emergency_surgery_or', category: 'EQUIPMENT', status: 'AVAILABLE', updated_at: new Date().toISOString() },
  ],
  [HOSP2_ID]: [
    { id: 'res-5', name: 'blood_bank_o_neg', category: 'SUPPLY', status: 'LOW', updated_at: new Date().toISOString() },
    { id: 'res-6', name: 'ct_scanner_32_slice', category: 'EQUIPMENT', status: 'AVAILABLE', updated_at: new Date().toISOString() },
    { id: 'res-7', name: 'cath_lab_cardiac', category: 'EQUIPMENT', status: 'AVAILABLE', updated_at: new Date().toISOString() },
    { id: 'res-8', name: 'emergency_surgery_or', category: 'EQUIPMENT', status: 'AVAILABLE', updated_at: new Date().toISOString() },
  ],
};

// 5. Seed Queue Entries
const localQueue: (QueueRow & { hospital_id: string })[] = [
  {
    id: 'q-entry-1',
    token: 'Q-101',
    status: 'WAITING',
    position: 1,
    triage_level: 'URGENT',
    patient_label: 'Rajesh Kumar, 54M',
    abha_id: '91-1234-5678-9012',
    phone: '+919876543210',
    waiting_minutes: 18,
    priority_score: 88,
    score_breakdown: {
      urgency: 50,
      red_flag: 15,
      vulnerability: 10,
      waiting_minutes: 18,
      waiting_points: 13,
      total: 88,
      red_flag_reasons: ['Substernal discomfort', 'Shortness of breath'],
      vulnerability_reasons: ['Type-2 Diabetes Mellitus'],
    },
    summary: {
      chief_complaint: 'Substernal chest tightness radiating to left arm for 45 min',
      duration: '45 minutes',
      severity: 8,
      relevant_history: ['Type-2 Diabetes (7 yrs)', 'Hypertension'],
    },
    source_tags: [
      { claim: 'chest pain radiating to arm', source: 'voice' },
      { claim: 'takes Metformin 500mg', source: 'history' },
    ],
    followup_answers: [
      { question: 'Does the pain worsen with exertion or deep breaths?', answer: 'Worse with minimal exertion, feeling cold sweat' },
      { question: 'Any prior history of heart attacks?', answer: 'No prior MI, but brother had angioplasty' },
    ],
    prior_history: {
      conditions: ['Diabetes Mellitus Type 2', 'Hypertension'],
      medicines: ['Metformin 500mg', 'Amlodipine 5mg'],
      past_visits: ['Cardiology OPD (3 mo ago)', 'Routine Health Check (6 mo ago)'],
      ocr_prescriptions: [],
    },
    ocr_records: [
      {
        file: 'prescription_dr_sen.jpg',
        date: '2026-08-14',
        header: 'Cardiology Clinic, AIIMS',
        medicines: [
          { name: 'Metformin HCl', dosage: '500 mg BD', ocr_confidence: 94, needs_review: false },
          { name: 'Amlodipine Besylate', dosage: '5 mg OD', ocr_confidence: 91, needs_review: false },
          { name: 'Atorvastatin', dosage: '20 mg HS', ocr_confidence: 76, needs_review: true },
        ],
      },
    ],
    transcript: 'Mujhe pichle 45 minute se seene mein dard aur jalan ho rahi hai. Dard baye haath mein bhi ja raha hai aur paseena aa raha hai.',
    created_at: new Date(Date.now() - 18 * 60000).toISOString(),
    hospital_id: HOSP1_ID,
  },
  {
    id: 'q-entry-2',
    token: 'Q-102',
    status: 'WAITING',
    position: 2,
    triage_level: 'ROUTINE',
    patient_label: 'Pooja Verma, 28F',
    abha_id: '91-9876-5432-1098',
    phone: '+919812345678',
    waiting_minutes: 8,
    priority_score: 26,
    score_breakdown: {
      urgency: 20,
      red_flag: 0,
      vulnerability: 0,
      waiting_minutes: 8,
      waiting_points: 6,
      total: 26,
      red_flag_reasons: [],
      vulnerability_reasons: [],
    },
    summary: {
      chief_complaint: 'Dry cough and mild sore throat for 3 days',
      duration: '3 days',
      severity: 3,
      relevant_history: ['Seasonal allergic rhinitis'],
    },
    source_tags: [
      { claim: 'dry cough 3 days', source: 'voice' },
      { claim: 'mild low-grade fever 99F', source: 'voice' },
    ],
    followup_answers: [
      { question: 'Any difficulty breathing or chest pain?', answer: 'No breathing trouble, only throat irritation' },
    ],
    prior_history: {
      conditions: ['Allergic rhinitis'],
      medicines: ['Levocetirizine 5mg PRN'],
      past_visits: ['ENT OPD (last year)'],
      ocr_prescriptions: [],
    },
    transcript: 'Gale mein kharash hai aur teen din se sukhi khansi chal rahi hai. Bukhar jaisa lag raha hai.',
    created_at: new Date(Date.now() - 8 * 60000).toISOString(),
    hospital_id: HOSP1_ID,
  },
  {
    id: 'q-entry-3',
    token: 'Q-201',
    status: 'WAITING',
    position: 1,
    triage_level: 'URGENT',
    patient_label: 'Amit Sharma, 42M',
    abha_id: null,
    phone: '+919988776655',
    waiting_minutes: 12,
    priority_score: 59,
    score_breakdown: {
      urgency: 50,
      red_flag: 0,
      vulnerability: 0,
      waiting_minutes: 12,
      waiting_points: 9,
      total: 59,
      red_flag_reasons: [],
      vulnerability_reasons: [],
    },
    summary: {
      chief_complaint: 'Acute severe right lower quadrant abdominal pain for 6 hours',
      duration: '6 hours',
      severity: 7,
      relevant_history: ['Nausea, 1 episode vomiting'],
    },
    source_tags: [{ claim: 'RLQ abdominal pain', source: 'voice' }],
    followup_answers: [{ question: 'Is the pain continuous or crampy?', answer: 'Continuous, hurts more when walking' }],
    transcript: 'Pet ke baye taraf niche bohot tej dard ho raha hai subah se.',
    created_at: new Date(Date.now() - 12 * 60000).toISOString(),
    hospital_id: HOSP2_ID,
  },
];

// 6. Emergency Requests
const localEmergencies: (EmergencyCardRow & { hospital_id: string })[] = [
  {
    id: 'emg-001',
    kind: 'AMBULANCE',
    status: 'BROADCASTING',
    patient_label: 'Emergency Patient #108-A',
    created_at: new Date(Date.now() - 3 * 60000).toISOString(),
    target_deadline_at: new Date(Date.now() + 57 * 1000).toISOString(),
    current_target_hospital_id: HOSP1_ID,
    accepted_hospital_id: null,
    emergency_types: ['ICU Bed', 'CT Scanner', 'Emergency Surgery'],
    eta_minutes: 14,
    summary: {
      chief_complaint: 'Road traffic accident, blunt head trauma with loss of consciousness',
      duration: '25 min',
      severity: 10,
      relevant_history: ['GCS ~ 9, left pupil sluggish'],
    },
    transcript: 'Accident hua hai Ring Road par, sir par chot aayi hai, behosh hai!',
    suggestion: 'CAN_ACCEPT',
    suggestion_reasons: ['ICU bed available (8)', 'CT Scanner functional', 'General surgeon on call'],
    hospital_id: HOSP1_ID,
  },
  {
    id: 'emg-002',
    kind: 'ABHA_FAMILY',
    status: 'BROADCASTING',
    patient_label: 'Emergency Patient #108-B',
    created_at: new Date(Date.now() - 2 * 60000).toISOString(),
    target_deadline_at: new Date(Date.now() + 45 * 1000).toISOString(),
    current_target_hospital_id: HOSP2_ID,
    accepted_hospital_id: null,
    emergency_types: ['ICU Bed', 'Blood Bank (O-neg)'],
    eta_minutes: 9,
    summary: {
      chief_complaint: 'Severe hematemesis and active GI bleeding',
      duration: '30 min',
      severity: 9,
      relevant_history: ['Chronic liver disease'],
    },
    transcript: 'Khoon ki ulti ho rahi hai, BP kam lag raha hai!',
    suggestion: 'CHECK_NEEDED',
    suggestion_reasons: ['Blood Bank O-neg stock is LOW at your hospital', 'ICU bed available (15)'],
    hospital_id: HOSP2_ID,
  },
];

// 7. Recent Decisions Log
const localDecisions: Record<string, RecentDecision[]> = {
  [HOSP1_ID]: [
    {
      id: 'dec-1',
      request_id: 'emg-000-prev',
      patient_label: 'Patient #108-981',
      decision: 'ACCEPTED',
      reason: 'ICU bed reserved, trauma team notified',
      timestamp: new Date(Date.now() - 40 * 60000).toISOString(),
    },
  ],
  [HOSP2_ID]: [
    {
      id: 'dec-2',
      request_id: 'emg-000-prev2',
      patient_label: 'Patient #108-950',
      decision: 'DECLINED',
      reason: 'no specialist (Neurosurgeon occupied in OR)',
      timestamp: new Date(Date.now() - 85 * 60000).toISOString(),
    },
  ],
};

// 8. Audit Log
const localAuditLog: { id: string; ts: string; role: string; action: string; patient_ref: string; is_break_glass?: boolean; details: Record<string, unknown> | null }[] = [
  {
    id: 'aud-1',
    ts: new Date(Date.now() - 50 * 60000).toISOString(),
    role: 'DOCTOR',
    action: 'KEY_UNLOCK',
    patient_ref: 'doctor1',
    is_break_glass: false,
    details: { method: 'passphrase' },
  },
];

// Token verification helper
function decodeToken(token: string | null): StoredStaff | null {
  if (!token) return null;
  try {
    const raw = atob(token);
    const parsed = JSON.parse(raw);
    const staff = LOCAL_STAFF.find((s) => s.username === parsed.username);
    return staff ?? null;
  } catch {
    // If not a JSON base64, check by username match
    const staff = LOCAL_STAFF.find((s) => token.includes(s.username));
    return staff ?? null;
  }
}

function computeScore(
  triageFloor: string,
  transcript: string,
  answers: { question: string; answer: string }[],
  priorConditions: string[] = [],
  waitingMinutes = 0,
): { score: number; breakdown: ScoreBreakdown } {
  const urgency = triageFloor === 'URGENT' ? 50 : 20;

  const redFlags: string[] = [];
  const fullText = (transcript + ' ' + answers.map((a) => a.answer).join(' ')).toLowerCase();
  if (fullText.includes('chest pain') || fullText.includes('seene') || fullText.includes('dard')) redFlags.push('Chest discomfort');
  if (fullText.includes('breath') || fullText.includes('saas') || fullText.includes('shortness')) redFlags.push('Respiratory distress');
  if (fullText.includes('bleed') || fullText.includes('khoon')) redFlags.push('Active bleeding');
  if (fullText.includes('unconscious') || fullText.includes('behosh')) redFlags.push('Altered sensorium');

  const red_flag = redFlags.length * 15;

  const vulnReasons: string[] = [];
  for (const c of priorConditions) {
    if (/diabetes|hypertension|cardiac|kidney|cancer/i.test(c)) vulnReasons.push(c);
  }
  const vulnerability = vulnReasons.length * 10;

  const waiting_points = Math.min(20, Math.floor(waitingMinutes * 0.75));
  const total = urgency + red_flag + vulnerability + waiting_points;

  return {
    score: total,
    breakdown: {
      urgency,
      red_flag,
      vulnerability,
      waiting_minutes: waitingMinutes,
      waiting_points,
      total,
      red_flag_reasons: redFlags,
      vulnerability_reasons: vulnReasons,
    },
  };
}

// -------------------------------------------------------------
// LOCAL EDGE DISPATCHER
// -------------------------------------------------------------
export async function handleLocalBackend<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  token: string | null,
): Promise<T> {
  // Simulate standard network latency (30-60ms)
  await new Promise((r) => setTimeout(r, 40));

  // 1. PUBLIC: Hospitals List
  if (path === '/hospitals/list') {
    return { hospitals: LOCAL_HOSPITALS } as unknown as T;
  }

  // 2. PUBLIC: Patient Lookup (ABHA)
  if (path === '/patient/lookup') {
    const abhaId = String(body.abha_id || '').trim();
    if (abhaId === '91-1234-5678-9012') {
      return {
        patient: {
          name: 'Rajesh Kumar',
          conditions: ['Type-2 Diabetes Mellitus', 'Hypertension'],
          medicines: ['Metformin 500mg BD', 'Amlodipine 5mg OD'],
          past_visits: ['Cardiology OPD (Aug 2026)', 'Endocrinology Checkup (Jun 2026)'],
          ocr_prescriptions: [],
        },
      } as unknown as T;
    }
    if (abhaId === '91-9876-5432-1098') {
      return {
        patient: {
          name: 'Pooja Verma',
          conditions: ['Seasonal Allergic Rhinitis'],
          medicines: ['Levocetirizine 5mg PRN'],
          past_visits: ['ENT OPD (2025)'],
          ocr_prescriptions: [],
        },
      } as unknown as T;
    }
    // Generic valid ABHA
    return {
      patient: {
        name: 'Simulated Patient',
        conditions: ['Mild Asthma'],
        medicines: ['Salbutamol Inhaler PRN'],
        past_visits: ['General Medicine (2025)'],
        ocr_prescriptions: [],
      },
    } as unknown as T;
  }

  // 3. PUBLIC: Queue Submit (Green / Yellow path)
  if (path === '/queue/submit') {
    const hospital_id = String(body.hospital_id || HOSP1_ID);
    const triage_floor = String(body.triage_floor || 'ROUTINE');
    const transcript = String(body.transcript || '');
    const answers = (body.followup_answers as { question: string; answer: string }[]) || [];
    const prior = body.prior_history as { conditions?: string[] } | undefined;
    const intake = body.intake as IntakeResult | undefined;
    const ocr = (body.ocr_records as OcrRecord[]) || [];

    const { score, breakdown } = computeScore(triage_floor, transcript, answers, prior?.conditions ?? [], 0);
    const tokenStr = `Q-${Math.floor(100 + Math.random() * 899)}`;
    const entryId = `q-local-${Date.now()}`;

    const newEntry: QueueRow & { hospital_id: string } = {
      id: entryId,
      token: tokenStr,
      status: 'WAITING',
      position: localQueue.filter((q) => q.hospital_id === hospital_id).length + 1,
      triage_level: triage_floor,
      patient_label: body.phone ? `Patient (${body.phone})` : (body.abha_id ? `ABHA (${body.abha_id})` : 'Walk-in Patient'),
      abha_id: (body.abha_id as string) || null,
      phone: (body.phone as string) || null,
      waiting_minutes: 0,
      priority_score: score,
      score_breakdown: breakdown,
      summary: intake?.summary ?? {
        chief_complaint: transcript.slice(0, 80) || 'Routine clinical assessment',
        duration: '1 day',
        severity: triage_floor === 'URGENT' ? 7 : 3,
        relevant_history: prior?.conditions ?? [],
      },
      source_tags: intake?.source_tags ?? [{ claim: transcript.slice(0, 40), source: 'voice' }],
      followup_answers: answers,
      prior_history: prior ? { conditions: prior.conditions ?? [], medicines: [], past_visits: [], ocr_prescriptions: [] } : null,
      ocr_records: ocr,
      transcript,
      created_at: new Date().toISOString(),
      hospital_id,
    };

    localQueue.push(newEntry);

    return {
      token: tokenStr,
      entry_id: entryId,
      position: newEntry.position ?? 1,
      estimated_wait_minutes: (newEntry.position ?? 1) * 8,
    } as unknown as T;
  }

  // 4. PUBLIC: Queue Status
  if (path === '/queue/status') {
    const entry_id = String(body.entry_id || '');
    const match = localQueue.find((q) => q.id === entry_id) ?? localQueue[0];
    return {
      token: match?.token ?? 'Q-101',
      position: match?.position ?? 1,
      total: localQueue.length,
      estimated_wait_minutes: (match?.position ?? 1) * 8,
      triage_level: match?.triage_level ?? 'ROUTINE',
    } as unknown as T;
  }

  // 5. AI INTAKE SIMULATION
  if (path === '/intake') {
    const transcript = String(body.transcript || '').toLowerCase();
    const floor = String(body.triage_floor || 'ROUTINE');
    const answers = (body.followup_answers as { question: string; answer: string }[]) || [];

    const isEmergency =
      transcript.includes('chest pain') ||
      transcript.includes('seene') ||
      transcript.includes('unconscious') ||
      transcript.includes('behosh') ||
      transcript.includes('heavy bleeding');

    if (isEmergency) {
      return {
        triage_level: 'EMERGENCY',
        emergency_reason: 'Red-flag clinical symptoms detected (severe chest pain / altered consciousness / bleeding)',
        summary: {
          chief_complaint: transcript.slice(0, 80) || 'Acute emergency symptoms',
          duration: 'Sudden onset',
          severity: 9,
          relevant_history: [],
        },
        source_tags: [{ claim: 'Acute distress detected', source: 'voice' }],
        followup_question: null,
        mock: true,
      } as unknown as T;
    }

    let followupQ: string | null = null;
    if (answers.length === 0) {
      followupQ = 'How long have you had these symptoms, and have you taken any medication today?';
    } else if (answers.length === 1) {
      followupQ = 'Are you experiencing any shortness of breath, dizziness, or high fever?';
    }

    return {
      triage_level: floor === 'URGENT' ? 'URGENT' : 'ROUTINE',
      emergency_reason: null,
      summary: {
        chief_complaint: transcript.slice(0, 100) || 'General health consultation',
        duration: '1-3 days',
        severity: floor === 'URGENT' ? 6 : 3,
        relevant_history: [],
      },
      source_tags: [{ claim: transcript.slice(0, 40) || 'Reported symptoms', source: 'voice' }],
      followup_question: followupQ,
      mock: true,
    } as unknown as T;
  }

  // 6. PUBLIC: Emergency Create (Red Path)
  if (path === '/emergency/create') {
    const reqId = `emg-${Date.now()}`;
    const targetHosp = LOCAL_HOSPITALS[0];

    const newEmg: EmergencyCardRow & { hospital_id: string } = {
      id: reqId,
      kind: (body.kind as string) || 'ABHA_FAMILY',
      status: 'BROADCASTING',
      patient_label: `Emergency Walk-in (#${reqId.slice(-4)})`,
      created_at: new Date().toISOString(),
      target_deadline_at: new Date(Date.now() + 60 * 1000).toISOString(),
      current_target_hospital_id: targetHosp.id,
      accepted_hospital_id: null,
      emergency_types: ['ICU Bed', 'Emergency Surgery'],
      eta_minutes: 11,
      summary: {
        chief_complaint: 'Immediate trauma / cardiac emergency response requested',
        duration: 'Acute onset',
        severity: 9,
        relevant_history: [],
      },
      suggestion: 'CAN_ACCEPT',
      suggestion_reasons: ['ICU beds available in emergency ward', 'Trauma team available'],
      hospital_id: targetHosp.id,
    };

    localEmergencies.unshift(newEmg);

    return {
      request_id: reqId,
      candidates: LOCAL_HOSPITALS.slice(0, 4).map((h, idx) => ({
        id: h.id,
        name: h.name,
        address: `${h.area}, ${h.city}`,
        distance_km: Number((1.2 + idx * 2.3).toFixed(1)),
        estimated: false,
      })),
    } as unknown as T;
  }

  if (path === '/emergency/status') {
    const requestId = String(body.request_id || '');
    const found = localEmergencies.find((e) => e.id === requestId);
    const target = LOCAL_HOSPITALS.find((h) => h.id === found?.current_target_hospital_id) ?? LOCAL_HOSPITALS[0];
    const accepted = LOCAL_HOSPITALS.find((h) => h.id === found?.accepted_hospital_id);

    return {
      status: found?.status ?? 'BROADCASTING',
      target_name: target.name,
      target_address: `${target.area}, ${target.city}`,
      deadline_at: found?.target_deadline_at ?? new Date(Date.now() + 45000).toISOString(),
      accepted_name: accepted?.name ?? null,
      accepted_address: accepted ? `${accepted.area}, ${accepted.city}` : null,
    } as unknown as T;
  }

  if (path === '/emergency/answers') {
    return {
      ok: true,
      summary: {
        triage_level: 'EMERGENCY',
        emergency_reason: 'Family-reported red flags',
        summary: {
          chief_complaint: 'Family assisted emergency triage',
          duration: 'Acute',
          severity: 9,
          relevant_history: [],
        },
        source_tags: [{ claim: 'family response', source: 'voice' }],
        followup_question: null,
        mock: true,
      },
    } as unknown as T;
  }

  if (path === '/emergency/retry') {
    return { ok: true } as unknown as T;
  }

  // -------------------------------------------------------------
  // STAFF AUTH & DASHBOARD
  // -------------------------------------------------------------
  if (path === '/staff/login') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();

    const staff = LOCAL_STAFF.find((s) => s.username === username);
    if (!staff || staff.password !== password) {
      throw new Error('Invalid credentials. Use preset password "demo123"');
    }

    const payload = {
      sub: staff.id,
      username: staff.username,
      role: staff.role,
      hospital_id: staff.hospital_id,
      exp: Date.now() + 86400000,
    };
    const signedToken = btoa(JSON.stringify(payload));

    const user: StaffUser = {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      display_name: staff.display_name,
      hospital_id: staff.hospital_id,
      hospital_name: staff.hospital_name,
    };

    return { token: signedToken, user } as unknown as T;
  }

  // Require staff auth token for subsequent /staff endpoints
  const currentUser = decodeToken(token);
  if (!currentUser) {
    throw new Error('Unauthorized: Staff session expired or token missing');
  }

  // STAFF QUEUE (Strict Hospital Isolation)
  if (path === '/staff/queue') {
    const hospitalQueue = localQueue
      .filter((q) => q.hospital_id === currentUser.hospital_id)
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    return { queue: hospitalQueue } as unknown as T;
  }

  // STAFF ENTRY DETAIL (Strict Hospital Isolation)
  if (path === '/staff/entry') {
    const id = String(body.id || '');
    const entry = localQueue.find((q) => q.id === id);
    if (!entry) throw new Error('Encounter record not found');
    if (entry.hospital_id !== currentUser.hospital_id) {
      throw new Error('Access denied: Record belongs to another hospital facility');
    }
    return { entry } as unknown as T;
  }

  // STAFF APPROVE
  if (path === '/staff/approve') {
    const id = String(body.id || '');
    const entry = localQueue.find((q) => q.id === id);
    if (!entry) throw new Error('Record not found');
    if (entry.hospital_id !== currentUser.hospital_id) throw new Error('Access denied');

    entry.status = 'APPROVED';
    entry.approved_by = currentUser.username;
    entry.approved_at = new Date().toISOString();
    if (body.summary) {
      entry.summary = body.summary as IntakeSummary;
    }

    localAuditLog.unshift({
      id: `aud-${Date.now()}`,
      ts: new Date().toISOString(),
      role: currentUser.role,
      action: 'DOCTOR_APPROVE',
      patient_ref: entry.token,
      is_break_glass: false,
      details: { doctor: currentUser.username, entry_id: id },
    });

    return {
      ok: true,
      approved_by: entry.approved_by,
      approved_at: entry.approved_at,
    } as unknown as T;
  }

  // STAFF OVERRIDE
  if (path === '/staff/override') {
    const id = String(body.id || '');
    const level = String(body.triage_level || '');
    const reason = String(body.reason || '').trim();

    if (!reason) {
      throw new Error('Priority override requires a mandatory clinical justification');
    }

    const entry = localQueue.find((q) => q.id === id);
    if (!entry) throw new Error('Record not found');
    if (entry.hospital_id !== currentUser.hospital_id) throw new Error('Access denied');

    entry.triage_level = level;
    entry.override_reason = reason;
    const base = level === 'EMERGENCY' ? 80 : level === 'URGENT' ? 50 : 20;
    entry.priority_score = base + (entry.score_breakdown?.red_flag ?? 0) + (entry.score_breakdown?.vulnerability ?? 0) + (entry.score_breakdown?.waiting_points ?? 0);

    localAuditLog.unshift({
      id: `aud-${Date.now()}`,
      ts: new Date().toISOString(),
      role: currentUser.role,
      action: 'PRIORITY_OVERRIDE',
      patient_ref: entry.token,
      is_break_glass: false,
      details: { new_level: level, reason },
    });

    return { ok: true } as unknown as T;
  }

  // STAFF ADMIN / EMERGENCY DESK OVERVIEW
  if (path === '/staff/admin/overview') {
    const hospId = currentUser.hospital_id;
    const myHosp = LOCAL_HOSPITALS.find((h) => h.id === hospId) ?? LOCAL_HOSPITALS[0];
    const myEmergencies = localEmergencies.filter((e) => e.hospital_id === hospId);
    const otherEmergencies = localEmergencies.filter((e) => e.hospital_id !== hospId).length;
    const beds = LOCAL_BEDS[hospId] ?? LOCAL_BEDS[HOSP1_ID];
    const resources = LOCAL_RESOURCES[hospId] ?? LOCAL_RESOURCES[HOSP1_ID];
    const decisions = localDecisions[hospId] ?? [];

    const overview: AdminOverview = {
      hospital: {
        id: myHosp.id,
        name: myHosp.name,
        city: myHosp.city,
        area: myHosp.area,
        icu_beds_available: myHosp.icu_beds_available,
        ventilators_available: myHosp.ventilators_available,
        queue_length: myHosp.queue_length,
        specialists_on_duty: ['Dr. Sharma (Cardio)', 'Dr. Verma (Trauma)'],
        blood_stock: { 'O+': 8, 'O-': 3, 'A+': 6 },
      },
      my_emergencies: myEmergencies,
      other_emergencies_count: otherEmergencies,
      held_beds_count: beds.reduce((sum, b) => sum + (b.held || 0), 0),
      recent_decisions: decisions,
      beds,
      resources,
      legs: [],
    };

    return overview as unknown as T;
  }

  // STAFF ADMIN BED UPDATE (Non-negative guard)
  if (path === '/staff/admin/beds') {
    const hospId = currentUser.hospital_id;
    const bedType = body.bed_type as BedCategoryCount['type'];
    const delta = Number(body.delta) || 0;

    const beds = LOCAL_BEDS[hospId] ?? LOCAL_BEDS[HOSP1_ID];
    const target = beds.find((b) => b.type === bedType);
    if (!target) throw new Error('Bed category not found');

    if (target.available + delta < 0) {
      throw new Error(`Available beds cannot be negative (current: ${target.available})`);
    }

    target.available += delta;
    target.updated_at = new Date().toISOString();

    return { ok: true, beds } as unknown as T;
  }

  // STAFF ADMIN RESOURCE UPDATE
  if (path === '/staff/admin/resource-status') {
    const hospId = currentUser.hospital_id;
    const resourceId = String(body.resource_id);
    const status = body.status as ResourceAvailability;

    const resources = LOCAL_RESOURCES[hospId] ?? LOCAL_RESOURCES[HOSP1_ID];
    const target = resources.find((r) => r.id === resourceId);
    if (target) {
      target.status = status;
      target.updated_at = new Date().toISOString();
    }

    return { ok: true, resources } as unknown as T;
  }

  // EMERGENCY RESPOND (ACCEPT / DECLINE)
  if (path === '/emergency/respond') {
    const hospId = currentUser.hospital_id;
    const requestId = String(body.request_id);
    const action = String(body.action);
    const reason = String(body.reason || '');

    const emg = localEmergencies.find((e) => e.id === requestId);
    if (!emg) throw new Error('Emergency request not found');

    if (action === 'ACCEPT') {
      if (emg.status === 'ACCEPTED') {
        throw new Error('This emergency request was already accepted by another facility');
      }
      emg.status = 'ACCEPTED';
      emg.accepted_hospital_id = hospId;

      // Reserve bed in inventory
      const beds = LOCAL_BEDS[hospId] ?? LOCAL_BEDS[HOSP1_ID];
      const icuBed = beds.find((b) => b.type === 'EMERGENCY' || b.type === 'ICU');
      if (icuBed && icuBed.available > 0) {
        icuBed.available -= 1;
      }

      if (!localDecisions[hospId]) localDecisions[hospId] = [];
      localDecisions[hospId].unshift({
        id: `dec-${Date.now()}`,
        request_id: requestId,
        patient_label: emg.patient_label,
        decision: 'ACCEPTED',
        reason: 'Bed reserved in emergency unit',
        timestamp: new Date().toISOString(),
      });

      return { ok: true, status: 'ACCEPTED' } as unknown as T;
    }

    if (action === 'DECLINE') {
      const validReasons: DeclineReason[] = ['no bed', 'no specialist', 'no equipment', 'other'];
      const matched = validReasons.some((r) => reason.startsWith(r));
      if (!matched) {
        throw new Error('Invalid decline reason. Must be selected from authoritative list.');
      }

      emg.status = 'DECLINED_ALL';

      if (!localDecisions[hospId]) localDecisions[hospId] = [];
      localDecisions[hospId].unshift({
        id: `dec-${Date.now()}`,
        request_id: requestId,
        patient_label: emg.patient_label,
        decision: 'DECLINED',
        reason,
        timestamp: new Date().toISOString(),
      });

      return { ok: true, status: 'DECLINED' } as unknown as T;
    }
  }

  // AUDIT LOG
  if (path === '/staff/audit') {
    return { log: localAuditLog } as unknown as T;
  }

  if (path === '/staff/audit/log') {
    localAuditLog.unshift({
      id: `aud-${Date.now()}`,
      ts: new Date().toISOString(),
      role: currentUser.role,
      action: String(body.action || 'GENERAL_ACTION'),
      patient_ref: String(body.patient_ref || ''),
      is_break_glass: Boolean(body.is_break_glass),
      details: (body.details as Record<string, unknown>) ?? null,
    });
    return { ok: true } as unknown as T;
  }

  // ASV PLAN & REQUEST
  if (path === '/asv/plan') {
    return {
      transfer_request_id: `asv-${Date.now()}`,
      plan: {
        status: 'PLAN_READY',
        move_mode: 'MOVE_MEDICINE',
        move_reason: 'Optimal transit time for medicine courier vs patient travel distress',
        sources: [
          {
            batch_id: 'batch-01',
            hospital_id: HOSP1_ID,
            hospital_name: 'Demo General Hospital 01',
            batch_code: 'DEMO-ASV-h001',
            vials: Number(body.vials_needed) || 2,
            travel_minutes: 18,
            km: 4.2,
            estimated: false,
            freshness: 'FRESH',
            toxicology_24x7: true,
          },
        ],
        excluded_old: [],
        warnings: [],
        estimated_any: false,
      },
    } as unknown as T;
  }

  if (path === '/asv/request') {
    return { ok: true, legs: 1, deadline_at: new Date(Date.now() + 600000).toISOString() } as unknown as T;
  }

  if (path === '/asv/status') {
    return {
      request: { id: String(body.transfer_request_id), status: 'DISPATCHED', vials_needed: 2, move_mode: 'MOVE_MEDICINE', patient_ref: 'EMG' },
      legs: [{ id: 'leg-1', source_hospital_id: HOSP1_ID, vials: 2, status: 'IN_TRANSIT', deadline_at: null, sequence_no: 1 }],
      custody_events: [{ id: 'cust-1', event: 'DISPATCH', location_name: 'AIIMS Pharmacy', actor: 'Courier Express', at: new Date().toISOString() }],
      current_location: 'In transit on Ring Road',
      transit_minutes: 12,
      cold_chain_ok: true,
      warnings: [],
    } as unknown as T;
  }

  return { ok: true } as unknown as T;
}
