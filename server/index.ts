import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { store, haversine, HospitalRecord } from './store';
import { calculateScore, ScoreBreakdown } from './scoring';
import { evaluateTriage, QUESTION_BANK } from './triage_rules';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const DEMO_OTP = process.env.DEMO_OTP || '1234';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper error response
function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

// Check emergency timeouts periodically
setInterval(() => {
  store.checkEmergencyTimeouts();
}, 2000);

// ==================== STAGE 1: GREEN / YELLOW FLOW + DOCTOR QUEUE ====================

/**
 * GET /api/hospitals?lat&lng (also POST /api/hospitals/list)
 */
function handleHospitalsList(req: Request, res: Response) {
  const lat = parseFloat((req.query.lat as string) || (req.body?.lat as string) || '28.6139');
  const lng = parseFloat((req.query.lng as string) || (req.body?.lng as string) || '77.2090');

  const scored = store.hospitals.map((h) => {
    const km = haversine({ lat, lng }, { lat: h.lat, lng: h.lng });
    const distPts = Math.max(0, 50 - km * 2);
    const queuePts = Math.max(0, 30 - h.queue_length * 1.5);
    const bedPts = Math.min(20, h.beds.available_icu * 2);
    const totalScore = distPts + queuePts + bedPts;

    const reason = `${km.toFixed(1)} km away, ${h.queue_length} in queue, ${h.beds.available_icu} ICU beds free`;

    return {
      id: h.hospital_id,
      hospital_id: h.hospital_id,
      name: h.name,
      area: h.area,
      city: h.city,
      lat: h.lat,
      lng: h.lng,
      ownership: h.ownership,
      distance_km: Math.round(km * 10) / 10,
      queue_length: h.queue_length,
      icu_beds_available: h.beds.available_icu,
      ventilators_available: h.equipment.ventilators,
      emergency_capable: h.capabilities.emergency,
      specialties: ['General Medicine', 'Emergency', 'ICU', 'Cardiology'],
      recommendation_reason: reason,
      recommendation_score: totalScore,
      is_recommended: false,
    };
  });

  // Sort best first
  scored.sort((a, b) => b.recommendation_score - a.recommendation_score);
  if (scored.length > 0) {
    scored[0].is_recommended = true;
  }

  return res.json({
    hospitals: scored,
  });
}

app.get('/api/hospitals', handleHospitalsList);
app.post('/api/hospitals/list', handleHospitalsList);
app.get('/api/hospitals/list', handleHospitalsList);

/**
 * POST /api/intake
 * Deterministic red-flag evaluation + question bank. Escalate-only.
 */
app.post('/api/intake', async (req: Request, res: Response) => {
  const {
    language = 'en-IN',
    transcript = '',
    answers = [],
    colour = 'GREEN',
    triage_floor,
    followup_answers,
  } = req.body;

  const currentColour: 'GREEN' | 'YELLOW' | 'RED' =
    triage_floor === 'URGENT' ? 'YELLOW' :
    triage_floor === 'EMERGENCY' ? 'RED' :
    colour === 'YELLOW' || colour === 'URGENT' ? 'YELLOW' :
    colour === 'RED' || colour === 'EMERGENCY' ? 'RED' : 'GREEN';

  const combinedAnswers = followup_answers || answers || [];

  const evaluation = evaluateTriage({
    currentColour,
    transcript,
    answers: combinedAnswers,
    language,
  });

  // Deterministic summary
  const summary = {
    chief_complaint: transcript.slice(0, 100) || 'General health consultation',
    duration: combinedAnswers[0]?.answer || 'Recent onset',
    severity: evaluation.escalated_colour === 'RED' ? 9 : evaluation.escalated_colour === 'YELLOW' ? 6 : 3,
    relevant_history: evaluation.tags,
  };

  const triageLevel =
    evaluation.escalated_colour === 'RED' ? 'EMERGENCY' :
    evaluation.escalated_colour === 'YELLOW' ? 'URGENT' : 'ROUTINE';

  const sourceTags = evaluation.tags.map((tag) => ({
    claim: tag,
    source: 'voice' as const,
  }));

  return res.json({
    escalated_colour: evaluation.escalated_colour,
    reasons: evaluation.reasons,
    tags: evaluation.tags,
    followup_question: evaluation.followup_question,
    done: evaluation.done,
    // Compatibility fields with existing frontend
    triage_level: triageLevel,
    emergency_reason: evaluation.reasons[0] || null,
    summary,
    source_tags: sourceTags,
    mock: true,
  });
});

/**
 * POST /api/emergency-summary (legacy endpoint compatibility)
 */
