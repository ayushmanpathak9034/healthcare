// All data access goes through the edge function. The browser never touches tables directly.
// Staff session token is stored in sessionStorage (staff only, never patient data).

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const TOKEN_KEY = 'swasthya_staff_token';

export function getStaffToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStaffToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStaffToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function api<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown> = {},
  method: 'POST' | 'GET' | 'PATCH' = 'POST'
): Promise<T> {
  const token = getStaffToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? anonKey ?? 'demo-token'}`,
  };
  const target = path.startsWith('/api') ? path : `/api${path}`;
  const res = await fetch(target, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string } | string })?.error;
    const msg = typeof err === 'object' && err !== null ? err.message : err;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return data as T;
}

// ---------- AI ----------
export interface IntakeSummary {
  chief_complaint: string;
  duration: string;
  severity: number;
  relevant_history: string[];
}

export interface IntakeResult {
  triage_level: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  emergency_reason: string | null;
  summary: IntakeSummary;
  source_tags: { claim: string; source: 'voice' | 'history' | 'ocr' }[];
  followup_question: string | null;
  mock: boolean;
}

export const intake = (body: { language: string; transcript: string; triage_floor: string; prior_history?: unknown; followup_answers?: unknown }) =>
  api<IntakeResult>('/intake', body);

export const emergencySummary = (body: { language: string; transcript: string }) =>
  api<IntakeResult>('/emergency-summary', body);

export const ocrPrescription = (body: { imageBase64: string; mime: string }) =>
  api<{ medicines: OcrMedicine[]; header?: string; warnings?: string[]; mock: boolean }>('/ocr', body);

// ---------- public ----------
export interface PatientRecord {
  name: string;
  conditions: string[];
  medicines: string[];
  past_visits: string[];
  ocr_prescriptions: OcrRecord[];
}

export const patientLookup = (abha_id: string) =>
  api<{ patient: PatientRecord | null }>('/patient/lookup', { abha_id });

export interface Hospital {
  id: string;
  name: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  specialties: string[];
  icu_beds_available: number;
  ventilators_available: number;
  emergency_capable: boolean;
  queue_length: number;
}

export const hospitalsList = () => api<{ hospitals: Hospital[] }>('/hospitals/list');

export interface QueueSubmitResult {
  token: string;
  entry_id: string;
  status_token?: string;
  position: number;
  estimated_wait_minutes: number;
}

export const queueSubmit = (body: {
  language: string;
  abha_id?: string;
  phone?: string;
  hospital_id: string;
  triage_floor: string;
  transcript: string;
  followup_answers: { question: string; answer: string }[];
  intake: IntakeResult;
  prior_history?: unknown;
  ocr_records: OcrRecord[];
}) => api<QueueSubmitResult>('/queue/submit', body);

export interface QueueStatusResult {
  token: string;
  position: number;
  total: number;
  estimated_wait_minutes: number;
  triage_level: string;
}

export const queueStatus = (entry_id: string, status_token?: string) =>
  api<QueueStatusResult>('/queue/status', { entry_id, status_token });

export interface EmergencyCreateResult {
  request_id: string;
  candidates: { id: string; name: string; address: string; distance_km: number; estimated: boolean }[];
}

export const emergencyCreate = (body: { kind: 'AMBULANCE' | 'ABHA_FAMILY'; lat?: number; lng?: number; abha_id?: string; language: string }) =>
  api<EmergencyCreateResult>('/emergency/create', body);

export const emergencyAnswers = (body: { request_id: string; answers: { question: string; answer: string }[]; free_text?: string; language: string }) =>
  api<{ ok: boolean; summary: IntakeResult }>('/emergency/answers', body);

export interface EmergencyStatusResult {
  status: 'BROADCASTING' | 'ACCEPTED' | 'DECLINED_ALL' | 'CANCELLED';
  target_name: string | null;
  target_address: string | null;
  deadline_at: string | null;
  accepted_name: string | null;
  accepted_address: string | null;
}

export const emergencyStatus = (request_id: string) => api<EmergencyStatusResult>('/emergency/status', { request_id });

export const emergencyRetry = (request_id: string) => api<{ ok: boolean }>('/emergency/retry', { request_id });

export const geocode = (query: string) =>
  api<{ result: { lat: number; lng: number; label: string; estimated: boolean } | null }>('/maps/geocode', { query });

// ---------- staff ----------
export interface StaffUser {
  id: string;
  username: string;
  role: 'DOCTOR' | 'RECEPTION' | 'ADMIN';
  display_name: string;
  hospital_id: string | null;
}

export const staffLogin = (username: string, password: string) =>
  api<{ token: string; user: StaffUser }>('/staff/login', { username, password });

export interface QueueRow {
  id?: string;
  token: string;
  status?: string;
  position?: number;
  manual_rank?: number | null;
  triage_level?: string;
  patient_label?: string;
  abha_id?: string | null;
  summary?: IntakeSummary | null;
  source_tags?: { claim: string; source: string }[];
  prior_history?: {
    conditions: string[];
    medicines: string[];
    past_visits: string[];
    ocr_prescriptions: OcrRecord[];
  } | null;
  ocr_records?: OcrRecord[];
  approved_by?: string | null;
  approved_at?: string | null;
  transcript?: string;
}

export const staffQueue = () => api<{ queue: QueueRow[] }>('/staff/queue');

export const staffEntry = (id: string) => api<{ entry: QueueRow }>('/staff/entry', { id });

export const staffApprove = (id: string, summary: IntakeSummary) =>
  api<{ ok: boolean; approved_by: string; approved_at: string }>('/staff/approve', { id, summary });

export const staffOverride = (id: string, triage_level: string) => api<{ ok: boolean }>('/staff/override', { id, triage_level });

export const staffReorder = (order: string[]) => api<{ ok: boolean }>('/staff/reorder', { order });

export const staffOcr = (id: string, imageBase64: string, mime: string) =>
  api<{ ok: boolean; record: OcrRecord }>('/staff/ocr', { id, imageBase64, mime });

export const staffCapacity = (field: 'icu_beds_available' | 'ventilators_available', delta: number) =>
  api<{ ok: boolean; value: number }>('/staff/admin/capacity', { field, delta });

export interface AdminOverview {
  hospital: AdminHospital | null;
  my_emergencies: Record<string, unknown>[];
  other_emergencies_count: number;
  legs: Record<string, unknown>[];
}

export interface AdminHospital {
  id: string;
  name: string;
  city: string;
  area: string;
  icu_beds_available: number;
  ventilators_available: number;
  queue_length: number;
  specialists_on_duty: string[];
  blood_stock: Record<string, number>;
}

export const staffAdminOverview = () =>
  api<AdminOverview>('/staff/admin/overview');

export const staffAudit = () =>
  api<{ log: { id: string; ts: string; role: string; action: string; patient_ref: string; details: Record<string, unknown> | null }[] }>('/staff/audit');

export const emergencyRespond = (request_id: string, action: 'ACCEPT' | 'DECLINE', reason?: string) =>
  api<{ ok: boolean; status: string }>('/emergency/respond', { request_id, action, reason });

// ---------- ASV ----------
export interface AsvPlannedSource {
  batch_id: string;
  hospital_id: string;
  hospital_name: string;
  batch_code: string;
  vials: number;
  travel_minutes: number;
  km: number;
  estimated: boolean;
  freshness: 'FRESH' | 'STALE' | 'VERY_STALE';
  toxicology_24x7: boolean;
}

export interface AsvPlanResult {
  status: 'PLAN_READY' | 'NO_RELIABLE_STOCK' | 'NOT_ENOUGH_STOCK_IN_CITY';
  move_mode: 'MOVE_PATIENT' | 'MOVE_MEDICINE';
  move_reason: string;
  sources: AsvPlannedSource[];
  excluded_old: { hospital_name: string; batch_code: string; age_minutes: number }[];
  warnings: string[];
  estimated_any: boolean;
}

export const asvPlan = (body: { origin_lat: number; origin_lng: number; vials_needed: number; patient_stable: boolean; patient_ref: string; origin_city?: string }) =>
  api<{ transfer_request_id: string; plan: AsvPlanResult }>('/asv/plan', body);

export const asvRequest = (transfer_request_id: string) =>
  api<{ ok: boolean; legs: number; deadline_at: string }>('/asv/request', { transfer_request_id });

export const asvRespond = (leg_id: string, action: 'ACCEPT' | 'DECLINE', reason?: string) =>
  api<{ ok: boolean; status: string }>('/asv/respond', { leg_id, action, reason });

export const asvDispatch = (leg_id: string, courier: string) => api<{ ok: boolean }>('/asv/dispatch', { leg_id, courier });

export const asvHandover = (leg_id: string, location_name: string, actor: string) =>
  api<{ ok: boolean }>('/asv/handover', { leg_id, location_name, actor });

export const asvReceive = (leg_id: string, actor: string) => api<{ ok: boolean; received: number; needed: number }>('/asv/receive', { leg_id, actor });

export interface CustodyEvent {
  id: string;
  event: string;
  location_name: string;
  actor: string;
  at: string;
}

export interface AsvStatusResult {
  request: { id: string; status: string; vials_needed: number; move_mode: string; patient_ref: string };
  legs: { id: string; source_hospital_id: string; vials: number; status: string; deadline_at: string | null; sequence_no: number }[];
  custody_events: CustodyEvent[];
  current_location: string | null;
  transit_minutes: number | null;
  cold_chain_ok: boolean | null;
  warnings: string[];
}

export const asvStatus = (transfer_request_id: string) => api<AsvStatusResult>('/asv/status', { transfer_request_id });

export const asvStock = (body: { batch_code: string; quantity: number; expiry_date: string }) =>
  api<{ ok: boolean }>('/asv/stock', body);

// ---------- shared record types ----------
export interface OcrMedicine {
  name: string;
  dosage: string;
  ocr_confidence: number;
  needs_review: boolean;
}

export interface OcrRecord {
  file: string;
  date: string;
  medicines: OcrMedicine[];
  header?: string;
  warnings?: string[];
}

// ---------- Stage 1 & 2 additions ----------
export interface ScoreBreakdown {
  base: number;
  moderate_red_flag: number;
  age_risk: number;
  pregnancy: number;
  chronic_condition: number;
  wait_time: number;
}

export interface DoctorQueueEntry {
  id: string;
  entry_id: string;
  token: string;
  hospital_id: string;
  colour: 'GREEN' | 'YELLOW' | 'RED';
  triage_level: string;
  patient_label: string;
  abha_id: string | null;
  score: number;
  breakdown: ScoreBreakdown;
  tags: string[];
  review_flags: string[];
  summary: IntakeSummary;
  draft_summary: IntakeSummary;
  transcript: string;
  answers: { question: string; answer: string }[];
  status: string;
  position: number;
  doctor_override?: {
    original_colour: string;
    new_colour: string;
    reason: string;
    overridden_at: string;
  };
  approved_by?: string;
  approved_at?: string;
}

export interface DeskEmergencyCard {
  request_id: string;
  emergency_types: string[];
  distance_km: number;
  eta_min: number;
  summary: {
    chief_complaint: string;
    duration?: string;
    severity?: number;
    relevant_history?: string[];
  };
  transcript: string;
  answers: { question: string; answer: string }[];
  my_status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  overall_status: 'broadcasting' | 'accepted' | 'fallback';
  suggestion: 'can_accept' | 'check_needed';
  suggestion_reasons: string[];
  created_at: number;
}

export const verifyOtp = (phone: string, otp: string) =>
  api<{ ok: boolean; verified: boolean }>('/otp/verify', { phone, otp });

export const doctorQueue = (hospital_id?: string) =>
  api<{ queue: DoctorQueueEntry[]; entries: DoctorQueueEntry[] }>(
    `/doctor/queue${hospital_id ? `?hospital_id=${hospital_id}` : ''}`,
    {},
    'GET'
  );

export const doctorOverride = (entry_id: string, new_colour: string, reason: string) =>
  api<{ ok: boolean }>('/doctor/override', { entry_id, new_colour, reason });

export const doctorApprove = (entry_id: string, edited_summary: IntakeSummary) =>
  api<{ ok: boolean; approved_by: string; approved_at: string }>('/doctor/approve', {
    entry_id,
    edited_summary,
  });

export const deskIncoming = (hospital_id?: string) =>
  api<{ incoming: DeskEmergencyCard[] }>(
    `/desk/incoming${hospital_id ? `?hospital_id=${hospital_id}` : ''}`,
    {},
    'GET'
  );

export const deskRespond = (
  request_id: string,
  hospital_id: string,
  action: 'accept' | 'decline',
  reason?: string
) => api<{ ok: boolean; status: string }>('/desk/respond', { request_id, hospital_id, action, reason });

export const updateHospitalResource = (
  hospital_id: string,
  resource: string,
  status: 'available' | 'low' | 'out'
) => api<{ ok: boolean; resource: unknown }>('/hospital/resources', { hospital_id, resource, status }, 'PATCH');

export const updateHospitalBeds = (
  hospital_id: string,
  bed_type: 'icu' | 'general' | 'ot',
  available: number
) => api<{ ok: boolean; beds: unknown }>('/hospital/beds', { hospital_id, bed_type, available }, 'PATCH');

export const demoReset = () => api<{ ok: boolean; message: string }>('/demo/reset');

export const demoFlip = (hospital_id: string, resource: string, status: string) =>
  api<{ ok: boolean }>('/demo/flip', { hospital_id, resource, status });

