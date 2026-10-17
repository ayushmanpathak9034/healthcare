/*
# Swasthya Setu — Hospital Isolation, Emergency Desk & Audit Addendum

1. Staff Users
   - Updates role check to allow HOSPITAL_DESK in addition to DOCTOR, RECEPTION, ADMIN.
   - Links doctor1 to Demo General Hospital 01 (00000000-0000-4000-8000-000000000001).
   - Links reception1 to Demo General Hospital 01.
   - Creates doctor2 linked to Demo Medical Institute 02 (00000000-0000-4000-8000-000000000002) for isolation testing.
   - Creates desk1 (role HOSPITAL_DESK) linked to Demo General Hospital 01.

2. Hospital Beds
   - Creates hospital_beds table tracking ICU, EMERGENCY, MATERNITY, and GENERAL capacities with available, total, and held counts.
   - Seeds initial bed capacities for demo hospitals.

3. Hospital Resources
   - Creates hospital_resources table tracking status (AVAILABLE, LOW, OUT) and freshness (updated_at) per resource.
   - Seeds core clinical resources (asv, thrombolysis, oxygen_cylinders, adrenaline, ct_scan, etc.).

4. Queue Entries & Emergency Requests Additions
   - Adds score_breakdown, override_reason, and raw_transcript to queue_entries.
   - Adds decline_reason, decline_details, held_bed_type, emergency_types, and eta_minutes to emergency_requests.
   - Adds is_break_glass boolean to audit_log.

5. RLS lockdown on new tables.
*/

-- 1. STAFF USERS ROLE & HOSPITAL LINKAGE
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('DOCTOR', 'RECEPTION', 'ADMIN', 'HOSPITAL_DESK'));

UPDATE staff_users
SET hospital_id = '00000000-0000-4000-8000-000000000001'
WHERE username = 'doctor1' AND (hospital_id IS NULL OR hospital_id != '00000000-0000-4000-8000-000000000001');

UPDATE staff_users
SET hospital_id = '00000000-0000-4000-8000-000000000001'
WHERE username = 'reception1' AND (hospital_id IS NULL OR hospital_id != '00000000-0000-4000-8000-000000000001');

-- doctor2 for Hospital 02 (cross-hospital isolation testing)
INSERT INTO staff_users (username, password_hash, role, display_name, hospital_id)
VALUES (
  'doctor2',
  encode(sha256(('swasthya-demo-salt:' || 'demo123')::bytea), 'hex'),
  'DOCTOR',
  'Dr. Preeti Sharma',
  '00000000-0000-4000-8000-000000000002'
) ON CONFLICT (username) DO UPDATE
SET hospital_id = '00000000-0000-4000-8000-000000000002';

-- desk1 for Hospital 01
INSERT INTO staff_users (username, password_hash, role, display_name, hospital_id)
VALUES (
  'desk1',
  encode(sha256(('swasthya-demo-salt:' || 'demo123')::bytea), 'hex'),
  'HOSPITAL_DESK',
  'Emergency Desk — Demo General Hospital 01',
  '00000000-0000-4000-8000-000000000001'
) ON CONFLICT (username) DO UPDATE
SET hospital_id = '00000000-0000-4000-8000-000000000001';

-- 2. HOSPITAL BEDS TABLE
CREATE TABLE IF NOT EXISTS hospital_beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ICU', 'EMERGENCY', 'MATERNITY', 'GENERAL')),
  total int NOT NULL DEFAULT 0 CHECK (total >= 0),
  available int NOT NULL DEFAULT 0 CHECK (available >= 0),
  held int NOT NULL DEFAULT 0 CHECK (held >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, type)
);

ALTER TABLE hospital_beds ENABLE ROW LEVEL SECURITY;

-- 3. HOSPITAL RESOURCES TABLE
CREATE TABLE IF NOT EXISTS hospital_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('MEDICINE', 'EQUIPMENT', 'SUPPLY')),
  status text NOT NULL CHECK (status IN ('AVAILABLE', 'LOW', 'OUT')) DEFAULT 'AVAILABLE',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, name)
);

ALTER TABLE hospital_resources ENABLE ROW LEVEL SECURITY;

-- 4. COLUMNS ON QUEUE_ENTRIES & EMERGENCY_REQUESTS & AUDIT_LOG
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS score_breakdown jsonb;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS override_reason text;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS raw_transcript text;

ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS decline_reason text;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS decline_details text;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS held_bed_type text;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS emergency_types text[] DEFAULT '{}';
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS eta_minutes int DEFAULT 10;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS is_break_glass boolean NOT NULL DEFAULT false;

-- 5. SEED BEDS & RESOURCES FOR HOSPITALS
DO $$
DECLARE
  h record;
BEGIN
  FOR h IN SELECT id, icu_beds_total, icu_beds_available FROM hospitals LOOP
    INSERT INTO hospital_beds (hospital_id, type, total, available, held, updated_at) VALUES
      (h.id, 'ICU', COALESCE(h.icu_beds_total, 20), COALESCE(h.icu_beds_available, 5), 0, now()),
      (h.id, 'EMERGENCY', 25, 12, 0, now()),
      (h.id, 'MATERNITY', 15, 6, 0, now()),
      (h.id, 'GENERAL', 80, 35, 0, now())
    ON CONFLICT (hospital_id, type) DO UPDATE
      SET available = EXCLUDED.available, total = EXCLUDED.total, updated_at = now();

    INSERT INTO hospital_resources (hospital_id, name, category, status, updated_at) VALUES
      (h.id, 'asv', 'MEDICINE', 'AVAILABLE', now()),
      (h.id, 'thrombolysis', 'MEDICINE', 'AVAILABLE', now()),
      (h.id, 'oxygen_cylinders', 'SUPPLY', 'AVAILABLE', now()),
      (h.id, 'adrenaline', 'MEDICINE', 'AVAILABLE', now()),
      (h.id, 'anti_rabies', 'MEDICINE', 'AVAILABLE', now()),
      (h.id, 'ct_scan', 'EQUIPMENT', 'AVAILABLE', now()),
      (h.id, 'cardiac_monitor', 'EQUIPMENT', 'AVAILABLE', now()),
      (h.id, 'defibrillator', 'EQUIPMENT', 'AVAILABLE', now()),
      (h.id, 'operation_theatres', 'EQUIPMENT', 'AVAILABLE', now())
    ON CONFLICT (hospital_id, name) DO NOTHING;
  END LOOP;
END $$;