app.post('/api/emergency-summary', (req: Request, res: Response) => {
  const { transcript = '', language = 'en-IN' } = req.body;
  const evaluation = evaluateTriage({
    currentColour: 'RED',
    transcript,
    language,
  });
  return res.json({
    triage_level: 'EMERGENCY',
    emergency_reason: evaluation.reasons[0] || 'Emergency distress reported',
    summary: {
      chief_complaint: transcript.slice(0, 100) || 'Acute emergency',
      duration: 'Immediate',
      severity: 10,
      relevant_history: evaluation.tags,
    },
    source_tags: evaluation.tags.map((t) => ({ claim: t, source: 'voice' })),
    followup_question: evaluation.followup_question,
    mock: true,
  });
});

/**
 * POST /api/queue/submit
 */
app.post('/api/queue/submit', (req: Request, res: Response) => {
  const {
    hospital_id,
    colour = 'GREEN',
    phone,
    name,
    abha_id,
    language = 'en-IN',
    transcript = '',
    answers = [],
    followup_answers = [],
    triage_floor,
    prior_history,
  } = req.body;

  const targetHospital = store.hospitals.find((h) => h.hospital_id === hospital_id);
  if (!targetHospital) {
    return sendError(res, 404, 'NOT_FOUND', `Hospital ${hospital_id} not found`);
  }

  const determinedColour: 'GREEN' | 'YELLOW' | 'RED' =
    colour === 'RED' || triage_floor === 'EMERGENCY' ? 'RED' :
    colour === 'YELLOW' || triage_floor === 'URGENT' ? 'YELLOW' : 'GREEN';

  // Check patient details
  const patient = abha_id ? store.patients.get(abha_id) : undefined;
  const patientName = name || patient?.name || (phone ? `Patient (${phone.slice(-4)})` : 'New Patient');
  const patientAge = patient?.age ?? 35;
  const isPregnant = !!patient?.is_pregnant;
  const hasChronic = !!(patient?.conditions && patient.conditions.length > 0) || !!prior_history;

  // Run evaluation
  const evaluation = evaluateTriage({
    currentColour: determinedColour,
    transcript,
    answers: followup_answers.length ? followup_answers : answers,
    language,
  });

  const finalColour = evaluation.escalated_colour;
  const hasModerateRedFlag = evaluation.tags.length > 0 && finalColour !== 'GREEN';

  const scoreResult = calculateScore({
    colour: finalColour,
    hasModerateRedFlag,
    age: patientAge,
    isPregnant,
    hasChronicCondition: hasChronic,
    waitingMinutes: 0,
  });

  store.tokenCounter += 1;
  const token = `T-${store.tokenCounter}`;
  const entryId = `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const reviewFlags: string[] = [];
  if (patientAge < 5) reviewFlags.push('Child < 5 years');
  if (patientAge >= 60) reviewFlags.push('Elderly >= 60 years');
  if (isPregnant) reviewFlags.push('Pregnant');
  if (hasChronic) reviewFlags.push('Chronic condition history');
  if (hasModerateRedFlag) reviewFlags.push('Moderate red-flag symptom reported');

  const allAnswers = followup_answers.length ? followup_answers : answers;

  const entry = {
    entry_id: entryId,
    token,
    hospital_id,
    colour: finalColour,
    phone,
    name: patientName,
    abha_id,
    language,
    transcript,
    answers: allAnswers,
    tags: evaluation.tags,
    reasons: evaluation.reasons,
    draft_summary: {
      chief_complaint: transcript.slice(0, 100) || 'Routine clinical assessment',
      duration: allAnswers[0]?.answer || '1-2 days',
      severity: finalColour === 'RED' ? 9 : finalColour === 'YELLOW' ? 6 : 3,
      relevant_history: patient?.conditions || [],
    },
    created_at: Date.now(),
    score: scoreResult.total,
    breakdown: scoreResult.breakdown,
    status: 'WAITING' as const,
    review_flags: reviewFlags,
  };

  store.queue.set(entryId, entry);
  targetHospital.queue_length += 1;

  // Compute position
  const hospitalWaiting = Array.from(store.queue.values())
    .filter((e) => e.hospital_id === hospital_id && e.status === 'WAITING')
    .sort((a, b) => b.score - a.score || a.created_at - b.created_at);

  const position = Math.max(1, hospitalWaiting.findIndex((e) => e.entry_id === entryId) + 1);
  const estimatedWaitMinutes = position * 10;

  return res.json({
    entry_id: entryId,
    token,
    position,
    score: scoreResult.total,
    breakdown: scoreResult.breakdown,
    // Compatibility fields
    estimated_wait_minutes: estimatedWaitMinutes,
    status_token: entryId,
    triage_level: finalColour === 'YELLOW' ? 'URGENT' : finalColour === 'RED' ? 'EMERGENCY' : 'ROUTINE',
  });
});

/**
 * GET /api/queue/status?entry_id
 */
function handleQueueStatus(req: Request, res: Response) {
  const entryId = (req.query.entry_id as string) || (req.body?.entry_id as string) || (req.body?.status_token as string);
  if (!entryId) {
    return sendError(res, 400, 'BAD_REQUEST', 'entry_id is required');
  }

  const entry = store.queue.get(entryId);
  if (!entry) {
    return sendError(res, 404, 'NOT_FOUND', 'Queue entry not found');
  }

  // Recompute wait time and score
  const waitMin = Math.floor((Date.now() - entry.created_at) / (60 * 1000));
  const hasModerateRedFlag = entry.tags.length > 0 && entry.colour !== 'GREEN';
  const patient = entry.abha_id ? store.patients.get(entry.abha_id) : undefined;
  const scoreResult = calculateScore({
    colour: entry.colour,
    hasModerateRedFlag,
    age: patient?.age,
    isPregnant: patient?.is_pregnant,
    hasChronicCondition: (patient?.conditions?.length ?? 0) > 0,
    waitingMinutes: waitMin,
  });
  entry.score = scoreResult.total;
  entry.breakdown = scoreResult.breakdown;

  const hospitalWaiting = Array.from(store.queue.values())
    .filter((e) => e.hospital_id === entry.hospital_id && e.status === 'WAITING')
    .sort((a, b) => b.score - a.score || a.created_at - b.created_at);

  const position = Math.max(1, hospitalWaiting.findIndex((e) => e.entry_id === entryId) + 1);
  const total = hospitalWaiting.length;
  const etaMin = position * 10;

  return res.json({
    entry_id: entry.entry_id,
    token: entry.token,
    position,
    total,
    eta_min: etaMin,
    colour: entry.colour,
    score: entry.score,
    breakdown: entry.breakdown,
    // Compatibility fields
    estimated_wait_minutes: etaMin,
    triage_level: entry.colour === 'YELLOW' ? 'URGENT' : entry.colour === 'RED' ? 'EMERGENCY' : 'ROUTINE',
  });
}

app.get('/api/queue/status', handleQueueStatus);
app.post('/api/queue/status', handleQueueStatus);

/**
 * GET /api/doctor/queue?hospital_id (also POST /api/staff/queue)
 */
function handleDoctorQueue(req: Request, res: Response) {
  const hospitalId = (req.query.hospital_id as string) || (req.body?.hospital_id as string) || 'h01';

  const entries = Array.from(store.queue.values())
    .filter((e) => !hospitalId || e.hospital_id === hospitalId);

  // Recompute waiting time on every call
  const now = Date.now();
  for (const entry of entries) {
    const waitMin = Math.floor((now - entry.created_at) / (60 * 1000));
    const hasModerateRedFlag = entry.tags.length > 0 && entry.colour !== 'GREEN';
    const patient = entry.abha_id ? store.patients.get(entry.abha_id) : undefined;
    const scoreResult = calculateScore({
      colour: entry.colour,
      hasModerateRedFlag,
      age: patient?.age,
      isPregnant: patient?.is_pregnant,
      hasChronicCondition: (patient?.conditions?.length ?? 0) > 0,
      waitingMinutes: waitMin,
    });
    entry.score = scoreResult.total;
    entry.breakdown = scoreResult.breakdown;
  }

  // Sort by score descending, tie break: earlier arrival first
  entries.sort((a, b) => b.score - a.score || a.created_at - b.created_at);

  const formatted = entries.map((e, idx) => ({
    id: e.entry_id,
    entry_id: e.entry_id,
    token: e.token,
    hospital_id: e.hospital_id,
    colour: e.colour,
    triage_level: e.colour === 'YELLOW' ? 'URGENT' : e.colour === 'RED' ? 'EMERGENCY' : 'ROUTINE',
    patient_label: e.name || 'Patient',
    abha_id: e.abha_id || null,
    score: e.score,
    breakdown: e.breakdown,
    tags: e.tags,
    review_flags: e.review_flags,
    summary: e.draft_summary,
    draft_summary: e.draft_summary,
    transcript: e.transcript,
    answers: e.answers,
    status: e.status,
    position: idx + 1,
    doctor_override: e.doctor_override,
    approved_by: e.approved_by,
    approved_at: e.approved_at,
  }));

  return res.json({
    queue: formatted,
    entries: formatted,
  });
}

app.get('/api/doctor/queue', handleDoctorQueue);
app.post('/api/doctor/queue', handleDoctorQueue);
app.get('/api/staff/queue', handleDoctorQueue);
app.post('/api/staff/queue', handleDoctorQueue);

/**
 * POST /api/doctor/override
 */
function handleDoctorOverride(req: Request, res: Response) {
  const { entry_id, id, new_colour, triage_level, reason } = req.body;
  const targetId = entry_id || id;
  const targetColour = (new_colour || triage_level || '').toUpperCase();

  if (!targetId) {
    return sendError(res, 400, 'BAD_REQUEST', 'entry_id is required');
  }
  if (!reason || !reason.trim()) {
    return sendError(res, 400, 'REASON_MANDATORY', 'Override reason is mandatory');
  }
  if (!['GREEN', 'YELLOW', 'RED', 'ROUTINE', 'URGENT', 'EMERGENCY'].includes(targetColour)) {
    return sendError(res, 400, 'BAD_COLOUR', 'Invalid colour level');
  }

  const entry = store.queue.get(targetId);
  if (!entry) {
    return sendError(res, 404, 'NOT_FOUND', 'Entry not found');
  }

  const mappedColour: 'GREEN' | 'YELLOW' | 'RED' =
    targetColour === 'EMERGENCY' || targetColour === 'RED' ? 'RED' :
    targetColour === 'URGENT' || targetColour === 'YELLOW' ? 'YELLOW' : 'GREEN';

  entry.doctor_override = {
    original_colour: entry.colour,
    new_colour: mappedColour,
    reason: reason.trim(),
    overridden_at: new Date().toISOString(),
  };
  entry.colour = mappedColour;

  // Recompute score
  const waitMin = Math.floor((Date.now() - entry.created_at) / (60 * 1000));
  const scoreResult = calculateScore({
    colour: entry.colour,
    hasModerateRedFlag: entry.colour !== 'GREEN',
    waitingMinutes: waitMin,
  });
  entry.score = scoreResult.total;
  entry.breakdown = scoreResult.breakdown;

  return res.json({
    ok: true,
    entry,
  });
}

app.post('/api/doctor/override', handleDoctorOverride);
app.post('/api/staff/override', handleDoctorOverride);

/**
 * POST /api/doctor/approve
 */
function handleDoctorApprove(req: Request, res: Response) {
  const { entry_id, id, edited_summary, summary } = req.body;
  const targetId = entry_id || id;

  if (!targetId) {
    return sendError(res, 400, 'BAD_REQUEST', 'entry_id is required');
  }

  const entry = store.queue.get(targetId);
  if (!entry) {
    return sendError(res, 404, 'NOT_FOUND', 'Entry not found');
  }

  if (edited_summary) {
    entry.draft_summary = { ...entry.draft_summary, ...edited_summary };
  } else if (summary) {
    entry.draft_summary = { ...entry.draft_summary, ...summary };
  }

  const approvedBy = 'Dr. Demo (Staff ID #42)';
  const approvedAt = new Date().toISOString();

  entry.status = 'APPROVED';
  entry.approved_by = approvedBy;
  entry.approved_at = approvedAt;

  return res.json({
    ok: true,
    approved_by: approvedBy,
    approved_at: approvedAt,
    entry,
  });
}

app.post('/api/doctor/approve', handleDoctorApprove);
app.post('/api/staff/approve', handleDoctorApprove);

/**
 * GET /api/staff/entry
 */
app.post('/api/staff/entry', (req: Request, res: Response) => {
  const id = req.body?.id;
  const entry = store.queue.get(id);
  if (!entry) return sendError(res, 404, 'NOT_FOUND', 'Entry not found');

  return res.json({
    entry: {
      id: entry.entry_id,
      token: entry.token,
      patient_label: entry.name,
      abha_id: entry.abha_id,
      summary: entry.draft_summary,
      transcript: entry.transcript,
      triage_level: entry.colour === 'YELLOW' ? 'URGENT' : entry.colour === 'RED' ? 'EMERGENCY' : 'ROUTINE',
      source_tags: entry.tags.map((t) => ({ claim: t, source: 'voice' })),
      approved_by: entry.approved_by,
      approved_at: entry.approved_at,
    },
  });
});

/**
 * POST /api/otp/verify
 */
app.post('/api/otp/verify', (req: Request, res: Response) => {
  const { otp, phone } = req.body;
  if (!otp || String(otp).trim() !== DEMO_OTP) {
    return sendError(res, 400, 'INVALID_OTP', `Invalid OTP. Demo OTP is ${DEMO_OTP}`);
  }
  return res.json({
    ok: true,
    verified: true,
    phone,
  });
});

/**
 * POST /api/patient/lookup
 */
app.post('/api/patient/lookup', (req: Request, res: Response) => {
  const { abha_id } = req.body;
  if (!abha_id) return res.json({ patient: null });

  const p = store.patients.get(abha_id);
  if (!p) return res.json({ patient: null });

  return res.json({
    patient: {
      name: p.name,
      age: p.age,
      gender: p.gender,
      conditions: p.conditions,
      medicines: p.medicines,
      allergies: p.allergies,
      past_visits: p.past_visits,
      ocr_prescriptions: [],
    },
  });
});

/**
 * Staff Login & Admin endpoints (demo compatibility)
 */
app.post('/api/staff/login', (req: Request, res: Response) => {
  const { username = 'doctor1', role = 'DOCTOR', hospital_id = 'h01' } = req.body;
  const displayName = role === 'RECEPTION' ? 'Desk Officer Rao' : 'Dr. A. Sharma (Cardiology)';

  return res.json({
    token: 'demo-staff-token-xyz',
    user: {
      id: 'staff-01',
      username,
      role,
      display_name: displayName,
      hospital_id,
    },
  });
});

app.post('/api/staff/admin/overview', (_req: Request, res: Response) => {
  const h = store.hospitals[0];
  return res.json({
    hospital: {
      id: h.hospital_id,
      name: h.name,
      city: h.city,
      area: h.area,
      icu_beds_available: h.beds.available_icu,
      ventilators_available: h.equipment.ventilators,
      queue_length: h.queue_length,
      specialists_on_duty: ['Dr. A. Sharma', 'Dr. V. Rao', 'Dr. K. Patel'],
      blood_stock: { 'O-': 4, 'A+': 12, 'B+': 9, 'AB+': 3 },
    },
    my_emergencies: [],
    other_emergencies_count: 0,
    legs: [],
  });
});

app.post('/api/staff/audit', (_req: Request, res: Response) => {
  return res.json({ log: [] });
});

app.post('/api/staff/reorder', (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

app.post('/api/staff/ocr', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    record: {
      file: 'prescription.jpg',
      date: new Date().toISOString(),
      medicines: [{ name: 'Paracetamol', dosage: '500mg', ocr_confidence: 0.95, needs_review: false }],
    },
  });
});

app.post('/api/ocr', (_req: Request, res: Response) => {
  return res.json({
    medicines: [{ name: 'Amlodipine', dosage: '5mg', ocr_confidence: 0.92, needs_review: false }],
    header: 'Demo Clinic',
    warnings: [],
    mock: true,
  });
});

app.post('/api/maps/geocode', (req: Request, res: Response) => {
  return res.json({
    result: {
      lat: 28.6139,
      lng: 77.2090,
      label: req.body?.query || 'New Delhi',
      estimated: true,
    },
  });
});

// ==================== STAGE 2: RED FLOW + HOSPITAL DESK + RESOURCE FINDER ====================

/**
 * POST /api/emergency/create
 * Hard filter hospitals, rank by distance, broadcast to top 3.
 */
app.post('/api/emergency/create', (req: Request, res: Response) => {
  const {
    emergency_types = [],
    lat = 28.6139,
    lng = 77.2090,
    transcript = '',
    phone,
    kind,
  } = req.body;

  // Determine emergency types if not explicitly sent
  let types = [...emergency_types];
  if (types.length === 0 && transcript) {
    const evalResult = evaluateTriage({ currentColour: 'RED', transcript });
    types = evalResult.tags;
  }
  if (types.length === 0) {
    types = ['general_emergency'];
  }

  // Filter capable hospitals
  const capable = store.getCapableHospitals(types, lat, lng);
  const top3 = capable.slice(0, 3).map((item) => ({
    hospital_id: item.hospital.hospital_id,
    hospital_name: item.hospital.name,
    address: `${item.hospital.area}, ${item.hospital.city}`,
    distance_km: Math.round(item.distance_km * 10) / 10,
    status: 'pending' as const,
  }));

  const requestId = `emg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const emergency: any = {
    request_id: requestId,
    emergency_types: types,
    lat,
    lng,
    transcript,
    answers: [],
    phone,
    status: 'broadcasting',
    round: 1,
    round_started_at: Date.now(),
    candidates: top3,
    fallback: false,
    created_at: Date.now(),
    summary: {
      chief_complaint: transcript.slice(0, 100) || `${types.join(', ')} emergency alert`,
      duration: 'Immediate',
      severity: 10,
      relevant_history: types,
    },
  };

  store.emergencies.set(requestId, emergency);

  return res.json({
    request_id: requestId,
    status: 'broadcasting',
    round: 1,
    candidates: top3.map((c) => ({
      id: c.hospital_id,
      name: c.hospital_name,
      address: c.address,
      distance_km: c.distance_km,
      status: c.status,
      estimated: true,
    })),
  });
});

