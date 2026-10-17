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
  { code: 'ta-IN', label: 'Tamil (coming soon)', native: 'தமிழ் (coming soon)' },
  { code: 'bn-IN', label: 'Bengali (coming soon)', native: 'বাংলা (coming soon)' },
  { code: 'mr-IN', label: 'Marathi (coming soon)', native: 'मराठी (coming soon)' },
  { code: 'te-IN', label: 'Telugu (coming soon)', native: 'తెలుగు (coming soon)' },
];

export interface ScoreBreakdown {
  urgency: number;
  red_flag: number;
  vulnerability: number;
  waiting_minutes: number;
  total: number;
  red_flag_reasons: string[];
  vulnerability_reasons: string[];
}

export type DeclineReason = 'no bed' | 'no specialist' | 'no equipment' | 'other';
export type ResourceAvailability = 'AVAILABLE' | 'LOW' | 'OUT';

export interface ResourceItem {
  id: string;
  name: string;
  category: 'MEDICINE' | 'EQUIPMENT' | 'SUPPLY';
  status: ResourceAvailability;
  updated_at: string;
}

export interface BedCategoryCount {
  type: 'ICU' | 'EMERGENCY' | 'MATERNITY' | 'GENERAL';
  available: number;
  total: number;
  held: number;
  updated_at: string;
}

export interface RecentDecision {
  id: string;
  request_id: string;
  patient_label: string;
  decision: 'ACCEPTED' | 'DECLINED';
  reason?: string;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  ts: string;
  role: string;
  action: string;
  patient_ref: string;
  is_break_glass?: boolean;
  details?: Record<string, unknown> | null;
}

export type {
  Hospital,
  IntakeResult,
  IntakeSummary,
  OcrMedicine,
  OcrRecord,
  PatientRecord,
  QueueRow,
  StaffUser,
  QueueStatusResult,
} from '@/lib/api';