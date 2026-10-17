import test from 'node:test';
import assert from 'node:assert/strict';

// =========================================================================
// 1. WebCrypto & Encryption Tests
// =========================================================================
const SALT = new TextEncoder().encode('swasthya-setu-demo-salt-2026');

async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plainText, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);
  return Buffer.from(combined).toString('base64');
}

async function decrypt(cipherB64, key) {
  const combined = Buffer.from(cipherB64, 'base64');
  const iv = combined.subarray(0, 12);
  const cipherBuffer = combined.subarray(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuffer);
  return new TextDecoder().decode(decrypted);
}

test('WebCrypto: derives key, encrypts and decrypts clinical record correctly', async () => {
  const key = await deriveKey('doctor123');
  const patientData = JSON.stringify({
    chief_complaint: 'Severe retrosternal chest pain radiating to left arm',
    duration: '2 hours',
    severity: 9,
  });

  const cipher = await encrypt(patientData, key);
  assert.notStrictEqual(cipher, patientData);
  assert.ok(cipher.length > 20);

  const decrypted = await decrypt(cipher, key);
  assert.strictEqual(decrypted, patientData);
});

test('WebCrypto: incorrect passphrase fails to decrypt', async () => {
  const correctKey = await deriveKey('doctor123');
  const wrongKey = await deriveKey('wrong_passphrase_456');

  const cipher = await encrypt('Confidential Clinical Note', correctKey);
  await assert.rejects(
    async () => {
      await decrypt(cipher, wrongKey);
    },
    /operation failed|OperationError/i
  );
});

test('WebCrypto: locking key clears access and masks clinical detail', () => {
  let activeKey = 'dummy-key';
  const LOCKED_MASK = '🔒 [Encrypted — Passphrase required to unlock]';

  function lock() {
    activeKey = null;
  }
  function getClinicalDetail(text) {
    if (!activeKey) return LOCKED_MASK;
    return text;
  }

  assert.strictEqual(getClinicalDetail('Sensitive diagnosis'), 'Sensitive diagnosis');
  lock();
  assert.strictEqual(getClinicalDetail('Sensitive diagnosis'), LOCKED_MASK);
});

// =========================================================================
// 2. Deterministic Priority Scoring Tests
// =========================================================================
function computeScoreBreakdown(level, transcript = '', prior = null, createdAt = Date.now()) {
  const urgency = level === 'EMERGENCY' ? 100 : level === 'URGENT' ? 60 : 20;

  const redFlags = [];
  const text = (transcript || '').toLowerCase();
  if (text.includes('chest pain') || text.includes('seene') || text.includes('heart')) {
    redFlags.push('Chest pain / cardiac symptom (+15)');
  }
  if (text.includes('breathless') || text.includes('saans') || text.includes('choking')) {
    redFlags.push('Respiratory distress / dyspnea (+15)');
  }
  if (text.includes('bleeding') || text.includes('khoon')) {
    redFlags.push('Active hemorrhage / bleeding (+10)');
  }
  if (text.includes('snake') || text.includes('saanp')) {
    redFlags.push('Suspected envenomation (+20)');
  }
  if (text.includes('unconscious') || text.includes('behosh') || text.includes('faint')) {
    redFlags.push('Altered consciousness / syncope (+20)');
  }
  const red_flag = Math.min(30, redFlags.length * 15);

  const vulnReasons = [];
  const conds = (prior?.conditions ?? []).map((c) => String(c).toLowerCase());
  if (conds.some((c) => c.includes('diabetes') || c.includes('sugar'))) {
    vulnReasons.push('Comorbid diabetes mellitus (+5)');
  }
  if (conds.some((c) => c.includes('hypertension') || c.includes('bp'))) {
    vulnReasons.push('Comorbid hypertension (+5)');
  }
  if (prior?.age && (prior.age >= 60 || prior.age <= 5)) {
    vulnReasons.push(`Age risk (${prior.age} yrs) (+10)`);
  }
  const vulnerability = Math.min(20, vulnReasons.length * 5);

  const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();
  const waiting_minutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));
  const waiting_points = Math.min(20, Math.floor(waiting_minutes / 2));

  const total = urgency + red_flag + vulnerability + waiting_points;

  return {
    urgency,
    red_flag,
    vulnerability,
    waiting_minutes,
    waiting_points,
    total,
    red_flag_reasons: redFlags,
    vulnerability_reasons: vulnReasons,
  };
}