/**
 * POST /api/emergency/answers
 * Attaches follow-up answers, updates summary without delaying alert.
 */
app.post('/api/emergency/answers', (req: Request, res: Response) => {
  const { request_id, transcript = '', answers = [], free_text, language = 'en-IN' } = req.body;
  const emergency = store.emergencies.get(request_id);

  if (!emergency) {
    return sendError(res, 404, 'NOT_FOUND', 'Emergency request not found');
  }

  const newAnswers = answers.length ? answers : [];
  if (free_text) {
    newAnswers.push({ question: 'Details', answer: free_text });
  }

  emergency.answers.push(...newAnswers);
  if (transcript) {
    emergency.transcript = emergency.transcript ? `${emergency.transcript} ${transcript}` : transcript;
  }

  // Update summary
  const evalResult = evaluateTriage({
    currentColour: 'RED',
    transcript: emergency.transcript || '',
    answers: emergency.answers,
    language,
  });

  const summary = {
    chief_complaint: emergency.transcript?.slice(0, 100) || `${emergency.emergency_types.join(', ')} report`,
    duration: 'Immediate',
    severity: 10,
    relevant_history: evalResult.tags,
  };
  emergency.summary = summary;

  return res.json({
    ok: true,
    summary: {
      triage_level: 'EMERGENCY',
      emergency_reason: evalResult.reasons[0] || 'Emergency report',
      summary,
      source_tags: evalResult.tags.map((t) => ({ claim: t, source: 'voice' })),
      followup_question: evalResult.followup_question,
      mock: true,
    },
  });
});

