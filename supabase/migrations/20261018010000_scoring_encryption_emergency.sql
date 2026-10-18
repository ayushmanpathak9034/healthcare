/*
# Swasthya Setu — Scoring, Encryption, Emergency Coordination & Audit Hash-Chain

1. Additive Schema Changes
   - `queue_entries`:
     - `colour`: generated stored column mapped from canonical `triage_level` (ROUTINE -> GREEN, URGENT -> YELLOW, EMERGENCY -> RED).
     - `score_breakdown`: JSON breakdown of deterministic scoring factors.
     - `arrival_time`: timestamp for wait-aging calculation.
     - `encrypted_payload`: opaque client-encrypted case payload.
     - `patient_id`: link to patient record.
   - `emergency_requests`:
     - `emergency_types`: clinical emergency tag array (e.g. ['snakebite']).
     - `current_target_hospital_ids`: UUID array of the top 3 hospitals in the current broadcast round.
     - `round`: broadcast round counter (1 or 2).
     - `fallback_hospital_id`: hospital designated if round 2 times out.
     - `encrypted_summary`: opaque client-encrypted case summary.
     - `patient_id`: link to patient record.
     - Updated CHECK constraint on `status` to allow 'EXPIRED_FALLBACK'.
   - `hospitals`:
     - `public_key`: RSA-OAEP / ECDH public key (PEM string, default NULL until provisioned with real verified demo keys).
     - `key_id`: identifier for key rotation (e.g. 'HOSP-01-V1').
     - `emergency_beds_available`: emergency bed inventory.
     - `general_beds_available`: general bed inventory.
     - `capabilities`: structured JSON capabilities.
   - `staff_users`:
     - `wrapped_private_key`: doctor RSA private key wrapped with doctor passphrase-derived key.
     - `key_salt`: salt used for PBKDF2 key derivation.
     - Updated CHECK constraint on `role` to include 'HOSPITAL_DESK'.
   - `audit_log`:
     - `sequence_no`: monotonically increasing sequence for linear chain head.
     - `prev_hash`: SHA-256 hash of the immediately preceding audit row (NULL for legacy rows prior to this migration).
     - `hash`: SHA-256 hash of current row + prev_hash.
     - `mode`: 'normal' or 'break_glass'.

2. New Tables
   - `bed_holds`: tracks held beds with expiration timestamps, release reasons, and exactly-once release state.
   - `audit_chain_head`: single-row serialized head tracker for concurrent-safe audit hash chaining.
   - `patient_identities`: server-verified phone and ABHA pairings for authenticated patient sessions.
   - `family_verifications`: explicit verified family relationships linked to a patient identity.

3. Stored Procedures (Atomic Operations & Anti-Spoofing)
   - `rpc_accept_emergency`: atomic row-locked acceptance, desk staff verification, capability check, bed deduction, and hold creation.
   - `rpc_release_bed_hold`: idempotent, strictly authorized exactly-once bed replenishment.
   - `sweep_emergency_timeouts`: restricted server-side timeout evaluator that advances rounds or falls back without overwriting acceptances.

4. Row Level Security Policies
   - Policies for `authenticated` role inspecting custom `app_role` and `hospital_id` / `patient_id` claims.
*/

-- Ensure cryptographic extension is available for standard SHA-256 digest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ 1. HOSPITALS ADDITIONS ============
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS public_key text DEFAULT NULL;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS key_id text DEFAULT NULL;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS emergency_beds_available int NOT NULL DEFAULT 5 CHECK (emergency_beds_available >= 0);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS general_beds_available int NOT NULL DEFAULT 20 CHECK (general_beds_available >= 0);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Populate structured capabilities from raw column if capabilities is empty
UPDATE hospitals
SET capabilities = jsonb_build_object(
  'emergency', COALESCE(emergency_capable, true),
  'toxicology', COALESCE(raw->'capabilities'->>'toxicology', 'none'),
  'cardiology', (specialties @> ARRAY['Cardiology']::text[]),
  'trauma', (specialties @> ARRAY['Trauma']::text[])
)
WHERE capabilities = '{}'::jsonb;

-- ============ 2. STAFF_USERS ADDITIONS & ROLES ============
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS wrapped_private_key text;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS key_salt text;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('DOCTOR','RECEPTION','ADMIN','HOSPITAL_DESK'));