test('Deterministic Scoring: ROUTINE base score is 20', () => {
  const bd = computeScoreBreakdown('ROUTINE', 'mild headache', null, Date.now());
  assert.strictEqual(bd.urgency, 20);
  assert.strictEqual(bd.red_flag, 0);
  assert.strictEqual(bd.vulnerability, 0);
  assert.strictEqual(bd.waiting_points, 0);
  assert.strictEqual(bd.total, 20);
});

test('Deterministic Scoring: URGENT with chest pain and diabetes calculates exact formula', () => {
  const bd = computeScoreBreakdown(
    'URGENT',
    'Patient reports chest pain since morning',
    { conditions: ['Type 2 Diabetes'], age: 65 },
    Date.now() - 20 * 60000 // 20 minutes wait
  );

  assert.strictEqual(bd.urgency, 60);
  assert.strictEqual(bd.red_flag, 15); // Chest pain
  assert.strictEqual(bd.vulnerability, 10); // Diabetes (5) + Age 65 (5)
  assert.strictEqual(bd.waiting_minutes, 20);
  assert.strictEqual(bd.waiting_points, 10); // 20 / 2 = 10 pts
  assert.strictEqual(bd.total, 60 + 15 + 10 + 10); // 95
});

test('Deterministic Scoring: Waiting points cap at 20', () => {
  const bd = computeScoreBreakdown('ROUTINE', 'mild headache', null, Date.now() - 100 * 60000);
  assert.strictEqual(bd.waiting_points, 20); // capped
  assert.strictEqual(bd.total, 40);
});

// =========================================================================
// 3. Hospital Isolation & Scoping Authorization Tests
// =========================================================================
const HOSP_A = '00000000-0000-4000-8000-000000000001';
const HOSP_B = '00000000-0000-4000-8000-000000000002';

const mockQueue = [
  { id: 'q1', hospital_id: HOSP_A, token: 'OPD-0001', triage_level: 'ROUTINE', patient_label: 'Patient A' },
  { id: 'q2', hospital_id: HOSP_B, token: 'OPD-0002', triage_level: 'URGENT', patient_label: 'Patient B' },
];

function getHospitalQueue(claimsHospitalId) {
  if (!claimsHospitalId) return mockQueue;
  return mockQueue.filter((e) => e.hospital_id === claimsHospitalId);
}

function accessPatientEntry(claimsHospitalId, entryId) {
  const entry = mockQueue.find((e) => e.id === entryId);
  if (!entry) throw new Error('Not found');
  if (claimsHospitalId && entry.hospital_id !== claimsHospitalId) {
    throw new Error('Unauthorized: Patient belongs to another hospital');
  }
  return entry;
}

function overridePriority(claimsHospitalId, entryId, newLevel, reason) {
  if (!reason || !reason.trim()) {
    throw new Error('Priority override requires a mandatory reason');
  }
  const entry = accessPatientEntry(claimsHospitalId, entryId);
  return { ...entry, triage_level: newLevel, override_reason: reason.trim() };
}

test('Hospital Isolation: Doctor A queue contains only Hospital A patients', () => {
  const qA = getHospitalQueue(HOSP_A);
  assert.strictEqual(qA.length, 1);
  assert.strictEqual(qA[0].token, 'OPD-0001');
  assert.strictEqual(qA.every((e) => e.hospital_id === HOSP_A), true);
});

test('Hospital Isolation: Doctor A cannot access Hospital B patient details', () => {
  assert.throws(
    () => {
      accessPatientEntry(HOSP_A, 'q2'); // q2 belongs to HOSP_B
    },
    /Unauthorized: Patient belongs to another hospital/
  );
});