/**
 * GET /api/emergency/status?request_id
 */
function handleEmergencyStatus(req: Request, res: Response) {
  const requestId = (req.query.request_id as string) || (req.body?.request_id as string);
  if (!requestId) return sendError(res, 400, 'BAD_REQUEST', 'request_id is required');

  store.checkEmergencyTimeouts();
  const emergency = store.emergencies.get(requestId);
  if (!emergency) return sendError(res, 404, 'NOT_FOUND', 'Emergency request not found');

  const now = Date.now();
  const elapsedSec = Math.floor((now - emergency.round_started_at) / 1000);
  const secondsLeft = Math.max(0, store.demoTimeoutSeconds - elapsedSec);

  // Accepted candidate info
  const acceptedCand = emergency.candidates.find((c) => c.status === 'accepted');

  const legacyStatus =
    emergency.status === 'accepted' ? 'ACCEPTED' :
    emergency.status === 'fallback' ? 'DECLINED_ALL' : 'BROADCASTING';

  return res.json({
    request_id: emergency.request_id,
    status: emergency.status,
    round: emergency.round,
    seconds_left: secondsLeft,
    accepted_hospital: acceptedCand ? {
      id: acceptedCand.hospital_id,
      name: acceptedCand.hospital_name,
      address: acceptedCand.address,
    } : null,
    fallback: emergency.fallback ? {
      nearest_capable_hospital: emergency.candidates[0]?.hospital_name || 'Nearest District Hospital',
      instruction: 'Call 108 immediately',
    } : null,
    // Compatibility fields
    target_name: acceptedCand?.hospital_name || emergency.candidates[0]?.hospital_name || 'Broadcasting...',
    target_address: acceptedCand?.address || emergency.candidates[0]?.address || 'Looking for available bed...',
    deadline_at: new Date(emergency.round_started_at + store.demoTimeoutSeconds * 1000).toISOString(),
    accepted_name: acceptedCand?.hospital_name || null,
    accepted_address: acceptedCand?.address || null,
  });
}