-- Safely link only the specific seeded demo staff accounts to the seeded demo hospital
UPDATE staff_users
SET hospital_id = '00000000-0000-4000-8000-000000000002'
WHERE username IN ('doctor1', 'reception1')
  AND hospital_id IS NULL
  AND EXISTS (SELECT 1 FROM hospitals WHERE id = '00000000-0000-4000-8000-000000000002');

-- ============ 3. QUEUE ENTRIES ADDITIONS ============
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS arrival_time timestamptz NOT NULL DEFAULT now();
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS encrypted_payload jsonb;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id);
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS status_token text;

-- Generated colour column eliminates conflicting duplicate sources of truth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'queue_entries' AND column_name = 'colour'
  ) THEN
    ALTER TABLE queue_entries ADD COLUMN colour text GENERATED ALWAYS AS (
      CASE
        WHEN triage_level = 'ROUTINE' THEN 'GREEN'
        WHEN triage_level = 'URGENT' THEN 'YELLOW'
        ELSE 'RED'
      END
    ) STORED;
  END IF;
END $$;

-- ============ 4. EMERGENCY REQUESTS ADDITIONS & STATUS EXPANSION ============
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS current_target_hospital_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS round int NOT NULL DEFAULT 1 CHECK (round >= 1);
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS fallback_hospital_id uuid REFERENCES hospitals(id);
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS emergency_types text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS encrypted_summary jsonb;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id);
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE emergency_requests DROP CONSTRAINT IF EXISTS emergency_requests_status_check;
ALTER TABLE emergency_requests ADD CONSTRAINT emergency_requests_status_check
  CHECK (status IN ('BROADCASTING','ACCEPTED','DECLINED_ALL','CANCELLED','EXPIRED_FALLBACK'));

-- ============ 5. BED HOLDS TABLE ============
CREATE TABLE IF NOT EXISTS bed_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_request_id uuid NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  bed_type text NOT NULL CHECK (bed_type IN ('icu','emergency','general')),
  expires_at timestamptz NOT NULL,
  released boolean NOT NULL DEFAULT false,
  release_reason text CHECK (release_reason IS NULL OR release_reason IN ('EXPIRED_HOLD_TIMEOUT','SYSTEM_CASCADE_CLEANUP','PATIENT_ARRIVED','PATIENT_TRANSFERRED','ADMISSION_CANCELLED','DESK_MANUAL_RELEASE')),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bed_holds_active ON bed_holds(hospital_id, released, expires_at);
CREATE INDEX IF NOT EXISTS idx_bed_holds_emergency_req ON bed_holds(emergency_request_id);

-- ============ 6. PATIENT IDENTITIES & FAMILY VERIFICATIONS ============
CREATE TABLE IF NOT EXISTS patient_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ref uuid REFERENCES patients(id),
  abha_id text UNIQUE,
  phone text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_identities_phone ON patient_identities(phone);

CREATE TABLE IF NOT EXISTS family_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_identity_id uuid NOT NULL REFERENCES patient_identities(id) ON DELETE CASCADE,
  family_phone text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('parent','child','spouse','guardian','emergency_proxy')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_identity_id, family_phone)
);

-- ============ 7. AUDIT LOG HASH CHAINING (CONCURRENCY-SAFE HEAD TRACKER) ============
-- NOTE ON LEGACY DATA:
-- Pre-existing audit records inserted prior to this migration have NULL in prev_hash and hash.
-- They are preserved as append-only records under the existing audit_log_append_only trigger.
-- Cryptographic hash chaining initiates with audit_chain_head for all rows inserted from this migration onwards.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS sequence_no bigserial;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash text DEFAULT NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS hash text DEFAULT NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'normal'
  CHECK (mode IN ('normal','break_glass'));

