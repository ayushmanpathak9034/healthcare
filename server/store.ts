import fs from 'node:fs';
import path from 'node:path';
import { calculateScore, ScoreBreakdown } from './scoring';
import { SYNTHETIC_PATIENTS, SyntheticPatient } from './seeds/patients';

export interface ResourceState {
  status: 'available' | 'low' | 'out';
  quantity?: number;
  updated_at: string; // ISO
}

export interface HospitalRecord {
  hospital_id: string;
  name: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  ownership: string;
  beds: {
    total: number;
    icu: number;
    available_icu: number;
    available_general: number;
    available_ot?: number;
    last_updated: string;
  };
  capabilities: {
    emergency: boolean;
    toxicology: string; // '24x7' | 'day only' | 'none'
    cardiology?: boolean;
    neurology?: boolean;
    trauma?: boolean;
    cath_lab?: boolean;
  };
  equipment: {
    ventilators: number;
    cardiac_monitor?: number;
    defibrillator?: number;
    ct_scan?: boolean;
    oxygen?: boolean;
  };
  resources: Record<string, ResourceState>;
  queue_length: number;
  held_beds: Array<{
    bed_type: string;
    request_id: string;
    expires_at: number; // timestamp ms
  }>;
}

export interface QueueEntry {
  entry_id: string;
  token: string;
  hospital_id: string;
  colour: 'GREEN' | 'YELLOW' | 'RED';
  phone?: string;
  name?: string;
  abha_id?: string;
  language: string;
  transcript: string;
  answers: { question: string; answer: string }[];
  tags: string[];
  reasons: string[];
  draft_summary: {
    chief_complaint: string;
    duration: string;
    severity: number;
    relevant_history: string[];
  };
  created_at: number; // ms
  score: number;
  breakdown: ScoreBreakdown;
  status: 'WAITING' | 'APPROVED' | 'CALLED';
  review_flags: string[];
  doctor_override?: {
    original_colour: string;
    new_colour: string;
    reason: string;
    overridden_at: string;
  };
  approved_by?: string;
  approved_at?: string;
}

export interface EmergencyCandidate {
  hospital_id: string;
  hospital_name: string;
  address: string;
  distance_km: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  decline_reason?: string;
}

export interface EmergencyRequest {
  request_id: string;
  emergency_types: string[];
  lat: number;
  lng: number;
  transcript?: string;
  answers: { question: string; answer: string }[];
  phone?: string;
  status: 'broadcasting' | 'accepted' | 'fallback';
  round: number; // 1 or 2
  round_started_at: number; // ms
  candidates: EmergencyCandidate[];
  accepted_hospital_id?: string;
  accepted_hospital_name?: string;
  accepted_address?: string;
  fallback: boolean;
  created_at: number;
  summary?: {
    chief_complaint: string;
    duration: string;
    severity: number;
    relevant_history: string[];
  };
}