app.get('/api/emergency/status', handleEmergencyStatus);
app.post('/api/emergency/status', handleEmergencyStatus);

/**
 * POST /api/emergency/retry
 */
app.post('/api/emergency/retry', (req: Request, res: Response) => {
  const { request_id } = req.body;
  const emergency = store.emergencies.get(request_id);
  if (!emergency) return sendError(res, 404, 'NOT_FOUND', 'Emergency request not found');

  emergency.status = 'broadcasting';
  emergency.round = 1;
  emergency.round_started_at = Date.now();
  emergency.fallback = false;

  const capable = store.getCapableHospitals(emergency.emergency_types, emergency.lat, emergency.lng);
  emergency.candidates = capable.slice(0, 3).map((item) => ({
    hospital_id: item.hospital.hospital_id,
    hospital_name: item.hospital.name,
    address: `${item.hospital.area}, ${item.hospital.city}`,
    distance_km: Math.round(item.distance_km * 10) / 10,
    status: 'pending' as const,
  }));

  return res.json({ ok: true, emergency });
});

/**
 * GET /api/desk/incoming?hospital_id
 */
app.get('/api/desk/incoming', (req: Request, res: Response) => {
  const hospitalId = (req.query.hospital_id as string) || 'h01';
  store.checkEmergencyTimeouts();

  const hospital = store.hospitals.find((h) => h.hospital_id === hospitalId);
  if (!hospital) return sendError(res, 404, 'NOT_FOUND', 'Hospital not found');

  const incomingCards: any[] = [];

  for (const emg of store.emergencies.values()) {
    const cand = emg.candidates.find((c) => c.hospital_id === hospitalId);
    if (!cand) continue;

    // Suggestion logic: never auto-accept, provide suggestion badge with reasons
    const neededIcu = emg.emergency_types.some((t) =>
      t.includes('cardiac') || t.includes('stroke') || t.includes('snakebite')
    );
    const hasIcu = hospital.beds.available_icu > 0;
    const isOut = emg.emergency_types.some((t) => {
      if (t.includes('snakebite')) return hospital.resources.asv?.status === 'out';
      if (t.includes('cardiac')) return hospital.resources.thrombolysis?.status === 'out' && !hospital.capabilities.cath_lab;
      return false;
    });

    let suggestion: 'can_accept' | 'check_needed' = 'can_accept';
    const suggestionReasons: string[] = [];

    if (isOut) {
      suggestion = 'check_needed';
      suggestionReasons.push('Critical resource status is out or limited');
    }
    if (neededIcu && !hasIcu) {
      suggestion = 'check_needed';
      suggestionReasons.push('No ICU beds currently free');
    }
    if (suggestionReasons.length === 0) {
      suggestionReasons.push('Bed and critical resources confirmed available');
    }

    const etaMin = Math.max(5, Math.round(cand.distance_km * 2.5));

    incomingCards.push({
      request_id: emg.request_id,
      emergency_types: emg.emergency_types,
      distance_km: cand.distance_km,
      eta_min: etaMin,
      summary: emg.summary || {
        chief_complaint: emg.transcript || 'Emergency admission request',
        severity: 10,
      },
      transcript: emg.transcript || '',
      answers: emg.answers,
      my_status: cand.status,
      overall_status: emg.status,
      suggestion,
      suggestion_reasons: suggestionReasons,
      created_at: emg.created_at,
    });
  }

  // Sort newest first
  incomingCards.sort((a, b) => b.created_at - a.created_at);

  return res.json({
    incoming: incomingCards,
  });
});

