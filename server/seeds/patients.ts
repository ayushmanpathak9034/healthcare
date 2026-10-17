export interface SyntheticPatient {
  abha_id: string;
  name: string;
  age: number;
  gender: 'M' | 'F' | 'Other';
  phone: string;
  is_pregnant?: boolean;
  conditions: string[];
  allergies: string[];
  medicines: string[];
  past_visits: string[];
}

export const SYNTHETIC_PATIENTS: SyntheticPatient[] = [
  {
    abha_id: '91-1234-5678-9012',
    name: 'Ramesh Kumar',
    age: 64,
    gender: 'M',
    phone: '+919876543210',
    conditions: ['Hypertension', 'Type 2 Diabetes'],
    allergies: ['Penicillin'],
    medicines: ['Amlodipine 5mg', 'Metformin 500mg'],
    past_visits: ['2026-08-14: Routine checkup, BP 138/86', '2026-05-10: Diabetic review'],
  },
  {
    abha_id: '91-2345-6789-0123',
    name: 'Priya Sharma',
    age: 28,
    gender: 'F',
    phone: '+919812345678',
    is_pregnant: true,
    conditions: ['Pregnancy (2nd Trimester)'],
    allergies: ['Sulfa drugs'],
    medicines: ['Folic Acid 5mg', 'Iron supplements'],
    past_visits: ['2026-09-02: Antenatal checkup', '2026-07-15: First trimester ultrasound'],
  },
  {
    abha_id: '91-3456-7890-1234',
    name: 'Aarav Patel',
    age: 4,
    gender: 'M',
    phone: '+919765432109',
    conditions: ['Childhood Asthma'],
    allergies: ['Peanuts'],
    medicines: ['Salbutamol Inhaler 100mcg as needed'],
    past_visits: ['2026-09-20: Pediatric follow-up', '2026-06-11: Viral fever'],
  },
  {
    abha_id: '91-4567-8901-2345',
    name: 'Sunita Devi',
    age: 52,
    gender: 'F',
    phone: '+919654321098',
    conditions: ['Hypothyroidism', 'Osteoarthritis'],
    allergies: ['None known'],
    medicines: ['Levothyroxine 75mcg', 'Calcium + Vitamin D3'],
    past_visits: ['2026-08-30: Knee pain consultation', '2026-04-12: Thyroid panel'],
  },
  {
    abha_id: '91-5678-9012-3456',
    name: 'Mohammed Ali',
    age: 35,
    gender: 'M',
    phone: '+919543210987',
    conditions: [],
    allergies: ['Dust mites'],
    medicines: ['Cetirizine 10mg PRN'],
    past_visits: ['2026-02-18: Seasonal allergic rhinitis'],
  },
  {
    abha_id: '91-6789-0123-4567',
    name: 'Ananya Gupta',
    age: 71,
    gender: 'F',
    phone: '+919432109876',
    conditions: ['Coronary Artery Disease', 'Hypertension'],
    allergies: ['Aspirin (mild gastritis)'],
    medicines: ['Atorvastatin 20mg', 'Metoprolol 25mg', 'Clopidogrel 75mg'],
    past_visits: ['2026-09-15: Cardiology OPD review', '2026-07-04: Lipid panel check'],
  },
  {
    abha_id: '91-7890-1234-5678',
    name: 'Vikram Singh',
    age: 42,
    gender: 'M',
    phone: '+919321098765',
    conditions: ['Chronic Kidney Disease Stage 2'],
    allergies: ['Ibuprofen / NSAIDs'],
    medicines: ['Telmisartan 40mg', 'Sodium Bicarbonate'],
    past_visits: ['2026-08-05: Nephrology OPD follow-up', '2026-03-22: Serum creatinine check'],
  },
  {
    abha_id: '91-8901-2345-6789',
    name: 'Meera Nair',
    age: 24,
    gender: 'F',
    phone: '+919210987654',
    conditions: ['Migraine'],
    allergies: ['Penicillin'],
    medicines: ['Sumatriptan 50mg on attack', 'Propranolol 20mg daily'],
    past_visits: ['2026-09-10: Neurology headache clinic'],
  },
];
