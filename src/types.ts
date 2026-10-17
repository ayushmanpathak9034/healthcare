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
  ScoreBreakdown,
  DeclineReason,
  ResourceAvailability,
  ResourceItem,
  BedCategoryCount,
  RecentDecision,
  EmergencyCardRow,
  AdminOverview,
  AdminHospital,
} from '@/lib/api';