/**
 * POST /api/desk/respond (and POST /api/emergency/respond)
 */
function handleDeskRespond(req: Request, res: Response) {
  const { request_id, hospital_id = 'h01', action, reason } = req.body;
  if (!request_id) return sendError(res, 400, 'BAD_REQUEST', 'request_id is required');

  const emergency = store.emergencies.get(request_id);
  if (!emergency) return sendError(res, 404, 'NOT_FOUND', 'Emergency request not found');

  const cand = emergency.candidates.find((c) => c.hospital_id === hospital_id);
  if (!cand) return sendError(res, 404, 'NOT_FOUND', 'Hospital not a candidate for this request');

  const normAction = (action || '').toLowerCase();

  if (normAction === 'accept') {
    // Check if another hospital already accepted (first accept wins)
    if (emergency.status === 'accepted' && emergency.accepted_hospital_id !== hospital_id) {
      return sendError(res, 409, 'CONFLICT', 'Request was already accepted by another hospital');
    }

    // Accept holds 1 bed of needed type for 30 minutes
    const hospital = store.hospitals.find((h) => h.hospital_id === hospital_id);
    if (hospital) {
      const isIcu = emergency.emergency_types.some((t) =>
        t.includes('cardiac') || t.includes('stroke') || t.includes('snakebite')
      );
      if (isIcu && hospital.beds.available_icu > 0) {
        hospital.beds.available_icu -= 1;
        hospital.held_beds.push({
          bed_type: 'icu',
          request_id,
          expires_at: Date.now() + 30 * 60 * 1000,
        });
      } else if (hospital.beds.available_general > 0) {
        hospital.beds.available_general -= 1;
        hospital.held_beds.push({
          bed_type: 'general',
          request_id,
          expires_at: Date.now() + 30 * 60 * 1000,
        });
      }
    }

    cand.status = 'accepted';
    emergency.status = 'accepted';
    emergency.accepted_hospital_id = hospital_id;
    emergency.accepted_hospital_name = cand.hospital_name;
    emergency.accepted_address = cand.address;

    // Cancel all other pending candidates
    for (const other of emergency.candidates) {
      if (other.hospital_id !== hospital_id && other.status === 'pending') {
        other.status = 'cancelled';
      }
    }

    return res.json({ ok: true, status: 'accepted' });
  } else if (normAction === 'decline') {
    cand.status = 'declined';
    cand.decline_reason = reason || 'other';

    // If all candidates in current round declined, trigger fallback or next round
    const pendingInRound = emergency.candidates.filter((c) => c.status === 'pending');
    if (pendingInRound.length === 0) {
      if (emergency.round === 1) {
        // Move to round 2
        emergency.round = 2;
        emergency.round_started_at = Date.now();
        const capable = store.getCapableHospitals(emergency.emergency_types, emergency.lat, emergency.lng);
        const used = new Set(emergency.candidates.map((c) => c.hospital_id));
        const nextPool = capable.filter((h) => !used.has(h.hospital.hospital_id));
        const round2 = nextPool.slice(0, 3).map((h) => ({
          hospital_id: h.hospital.hospital_id,
          hospital_name: h.hospital.name,
          address: `${h.hospital.area}, ${h.hospital.city}`,
          distance_km: Math.round(h.distance_km * 10) / 10,
          status: 'pending' as const,
        }));
        if (round2.length > 0) {
          emergency.candidates.push(...round2);
        } else {
          emergency.status = 'fallback';
          emergency.fallback = true;
        }
      } else {
        emergency.status = 'fallback';
        emergency.fallback = true;
      }
    }

    return res.json({ ok: true, status: emergency.status });
  }

  return sendError(res, 400, 'BAD_ACTION', 'Action must be accept or decline');
}