export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export class AppStore {
  hospitals: HospitalRecord[] = [];
  queue: Map<string, QueueEntry> = new Map();
  emergencies: Map<string, EmergencyRequest> = new Map();
  patients: Map<string, SyntheticPatient> = new Map();
  tokenCounter = 100;
  demoTimeoutSeconds = 20;

  constructor() {
    this.demoTimeoutSeconds = parseInt(process.env.DEMO_TIMEOUT_SECONDS || '20', 10);
    this.seed();
  }

  seed() {
    this.queue.clear();
    this.emergencies.clear();
    this.patients.clear();
    this.tokenCounter = 100;

    // Seed patients
    for (const p of SYNTHETIC_PATIENTS) {
      this.patients.set(p.abha_id, p);
    }

    // Load hospitals from hospitals.json
    const rawPath = path.resolve(process.cwd(), 'hospitals.json');
    let rawHospitals: any[] = [];
    if (fs.existsSync(rawPath)) {
      const rawText = fs.readFileSync(rawPath, 'utf-8').replace(/,\s*([\]}])/g, '$1');
      rawHospitals = JSON.parse(rawText);
    }

    this.hospitals = rawHospitals.map((h: any, idx: number) => {
      const nowIso = new Date().toISOString();
      const asvQty = h.resources?.asv?.quantity ?? (idx % 3 === 0 ? 0 : 15);
      const asvStatus: 'available' | 'low' | 'out' =
        asvQty === 0 ? 'out' : asvQty < 10 ? 'low' : 'available';

      return {
        hospital_id: h.hospital_id,
        name: h.name,
        area: h.area,
        city: h.city,
        lat: h.lat,
        lng: h.lng,
        ownership: h.ownership || 'Government',
        beds: {
          total: h.beds?.total ?? 200,
          icu: h.beds?.icu ?? 20,
          available_icu: Math.max(0, Math.floor((h.beds?.icu ?? 20) * 0.4)),
          available_general: Math.max(0, Math.floor((h.beds?.total ?? 200) * 0.3)),
          available_ot: 2,
          last_updated: nowIso,
        },
        capabilities: {
          emergency: h.capabilities?.emergency ?? true,
          toxicology: h.capabilities?.toxicology ?? '24x7',
          cardiology: true,
          neurology: true,
          trauma: true,
          cath_lab: idx % 2 === 0,
        },
        equipment: {
          ventilators: h.equipment?.ventilators ?? 5,
          cardiac_monitor: 10,
          defibrillator: 4,
          ct_scan: true,
          oxygen: true,
        },
        resources: {
          asv: {
            status: asvStatus,
            quantity: asvQty,
            updated_at: h.resources?.asv?.updated_at || nowIso,
          },
          thrombolysis: {
            status: idx % 4 === 1 ? 'low' : 'available',
            updated_at: nowIso,
          },
          blood_o_neg: {
            status: idx % 5 === 2 ? 'low' : 'available',
            updated_at: nowIso,
          },
          anti_rabies: {
            status: 'available',
            updated_at: nowIso,
          },
          adrenaline: {
            status: 'available',
            updated_at: nowIso,
          },
          oxygen: {
            status: 'available',
            updated_at: nowIso,
          },
        },
        queue_length: 5 + (idx % 12),
        held_beds: [],
      };
    });

    // Seed some initial queue entries for demo realism
    const seedHosp = this.hospitals[0]?.hospital_id || 'h01';
    const initialPatient = SYNTHETIC_PATIENTS[0];
    const initialScore = calculateScore({
      colour: 'GREEN',
      age: initialPatient.age,
      hasChronicCondition: true,
      waitingMinutes: 15,
    });
    const entryId = 'entry-demo-1';
    this.queue.set(entryId, {
      entry_id: entryId,
      token: 'T-101',
      hospital_id: seedHosp,
      colour: 'GREEN',
      name: initialPatient.name,
      phone: initialPatient.phone,
      abha_id: initialPatient.abha_id,
      language: 'en-IN',
      transcript: 'I have had mild joint pain and fatigue for 3 days.',
      answers: [{ question: 'How long has this been occurring?', answer: '3 days' }],
      tags: ['general', 'chronic_condition'],
      reasons: ['Patient with chronic conditions and joint aches'],
      draft_summary: {
        chief_complaint: 'Joint pain and general fatigue',
        duration: '3 days',
        severity: 3,
        relevant_history: initialPatient.conditions,
      },
      created_at: Date.now() - 15 * 60 * 1000, // 15 mins ago
      score: initialScore.total,
      breakdown: initialScore.breakdown,
      status: 'WAITING',
      review_flags: ['Age > 60', 'Hypertension history'],
    });
  }

  isResourceStale(updatedAtIso: string): boolean {
    const diffMs = Date.now() - new Date(updatedAtIso).getTime();
    return diffMs > 60 * 60 * 1000; // > 60 minutes
  }

  isBedsStale(updatedAtIso: string): boolean {
    const diffMs = Date.now() - new Date(updatedAtIso).getTime();
    return diffMs > 60 * 60 * 1000;
  }

  checkEmergencyTimeouts() {
    const now = Date.now();
    for (const emergency of this.emergencies.values()) {
      if (emergency.status !== 'broadcasting') continue;

      const elapsedSec = Math.floor((now - emergency.round_started_at) / 1000);
      if (elapsedSec >= this.demoTimeoutSeconds) {
        if (emergency.round === 1) {
          // Advance to round 2: cancel pending candidates from round 1
          for (const cand of emergency.candidates) {
            if (cand.status === 'pending') {
              cand.status = 'cancelled';
            }
          }
          emergency.round = 2;
          emergency.round_started_at = now;

          // Select next 3 capable candidates
          const allCapable = this.getCapableHospitals(
            emergency.emergency_types,
            emergency.lat,
            emergency.lng
          );
          const alreadyUsed = new Set(emergency.candidates.map((c) => c.hospital_id));
          const round2Pool = allCapable.filter((h) => !alreadyUsed.has(h.hospital.hospital_id));
          const nextCandidates = round2Pool.slice(0, 3).map((h) => ({
            hospital_id: h.hospital.hospital_id,
            hospital_name: h.hospital.name,
            address: `${h.hospital.area}, ${h.hospital.city}`,
            distance_km: Math.round(h.distance_km * 10) / 10,
            status: 'pending' as const,
          }));

          if (nextCandidates.length > 0) {
            emergency.candidates.push(...nextCandidates);
          } else {
            // No more candidates, trigger fallback immediately
            emergency.status = 'fallback';
            emergency.fallback = true;
          }
        } else {
          // After round 2 timeout, fallback
          for (const cand of emergency.candidates) {
            if (cand.status === 'pending') {
              cand.status = 'cancelled';
            }
          }
          emergency.status = 'fallback';
          emergency.fallback = true;
        }
      }
    }
  }

  /**
   * Filter hospitals based on emergency type requirements:
   * snakebite: antivenom (asv not "out") + ICU > 0 + toxicology 24x7
   * cardiac: (thrombolysis not "out" OR cath_lab) + ICU > 0
   * stroke: ct_scan + neurology + ICU > 0
   * trauma: blood_o_neg not "out" + available_ot > 0
   * dog_bite: anti_rabies not "out"
   * asthma/allergy: adrenaline not "out" + oxygen not "out"
   * breathing: oxygen not "out" + ventilators > 0
   */
  getCapableHospitals(
    emergencyTypes: string[],
    lat: number,
    lng: number
  ): Array<{ hospital: HospitalRecord; distance_km: number }> {
    const list: Array<{ hospital: HospitalRecord; distance_km: number }> = [];

    for (const h of this.hospitals) {
      if (!h.capabilities.emergency) continue;

      let capable = true;

      for (const et of emergencyTypes) {
        const type = et.toLowerCase();
        if (type.includes('snakebite')) {
          if (
            h.resources.asv?.status === 'out' ||
            h.capabilities.toxicology !== '24x7' ||
            h.beds.available_icu <= 0
          ) {
            capable = false;
          }
        } else if (type.includes('cardiac') || type.includes('chest_pain')) {
          const thrombolysisOk = h.resources.thrombolysis?.status !== 'out';
          const cathLabOk = !!h.capabilities.cath_lab;
          if ((!thrombolysisOk && !cathLabOk) || h.beds.available_icu <= 0) {
            capable = false;
          }
        } else if (type.includes('stroke')) {
          if (!h.equipment.ct_scan || !h.capabilities.neurology || h.beds.available_icu <= 0) {
            capable = false;
          }
        } else if (type.includes('trauma') || type.includes('heavy_bleeding')) {
          if (h.resources.blood_o_neg?.status === 'out' || (h.beds.available_ot ?? 0) <= 0) {
            capable = false;
          }
        } else if (type.includes('dog_bite') || type.includes('animal_bite')) {
          if (h.resources.anti_rabies?.status === 'out') {
            capable = false;
          }
        } else if (type.includes('asthma') || type.includes('allergy')) {
          if (h.resources.adrenaline?.status === 'out' || h.resources.oxygen?.status === 'out') {
            capable = false;
          }
        } else if (type.includes('breathing') || type.includes('respiratory')) {
          if (h.resources.oxygen?.status === 'out' || h.equipment.ventilators <= 0) {
            capable = false;
          }
        }
      }

      if (capable) {
        const dist = haversine({ lat, lng }, { lat: h.lat, lng: h.lng });
        list.push({ hospital: h, distance_km: dist });
      }
    }

    // Sort by distance ascending
    list.sort((a, b) => a.distance_km - b.distance_km);
    return list;
  }
}

export const store = new AppStore();
