// Swasthya Setu — shared UI types. API response types live in lib/api.ts.

export type TriageLevel = 'ROUTINE' | 'URGENT' | 'EMERGENCY';
export type LangCode = 'en-IN' | 'hi-IN' | 'ta-IN' | 'bn-IN' | 'mr-IN' | 'te-IN';

export interface LanguageOption {
  code: LangCode;
  label: string;
  native: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en-IN', label: 'English', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
];

export type { Hospital, IntakeResult, IntakeSummary, OcrMedicine, OcrRecord, PatientRecord, QueueRow, StaffUser, QueueStatusResult } from '@/lib/api';

// ---------- Staff Types (added at bottom) ----------
export interface StaffRecord {
  id: string;
  title: string;
  date: string;
  extracted_text: string;
  confidence: number;
}

export interface StaffScoreBreakdown {
  base: number;
  moderate_red_flag: number;
  age_risk: number;
  pregnancy: number;
  chronic_condition: number;
  wait_time: number;
}

export interface StaffDoctorQueueEntry {
  id: string;
  entry_id: string;
  token: string;
  hospital_id: string;
  colour: 'GREEN' | 'YELLOW' | 'RED';
  triage_level: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  patient_label: string;
  abha_id?: string | null;
  phone?: string | null;
  score: number;
  breakdown: StaffScoreBreakdown;
  tags: string[];
  review_flags: string[];
  summary: {
    chief_complaint: string;
    duration?: string;
    severity?: number;
    relevant_history?: string[];
  };
  draft_summary: {
    chief_complaint: string;
    duration?: string;
    severity?: number;
    relevant_history?: string[];
  };
  transcript: string;
  answers: { question: string; answer: string }[];
  status: 'WAITING' | 'APPROVED' | 'CALLED';
  position: number;
  doctor_override?: {
    original_colour: string;
    new_colour: string;
    reason: string;
    overridden_at: string;
  };
  approved_by?: string;
  approved_at?: string;
  created_at?: number;
}

export interface StaffIncomingEmergencyCard {
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
  cancel_reason?: string | null;
  accepted_hospital_name?: string | null;
  suggestion: 'can_accept' | 'check_needed';
  suggestion_reasons: string[];
  created_at: number;
}

export interface StaffHospitalResourceState {
  status: 'available' | 'low' | 'out';
  quantity?: number;
  updated_at: string;
}

export interface StaffHospitalBedsState {
  total: number;
  icu: number;
  available_icu: number;
  available_general: number;
  available_ot?: number;
  last_updated: string;
}