app.post('/api/desk/respond', handleDeskRespond);
app.post('/api/emergency/respond', handleDeskRespond);

/**
 * PATCH /api/hospital/resources
 */
app.patch('/api/hospital/resources', (req: Request, res: Response) => {
  const { hospital_id, resource, status } = req.body;
  if (!hospital_id || !resource || !status) {
    return sendError(res, 400, 'BAD_REQUEST', 'hospital_id, resource, and status are required');
  }

  const hospital = store.hospitals.find((h) => h.hospital_id === hospital_id);
  if (!hospital) return sendError(res, 404, 'NOT_FOUND', 'Hospital not found');

  hospital.resources[resource] = {
    status,
    quantity: status === 'out' ? 0 : (hospital.resources[resource]?.quantity || 10),
    updated_at: new Date().toISOString(),
  };

  return res.json({
    ok: true,
    hospital_id,
    resource: hospital.resources[resource],
  });
});

/**
 * PATCH /api/hospital/beds
 */
app.patch('/api/hospital/beds', (req: Request, res: Response) => {
  const { hospital_id, bed_type = 'icu', available } = req.body;
  if (!hospital_id || available === undefined) {
    return sendError(res, 400, 'BAD_REQUEST', 'hospital_id and available are required');
  }

  const hospital = store.hospitals.find((h) => h.hospital_id === hospital_id);
  if (!hospital) return sendError(res, 404, 'NOT_FOUND', 'Hospital not found');

  const count = parseInt(available, 10);
  if (bed_type === 'icu') {
    hospital.beds.available_icu = count;
  } else if (bed_type === 'general') {
    hospital.beds.available_general = count;
  } else if (bed_type === 'ot') {
    hospital.beds.available_ot = count;
  }
  hospital.beds.last_updated = new Date().toISOString();

  return res.json({
    ok: true,
    beds: hospital.beds,
  });
});