-- Dedicated single-row table to strictly serialize the audit chain head across concurrent transactions
CREATE TABLE IF NOT EXISTS audit_chain_head (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_hash text NOT NULL,
  last_sequence_no bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO audit_chain_head (id, last_hash, last_sequence_no)
VALUES (1, 'GENESIS_HASH_SWASTHYA_SETU_V1', 0)
ON CONFLICT (id) DO NOTHING;

-- Prevent deletion or truncate of the chain head
CREATE OR REPLACE FUNCTION block_chain_head_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_chain_head cannot be deleted or truncated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_chain_head_no_delete ON audit_chain_head;
CREATE TRIGGER audit_chain_head_no_delete
  BEFORE DELETE OR TRUNCATE ON audit_chain_head
  FOR EACH STATEMENT EXECUTE FUNCTION block_chain_head_mutation();

CREATE OR REPLACE FUNCTION set_audit_hash() RETURNS trigger AS $$
DECLARE
  v_head record;
  v_normalized text;
BEGIN
  -- Strict row-level lock on the single chain-head row serializes concurrent audit inserts
  -- guaranteeing no two transactions can read the same previous hash simultaneously.
  SELECT * INTO v_head FROM audit_chain_head WHERE id = 1 FOR UPDATE;

  NEW.prev_hash := v_head.last_hash;
  -- Enforce server-side timestamp so caller-supplied timestamps cannot forge history
  NEW.ts := now();

  -- Normalize every nullable field explicitly (convert nulls to empty string / empty json)
  v_normalized := COALESCE(NEW.prev_hash, '') || '|' ||
                  to_char(NEW.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
                  COALESCE(TRIM(NEW.role), '') || '|' ||
                  COALESCE(TRIM(NEW.action), '') || '|' ||
                  COALESCE(TRIM(NEW.patient_ref), '') || '|' ||
                  COALESCE(TRIM(NEW.mode), 'normal') || '|' ||
                  COALESCE(NEW.details::text, '{}');

  NEW.hash := encode(digest(v_normalized, 'sha256'), 'hex');

  -- Update head tracker to this transaction's newly generated hash
  UPDATE audit_chain_head
  SET last_hash = NEW.hash,
      last_sequence_no = v_head.last_sequence_no + 1,
      updated_at = now()
  WHERE id = 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_set_hash ON audit_log;
CREATE TRIGGER audit_log_set_hash
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION set_audit_hash();

-- ============ 8. ATOMIC EMERGENCY ACCEPTANCE RPC ============
-- Clean up any previous function overloads to prevent ambiguous or weaker authorization signatures
DROP FUNCTION IF EXISTS rpc_accept_emergency(uuid, text, int);
DROP FUNCTION IF EXISTS rpc_accept_emergency(uuid, text, int, uuid);

CREATE OR REPLACE FUNCTION rpc_accept_emergency(
  p_request_id uuid,
  p_bed_type text,      -- 'icu', 'emergency', or 'general'
  p_eta_minutes int,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_hospital_id uuid;
  v_staff record;
  v_req record;
  v_hosp record;
  v_available int;
  v_hold_id uuid;
  v_expires_at timestamptz;
  v_toxicology text;
BEGIN
  -- 1. Identity & Staff Membership Verification (No arbitrary hospital ID trusted)
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    -- Edge Function gateway invocation: must supply verified staff user ID
    IF p_staff_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Staff identity required for emergency acceptance');
    END IF;
    SELECT id, role, hospital_id INTO v_staff FROM staff_users WHERE id = p_staff_user_id;
    IF NOT FOUND OR v_staff.hospital_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Staff user not found or unassigned to a hospital');
    END IF;
    v_caller_role := v_staff.role;
    v_caller_hospital_id := v_staff.hospital_id;
  ELSE
    -- Direct PostgREST invocation: derive identity from cryptographically verified claims
    v_caller_role := auth.jwt() ->> 'app_role';
    v_caller_hospital_id := (auth.jwt() ->> 'hospital_id')::uuid;
  END IF;

  -- 2. Reject unauthorized roles: Doctors do NOT accept incoming ambulances (Desk / Admin only)
  IF v_caller_hospital_id IS NULL OR v_caller_role NOT IN ('HOSPITAL_DESK', 'ADMIN') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Caller role not authorized for emergency acceptance (hospital desk/admin only)');
  END IF;

  -- 3. Validate bed type parameter explicitly
  IF p_bed_type NOT IN ('icu', 'emergency', 'general') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_BED_TYPE', 'message', 'Bed type must be icu, emergency, or general');
  END IF;

  -- 4. Validate ETA parameter explicitly
  IF p_eta_minutes IS NULL OR p_eta_minutes < 1 OR p_eta_minutes > 180 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ETA', 'message', 'ETA must be between 1 and 180 minutes');
  END IF;

  -- 5. Lock emergency request for update (prevent competing acceptance races)
  SELECT * INTO v_req FROM emergency_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Emergency request not found');
  END IF;

  -- 6. Idempotency check: Already accepted by this hospital
  IF v_req.status = 'ACCEPTED' AND v_req.accepted_hospital_id = v_caller_hospital_id THEN
    RETURN jsonb_build_object('ok', true, 'status', 'ACCEPTED', 'already_accepted', true);
  END IF;

  -- 7. Competing acceptance check: Already accepted by another hospital or cancelled
  IF v_req.status != 'BROADCASTING' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_RESOLVED', 'status', v_req.status);
  END IF;

  -- 8. Membership verification: Hospital must be in active broadcast targets
  IF NOT (v_caller_hospital_id = ANY(v_req.current_target_hospital_ids)) AND v_caller_hospital_id != v_req.current_target_hospital_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_TARGETED', 'message', 'Hospital is not an active broadcast target');
  END IF;

  -- 9. Hospital capability & emergency capability check
  SELECT * INTO v_hosp FROM hospitals WHERE id = v_caller_hospital_id FOR UPDATE;
  IF NOT FOUND OR v_hosp.emergency_capable = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_EMERGENCY_CAPABLE', 'message', 'Hospital is not designated emergency capable');
  END IF;

  -- Check required capabilities against emergency types (e.g. snakebite requires toxicology 24x7 or day only)
  IF 'snakebite' = ANY(v_req.emergency_types) THEN
    v_toxicology := COALESCE(v_hosp.capabilities->>'toxicology', v_hosp.raw->'capabilities'->>'toxicology', 'none');
    IF v_toxicology NOT IN ('24x7', 'day only') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'CAPABILITY_MISMATCH',
        'message', 'Hospital lacks required toxicology capability for snakebite (found: ' || v_toxicology || ', required: 24x7 or day only)'
      );
    END IF;
  END IF;

  -- 10. Resource validation & atomic bed reservation
  IF p_bed_type = 'icu' THEN
    v_available := v_hosp.icu_beds_available;
    IF v_available <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_BEDS', 'message', 'No ICU beds available');
    END IF;
    UPDATE hospitals SET icu_beds_available = icu_beds_available - 1 WHERE id = v_caller_hospital_id;
  ELSIF p_bed_type = 'emergency' THEN
    v_available := v_hosp.emergency_beds_available;
    IF v_available <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_BEDS', 'message', 'No emergency beds available');
    END IF;
    UPDATE hospitals SET emergency_beds_available = emergency_beds_available - 1 WHERE id = v_caller_hospital_id;
  ELSE
    v_available := v_hosp.general_beds_available;
    IF v_available <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_BEDS', 'message', 'No general beds available');
    END IF;
    UPDATE hospitals SET general_beds_available = general_beds_available - 1 WHERE id = v_caller_hospital_id;
  END IF;

  -- 11. Create held bed record (ETA + 15 min buffer)
  v_expires_at := now() + ((p_eta_minutes + 15) || ' minutes')::interval;
  INSERT INTO bed_holds (emergency_request_id, hospital_id, bed_type, expires_at, released)
  VALUES (p_request_id, v_caller_hospital_id, p_bed_type, v_expires_at, false)
  RETURNING id INTO v_hold_id;

  -- 12. Transition request to ACCEPTED
  UPDATE emergency_requests
  SET status = 'ACCEPTED',
      accepted_hospital_id = v_caller_hospital_id,
      accepted_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ACCEPTED',
    'hold_id', v_hold_id,
    'expires_at', v_expires_at,
    'hospital_id', v_caller_hospital_id
  );
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_accept_emergency(uuid, text, int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_accept_emergency(uuid, text, int, uuid) TO authenticated, service_role;

-- ============ 9. ATOMIC BED RELEASE RPC ============
-- Clean up any previous function overloads
DROP FUNCTION IF EXISTS rpc_release_bed_hold(uuid, text);
DROP FUNCTION IF EXISTS rpc_release_bed_hold(uuid, text, uuid);

CREATE OR REPLACE FUNCTION rpc_release_bed_hold(
  p_hold_id uuid,
  p_reason text,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold record;
  v_caller_role text;
  v_caller_hospital_id uuid;
  v_staff record;
  v_clean_reason text;
BEGIN
  -- 1. Explicit reason validation: reject null, whitespace, or unsupported reasons
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Release reason cannot be null or empty');
  END IF;
  v_clean_reason := TRIM(p_reason);
  IF v_clean_reason NOT IN ('EXPIRED_HOLD_TIMEOUT','SYSTEM_CASCADE_CLEANUP','PATIENT_ARRIVED','PATIENT_TRANSFERRED','ADMISSION_CANCELLED','DESK_MANUAL_RELEASE') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_REASON', 'message', 'Release reason not permitted');
  END IF;

  -- 2. Find the hold record
  SELECT * INTO v_hold FROM bed_holds WHERE id = p_hold_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Bed hold not found');
  END IF;

  -- 3. Caller Authorization Verification
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    -- Edge Function gateway invocation or automated sweep
    IF p_staff_user_id IS NOT NULL THEN
      -- Staff-mediated release via Edge Function
      SELECT hospital_id, role INTO v_staff FROM staff_users WHERE id = p_staff_user_id;
      IF NOT FOUND OR v_staff.hospital_id != v_hold.hospital_id OR v_staff.role NOT IN ('HOSPITAL_DESK', 'ADMIN') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Staff user not authorized to release hold for this hospital');
      END IF;
      IF v_clean_reason NOT IN ('PATIENT_ARRIVED','PATIENT_TRANSFERRED','ADMISSION_CANCELLED','DESK_MANUAL_RELEASE') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Staff release requires clinical/desk release reason');
      END IF;
    ELSE
      -- Automated server-side timeout/sweep release
      IF v_clean_reason NOT IN ('EXPIRED_HOLD_TIMEOUT', 'SYSTEM_CASCADE_CLEANUP') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Automated system release restricted to timeout reasons');
      END IF;
    END IF;
  ELSE
    -- Authenticated client call: caller must belong to the hospital holding the bed
    v_caller_role := auth.jwt() ->> 'app_role';
    v_caller_hospital_id := (auth.jwt() ->> 'hospital_id')::uuid;
    IF v_caller_hospital_id IS NULL OR v_caller_hospital_id != v_hold.hospital_id OR v_caller_role NOT IN ('HOSPITAL_DESK', 'ADMIN') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Unauthorized to release bed hold for another hospital');
    END IF;
    IF v_clean_reason NOT IN ('PATIENT_ARRIVED','PATIENT_TRANSFERRED','ADMISSION_CANCELLED','DESK_MANUAL_RELEASE') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Staff release requires clinical/desk release reason');
    END IF;
  END IF;

  -- 4. Exactly-once atomic conditional update (races will fail here)
  UPDATE bed_holds
  SET released = true, release_reason = v_clean_reason, released_at = now()
  WHERE id = p_hold_id AND released = false
  RETURNING * INTO v_hold;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_RELEASED', 'message', 'Hold already released or not found');
  END IF;

  -- 5. Replenish hospital bed inventory exactly once
  IF v_hold.bed_type = 'icu' THEN
    UPDATE hospitals SET icu_beds_available = icu_beds_available + 1 WHERE id = v_hold.hospital_id;
  ELSIF v_hold.bed_type = 'emergency' THEN
    UPDATE hospitals SET emergency_beds_available = emergency_beds_available + 1 WHERE id = v_hold.hospital_id;
  ELSE
    UPDATE hospitals SET general_beds_available = general_beds_available + 1 WHERE id = v_hold.hospital_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'released_hold_id', p_hold_id, 'hospital_id', v_hold.hospital_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_release_bed_hold(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_release_bed_hold(uuid, text, uuid) TO authenticated, service_role;

-- ============ 10. TIMEOUT SWEEPER (SECURITY DEFINER, SESSION/JWT GUARD) ============
DROP FUNCTION IF EXISTS sweep_emergency_timeouts();

CREATE OR REPLACE FUNCTION sweep_emergency_timeouts()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_advanced_count int := 0;
  v_fallback_count int := 0;
  v_expired_holds_count int := 0;
  v_hold record;
  v_next_targets uuid[];
  v_fallback_hosp uuid;
BEGIN
  -- Strict caller guard: verify original session/JWT identity, not SECURITY DEFINER current_user
  IF NOT (
    (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (session_user IN ('postgres', 'supabase_admin'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: sweep_emergency_timeouts can only be executed by internal scheduler or service role';
  END IF;

  -- A. Sweep expired bed holds (holds where patient never arrived within buffer)
  FOR v_hold IN
    SELECT id FROM bed_holds
    WHERE released = false AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM rpc_release_bed_hold(v_hold.id, 'EXPIRED_HOLD_TIMEOUT');
    v_expired_holds_count := v_expired_holds_count + 1;
  END LOOP;

  -- B. Sweep overdue emergency requests in BROADCASTING status
  FOR v_req IN
    SELECT * FROM emergency_requests
    WHERE status = 'BROADCASTING' AND target_deadline_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_req.round = 1 THEN
      -- Advance from Round 1 (top 3) to Round 2 (next 3 capable hospitals)
      SELECT ARRAY_AGG(id) INTO v_next_targets FROM (
        SELECT id FROM hospitals
        WHERE emergency_capable = true
          AND NOT (id = ANY(COALESCE(v_req.current_target_hospital_ids, '{}'::uuid[])))
          AND id != COALESCE(v_req.current_target_hospital_id, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY
          CASE WHEN v_req.lat IS NOT NULL AND v_req.lng IS NOT NULL
            THEN (lat - v_req.lat)^2 + (lng - v_req.lng)^2
            ELSE 0 END ASC
        LIMIT 3
      ) sub;

      IF v_next_targets IS NOT NULL AND array_length(v_next_targets, 1) > 0 THEN
        UPDATE emergency_requests
        SET round = 2,
            current_target_hospital_ids = v_next_targets,
            current_target_hospital_id = v_next_targets[1],
            target_deadline_at = now() + interval '60 seconds'
        WHERE id = v_req.id;
        v_advanced_count := v_advanced_count + 1;
      ELSE
        -- No secondary hospitals available; trigger immediate fallback
        SELECT id INTO v_fallback_hosp FROM hospitals WHERE emergency_capable = true LIMIT 1;
        UPDATE emergency_requests
        SET status = 'EXPIRED_FALLBACK',
            fallback_hospital_id = v_fallback_hosp
        WHERE id = v_req.id;
        v_fallback_count := v_fallback_count + 1;
      END IF;

    ELSE
      -- Round 2 timed out without acceptance -> Transition to EXPIRED_FALLBACK
      SELECT id INTO v_fallback_hosp FROM hospitals
      WHERE emergency_capable = true
      ORDER BY
        CASE WHEN v_req.lat IS NOT NULL AND v_req.lng IS NOT NULL
          THEN (lat - v_req.lat)^2 + (lng - v_req.lng)^2
          ELSE 0 END ASC
      LIMIT 1;

      UPDATE emergency_requests
      SET status = 'EXPIRED_FALLBACK',
          fallback_hospital_id = v_fallback_hosp
      WHERE id = v_req.id;
      v_fallback_count := v_fallback_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'advanced_round_2', v_advanced_count,
    'fallback_expired', v_fallback_count,
    'released_holds', v_expired_holds_count
  );
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION sweep_emergency_timeouts() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sweep_emergency_timeouts() TO service_role;

-- ============ 11. ROW-LEVEL SECURITY POLICIES ============
ALTER TABLE bed_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_verifications ENABLE ROW LEVEL SECURITY;

-- Allow authenticated doctors to view queue entries of their own hospital
DROP POLICY IF EXISTS "doctor_view_hospital_queue" ON queue_entries;
CREATE POLICY "doctor_view_hospital_queue" ON queue_entries
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'app_role' = 'DOCTOR' AND hospital_id = (auth.jwt() ->> 'hospital_id')::uuid)
  OR
  (auth.jwt() ->> 'app_role' IN ('PATIENT','FAMILY') AND patient_id = (auth.jwt() ->> 'patient_id')::uuid)
);

-- Allow hospital desk to view and update emergency requests directed to their hospital
DROP POLICY IF EXISTS "hospital_desk_view_emergencies" ON emergency_requests;
CREATE POLICY "hospital_desk_view_emergencies" ON emergency_requests
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'app_role' IN ('HOSPITAL_DESK','ADMIN') AND (
    (auth.jwt() ->> 'hospital_id')::uuid = ANY(current_target_hospital_ids)
    OR (auth.jwt() ->> 'hospital_id')::uuid = current_target_hospital_id
    OR (auth.jwt() ->> 'hospital_id')::uuid = accepted_hospital_id
  ))
  OR
  (auth.jwt() ->> 'app_role' IN ('PATIENT','FAMILY') AND patient_id = (auth.jwt() ->> 'patient_id')::uuid)
);