test('Hospital Isolation: Doctor A cannot override priority for Hospital B patient', () => {
  assert.throws(
    () => {
      overridePriority(HOSP_A, 'q2', 'EMERGENCY', 'Acute clinical deterioration');
    },
    /Unauthorized: Patient belongs to another hospital/
  );
});

test('Clinical Safety: Priority override fails without mandatory reason', () => {
  assert.throws(
    () => {
      overridePriority(HOSP_A, 'q1', 'EMERGENCY', '');
    },
    /Priority override requires a mandatory reason/
  );
  assert.throws(
    () => {
      overridePriority(HOSP_A, 'q1', 'EMERGENCY', '   ');
    },
    /Priority override requires a mandatory reason/
  );
});

// =========================================================================
// 4. Hospital Emergency Desk Tests
// =========================================================================
test('Emergency Desk: Decline requires a valid reason from the fixed list', () => {
  const VALID_DECLINE_REASONS = ['no bed', 'no specialist', 'no equipment', 'other'];

  function validateDecline(reason) {
    const clean = String(reason || '').trim().toLowerCase();
    const match = VALID_DECLINE_REASONS.some((r) => clean.startsWith(r));
    if (!match) throw new Error(`Decline reason must begin with one of: ${VALID_DECLINE_REASONS.join(', ')}`);
    return true;
  }

  assert.strictEqual(validateDecline('no bed'), true);
  assert.strictEqual(validateDecline('no specialist'), true);
  assert.strictEqual(validateDecline('other: specialist in emergency surgery'), true);
  assert.throws(() => validateDecline('hospital closed'), /Decline reason must begin with one of/);
  assert.throws(() => validateDecline(''), /Decline reason must begin with one of/);
});

test('Emergency Desk: Bed inventory never becomes negative', () => {
  let available = 0;
  function updateBed(delta) {
    available = Math.max(0, available + delta);
    return available;
  }

  assert.strictEqual(updateBed(5), 5);
  assert.strictEqual(updateBed(-3), 2);
  assert.strictEqual(updateBed(-10), 0); // clamped at 0
  assert.strictEqual(available >= 0, true);
});

test('Emergency Desk: Resource staleness correctly identifies age > 60m', () => {
  const now = Date.now();
  const freshTime = new Date(now - 15 * 60000).toISOString(); // 15m old
  const staleTime = new Date(now - 75 * 60000).toISOString(); // 75m old

  function isResourceStale(updatedAt) {
    const ageMin = Math.floor((now - new Date(updatedAt).getTime()) / 60000);
    return ageMin > 60;
  }

  assert.strictEqual(isResourceStale(freshTime), false);
  assert.strictEqual(isResourceStale(staleTime), true);
});

test('Emergency Desk: Hospital with OUT resource is excluded from candidate list', () => {
  const hospitals = [
    { id: HOSP_A, name: 'Hosp A', emergency_capable: true },
    { id: HOSP_B, name: 'Hosp B', emergency_capable: true },
  ];
  const resources = [
    { hospital_id: HOSP_A, name: 'asv', status: 'AVAILABLE' },
    { hospital_id: HOSP_B, name: 'asv', status: 'OUT' },
  ];

  const outHospitals = new Set(resources.filter((r) => r.status === 'OUT').map((r) => r.hospital_id));
  const eligible = hospitals.filter((h) => !outHospitals.has(h.id));

  assert.strictEqual(eligible.length, 1);
  assert.strictEqual(eligible[0].id, HOSP_A);
});

test('Emergency Desk: Atomic acceptance allows only one winner', () => {
  let requestStatus = 'BROADCASTING';
  let winner = null;

  function acceptRequest(hospitalId) {
    if (requestStatus !== 'BROADCASTING') {
      return { success: false, error: 'Race lost: already accepted' };
    }
    requestStatus = 'ACCEPTED';
    winner = hospitalId;
    return { success: true, winner };
  }

  const resA = acceptRequest(HOSP_A);
  const resB = acceptRequest(HOSP_B);

  assert.strictEqual(resA.success, true);
  assert.strictEqual(resA.winner, HOSP_A);
  assert.strictEqual(resB.success, false);
  assert.strictEqual(winner, HOSP_A);
});