/**
 * POST /api/demo/reset
 */
app.post('/api/demo/reset', (_req: Request, res: Response) => {
  store.seed();
  return res.json({
    ok: true,
    message: 'Demo store reset successfully',
  });
});

/**
 * POST /api/demo/flip
 */
app.post('/api/demo/flip', (req: Request, res: Response) => {
  const { hospital_id, resource, status } = req.body;
  if (!hospital_id || !resource || !status) {
    return sendError(res, 400, 'BAD_REQUEST', 'hospital_id, resource, and status are required');
  }

  const hospital = store.hospitals.find((h) => h.hospital_id === hospital_id);
  if (!hospital) return sendError(res, 404, 'NOT_FOUND', 'Hospital not found');

  hospital.resources[resource] = {
    status,
    quantity: status === 'out' ? 0 : 20,
    updated_at: new Date().toISOString(),
  };

  return res.json({
    ok: true,
    hospital_id,
    resource: hospital.resources[resource],
  });
});

// Backward compatibility router for functions/v1/api/*
app.use('/functions/v1/api', (req: Request, res: Response, next: NextFunction) => {
  req.url = `/api${req.url}`;
  app.handle(req, res, next);
});

// Start listening
app.listen(PORT, () => {
  console.log(`[Swasthya Setu] Backend server running on http://localhost:${PORT}`);
});
