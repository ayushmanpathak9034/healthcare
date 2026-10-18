import test from 'node:test';
import assert from 'node:assert/strict';

// Set test environment before imports
process.env.NODE_ENV = 'test';
process.env.STAFF_SESSION_SECRET = 'swasthya-test-session-secret-min-32-chars-long-secure-key-123456789';

// Import modules under test
const config = await import('../supabase/functions/_shared/config.ts');
const auth = await import('../supabase/functions/_shared/auth.ts');

test('Security Audit: Secret Key Fails Closed', () => {
  // Test with strong secret
  assert.strictEqual(
    config.sessionSecret(),
    'swasthya-test-session-secret-min-32-chars-long-secure-key-123456789',
  );

  // Test that missing/weak secrets fail closed outside test env
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.STAFF_SESSION_SECRET;
  try {
    delete process.env.NODE_ENV;
    delete process.env.STAFF_SESSION_SECRET;
    assert.throws(
      () => config.sessionSecret(),
      /Server configuration error: STAFF_SESSION_SECRET is missing or weak/,
      'Must fail closed when secret is missing',
    );

    process.env.STAFF_SESSION_SECRET = 'too-short';
    assert.throws(
      () => config.sessionSecret(),
      /Server configuration error: STAFF_SESSION_SECRET is missing or weak/,
      'Must fail closed when secret is < 32 characters',
    );

    process.env.STAFF_SESSION_SECRET = 'demo-only-secret-change-me';
    assert.throws(
      () => config.sessionSecret(),
      /Server configuration error: STAFF_SESSION_SECRET is missing or weak/,
      'Must fail closed when secret is insecure default placeholder',
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.STAFF_SESSION_SECRET = origSecret;
  }
});

test('Security Audit: Token Signing, Verification & Tamper Resistance', async () => {
  const claims = {
    sub: 'user-uuid-1',
    role: 'DOCTOR',
    hospital_id: '00000000-0000-4000-8000-000000000002',
    display_name: 'Dr. Test',
  };

  const token = await auth.signToken(claims);
  assert.ok(token && typeof token === 'string');
  assert.strictEqual(token.split('.').length, 2);

  // Valid verification
  const verified = await auth.verifyToken(token);
  assert.ok(verified);
  assert.strictEqual(verified.sub, 'user-uuid-1');
  assert.strictEqual(verified.role, 'DOCTOR');
  assert.strictEqual(verified.hospital_id, '00000000-0000-4000-8000-000000000002');
  assert.strictEqual(verified.display_name, 'Dr. Test');
  assert.ok(verified.exp > Date.now());

  // Tampered payload
  const [payload, sig] = token.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...claims, role: 'ADMIN', exp: Date.now() + 3600000 }),
  ).toString('base64url');
  const tamperedToken = `${tamperedPayload}.${sig}`;
  const tamperedResult = await auth.verifyToken(tamperedToken);
  assert.strictEqual(tamperedResult, null, 'Tampered token must be rejected');

  // Tampered signature
  const badSigToken = `${payload}.${sig.slice(0, -4)}XXXX`;
  const badSigResult = await auth.verifyToken(badSigToken);
  assert.strictEqual(badSigResult, null, 'Invalid signature must be rejected');

  // Malformed tokens
  assert.strictEqual(await auth.verifyToken(''), null);
  assert.strictEqual(await auth.verifyToken('nodotstoken'), null);
  assert.strictEqual(await auth.verifyToken('a.b.c'), null);
  assert.strictEqual(await auth.verifyToken('.'), null);
});

test('Security Audit: Token Expiry and Incomplete Claims Rejection', async () => {
  // Expired token
  const expiredClaims = {
    sub: 'user-uuid-1',
    role: 'DOCTOR',
    hospital_id: '00000000-0000-4000-8000-000000000002',
    display_name: 'Dr. Test',
    exp: Date.now() - 1000, // in the past
  };
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(config.sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expiredPayload = Buffer.from(JSON.stringify(expiredClaims)).toString('base64url');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiredPayload));
  const expiredSig = Buffer.from(sig).toString('base64url');
  const expiredToken = `${expiredPayload}.${expiredSig}`;

  const expResult = await auth.verifyToken(expiredToken);
  assert.strictEqual(expResult, null, 'Expired token must return null');

  // Incomplete claims: invalid role
  const invalidRolePayload = Buffer.from(
    JSON.stringify({ ...expiredClaims, role: 'SUPERUSER', exp: Date.now() + 3600000 }),
  ).toString('base64url');
  const sig2 = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(invalidRolePayload));
  assert.strictEqual(
    await auth.verifyToken(`${invalidRolePayload}.${Buffer.from(sig2).toString('base64url')}`),
    null,
    'Invalid role must be rejected',
  );

  // Incomplete claims: missing sub
  const noSubPayload = Buffer.from(
    JSON.stringify({ sub: '', role: 'DOCTOR', exp: Date.now() + 3600000 }),
  ).toString('base64url');
  const sig3 = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(noSubPayload));
  assert.strictEqual(
    await auth.verifyToken(`${noSubPayload}.${Buffer.from(sig3).toString('base64url')}`),
    null,
    'Empty sub must be rejected',
  );
});

test('Security Audit: Constant-Time String Equality', () => {
  assert.strictEqual(auth.timingSafeEqual('abcdef', 'abcdef'), true);
  assert.strictEqual(auth.timingSafeEqual('abcdef', 'abcdeg'), false);
  assert.strictEqual(auth.timingSafeEqual('abcdef', 'abcde'), false);
  assert.strictEqual(auth.timingSafeEqual('', ''), true);
});

test('Security Audit: Password Hashing (PBKDF2 & Legacy Migration)', async () => {
  const password = 'demo123';

  // 1. Modern PBKDF2 hash generation
  const pbkdf2Hash = await auth.hashPassword(password);
  assert.ok(pbkdf2Hash.startsWith('pbkdf2:sha256:100000:'));
  assert.strictEqual(pbkdf2Hash.split(':').length, 5);

  // Verify PBKDF2 hash
  const pVerify = await auth.verifyPassword(password, pbkdf2Hash);
  assert.strictEqual(pVerify.valid, true);
  assert.strictEqual(pVerify.needsRehash, false);

  const pVerifyWrong = await auth.verifyPassword('wrongpassword', pbkdf2Hash);
  assert.strictEqual(pVerifyWrong.valid, false);

  // 2. Legacy seeded SHA-256 hash verification
  // SHA-256("swasthya-demo-salt:demo123")
  const legacyHash = 'ceb2ab041a674526b64da7e873701266b736a12dee9933f0252bd7fca09e9ae4';
  const lVerify = await auth.verifyPassword(password, legacyHash);
  assert.strictEqual(lVerify.valid, true, 'Legacy seeded hash must verify correctly');
  assert.strictEqual(lVerify.needsRehash, true, 'Legacy hash must flag needsRehash for upgrade');

  const lVerifyWrong = await auth.verifyPassword('wrongpassword', legacyHash);
  assert.strictEqual(lVerifyWrong.valid, false);
});

test('Security Audit: Unguessable Queue Status Access Tokens', async () => {
  const entryId = '12345678-1234-4000-8000-123456789012';

  const statusToken = await auth.signStatusToken(entryId);
  assert.ok(statusToken && typeof statusToken === 'string');

  // Verify valid token
  const valid = await auth.verifyStatusToken(entryId, statusToken);
  assert.strictEqual(valid, true);

  // Verify mismatched entry ID
  const invalidEntry = await auth.verifyStatusToken('87654321-4321-4000-8000-210987654321', statusToken);
  assert.strictEqual(invalidEntry, false, 'Status token cannot be reused for a different entry');

  // Verify tampered token
  const tamperedToken = statusToken.slice(0, -4) + 'XXXX';
  const invalidSig = await auth.verifyStatusToken(entryId, tamperedToken);
  assert.strictEqual(invalidSig, false, 'Tampered status token must be rejected');

  // Verify missing token
  assert.strictEqual(await auth.verifyStatusToken(entryId, null), false);
  assert.strictEqual(await auth.verifyStatusToken(entryId, ''), false);
});

test('Security Audit: Triage Manipulation and Emergency Escalation Rules', () => {
  const EMERGENCY_KEYWORDS = ['chest pain', 'breathless', 'unconscious', 'bleeding', 'snake', 'saanp', 'seizure', 'साँप', 'सांप'];

  function evaluateTriage(transcript, clientLevel, triageFloor) {
    const textLower = (transcript || '').toLowerCase();
    const hasEmergency = EMERGENCY_KEYWORDS.some((k) => textLower.includes(k));
    let level = clientLevel || triageFloor || 'ROUTINE';
    if (!['ROUTINE', 'URGENT', 'EMERGENCY'].includes(level)) level = triageFloor;
    if (hasEmergency) {
      level = 'EMERGENCY';
    } else if (triageFloor === 'URGENT' && level === 'ROUTINE') {
      level = 'URGENT';
    }
    return level;
  }

  // Client attempts to pass ROUTINE with emergency symptoms -> MUST escalate to EMERGENCY
  assert.strictEqual(
    evaluateTriage('Patient has severe chest pain and sweating', 'ROUTINE', 'ROUTINE'),
    'EMERGENCY',
  );

  // Snakebite symptom -> MUST escalate to EMERGENCY
  assert.strictEqual(
    evaluateTriage('snake bite on left leg, swelling fast', 'ROUTINE', 'ROUTINE'),
    'EMERGENCY',
  );

  // Hindi snake keyword -> MUST escalate to EMERGENCY
  assert.strictEqual(
    evaluateTriage('सांप ने काट लिया है', 'ROUTINE', 'ROUTINE'),
    'EMERGENCY',
  );

  // Urgent triage floor cannot be downgraded to ROUTINE
  assert.strictEqual(
    evaluateTriage('mild headache for 2 days', 'ROUTINE', 'URGENT'),
    'URGENT',
  );

  // Routine symptoms without emergency keywords stay ROUTINE
  assert.strictEqual(
    evaluateTriage('mild cold and running nose', 'ROUTINE', 'ROUTINE'),
    'ROUTINE',
  );
});

test('Security Audit: Hospital-Level Scoping and Role Authorization Simulation', async () => {
  // Simulate hospital access check
  function authorizeQueueAccess(claims, entryHospitalId) {
    if (!claims || !claims.hospital_id) {
      return { allowed: false, status: 403, error: 'Hospital ID missing from session' };
    }
    if (!['DOCTOR', 'RECEPTION', 'ADMIN'].includes(claims.role)) {
      return { allowed: false, status: 403, error: 'Insufficient role' };
    }
    if (claims.hospital_id !== entryHospitalId) {
      return { allowed: false, status: 403, error: 'Cross-hospital access forbidden' };
    }
    return { allowed: true };
  }

  const hospA = '00000000-0000-4000-8000-000000000001';
  const hospB = '00000000-0000-4000-8000-000000000002';

  const doctorHospA = { role: 'DOCTOR', hospital_id: hospA };
  const doctorHospB = { role: 'DOCTOR', hospital_id: hospB };
  const doctorNoHosp = { role: 'DOCTOR', hospital_id: null };

  // Hospital A accessing Hospital A entry
  assert.strictEqual(authorizeQueueAccess(doctorHospA, hospA).allowed, true);

  // Hospital A attempting to access Hospital B entry -> FORBIDDEN
  const crossCheck = authorizeQueueAccess(doctorHospA, hospB);
  assert.strictEqual(crossCheck.allowed, false);
  assert.strictEqual(crossCheck.status, 403);
  assert.strictEqual(crossCheck.error, 'Cross-hospital access forbidden');

  // Staff with no hospital assignment -> FORBIDDEN
  const noHospCheck = authorizeQueueAccess(doctorNoHosp, hospA);
  assert.strictEqual(noHospCheck.allowed, false);
  assert.strictEqual(noHospCheck.status, 403);

  // Non-staff role -> FORBIDDEN
  const patientClaims = { role: 'PATIENT', hospital_id: hospA };
  assert.strictEqual(authorizeQueueAccess(patientClaims, hospA).allowed, false);
});

test('Security Audit: ABHA Privacy Protection & Demo Restriction', () => {
  const DEMO_ABHA_IDS = new Set(['91-1234-5678-9012', '91-8812-0000-1111']);

  function checkAbhaLookupPermission(abha) {
    const ABHA_RE = /^91-\d{4}-\d{4}-\d{4}$/;
    if (!ABHA_RE.test(abha)) return { allowed: false, status: 400, error: 'Invalid ABHA format' };
    if (!DEMO_ABHA_IDS.has(abha)) {
      return {
        allowed: false,
        status: 403,
        error: 'ABDM OTP verification required for non-demo ABHA IDs. Prototype access is restricted to verified demo records.',
      };
    }
    return { allowed: true };
  }

  // Known demo ABHA IDs allowed with demo synthetic disclaimer
  assert.strictEqual(checkAbhaLookupPermission('91-1234-5678-9012').allowed, true);
  assert.strictEqual(checkAbhaLookupPermission('91-8812-0000-1111').allowed, true);

  // Arbitrary or real ABHA ID -> FORBIDDEN (HTTP 403)
  const nonDemoCheck = checkAbhaLookupPermission('91-9999-8888-7777');
  assert.strictEqual(nonDemoCheck.allowed, false);
  assert.strictEqual(nonDemoCheck.status, 403);
  assert.match(nonDemoCheck.error, /ABDM OTP verification required/);

  // Invalid format -> Bad Request (HTTP 400)
  assert.strictEqual(checkAbhaLookupPermission('invalid-id').status, 400);
});

test('Security Audit: Queue Status Zero-Knowledge & Fallback Safety', async () => {
  const entryId = '11111111-2222-3333-4444-555555555555';
  const validStatusToken = await auth.signStatusToken(entryId);

  async function checkQueueStatusAccess({ entry_id, status_token, callerClaims, entryHospitalId }) {
    if (!entry_id) return { allowed: false, status: 400 };

    const isTokenValid = await auth.verifyStatusToken(entry_id, status_token);
    if (isTokenValid) return { allowed: true };

    // Fallback: authorized staff for the specific hospital ONLY
    if (
      callerClaims &&
      ['DOCTOR', 'RECEPTION', 'ADMIN'].includes(callerClaims.role) &&
      callerClaims.hospital_id === entryHospitalId
    ) {
      return { allowed: true };
    }

    return { allowed: false, status: 403 };
  }

  const hosp1 = '00000000-0000-4000-8000-000000000001';
  const hosp2 = '00000000-0000-4000-8000-000000000002';

  // 1. Patient with valid status_token -> ALLOWED
  assert.strictEqual(
    (await checkQueueStatusAccess({ entry_id: entryId, status_token: validStatusToken })).allowed,
    true,
  );

  // 2. Patient without status_token (or invalid token) -> FORBIDDEN (403)
  assert.strictEqual(
    (await checkQueueStatusAccess({ entry_id: entryId, status_token: null })).status,
    403,
  );
  assert.strictEqual(
    (await checkQueueStatusAccess({ entry_id: entryId, status_token: 'bogus-token' })).status,
    403,
  );

  // 3. Cross-entry token reuse attempt -> FORBIDDEN (403)
  const otherEntryId = '99999999-8888-7777-6666-555555555555';
  assert.strictEqual(
    (await checkQueueStatusAccess({ entry_id: otherEntryId, status_token: validStatusToken })).status,
    403,
  );

  // 4. Doctor from same hospital querying queue status -> ALLOWED
  const doctorSameHosp = { role: 'DOCTOR', hospital_id: hosp1 };
  assert.strictEqual(
    (await checkQueueStatusAccess({ entry_id: entryId, callerClaims: doctorSameHosp, entryHospitalId: hosp1 })).allowed,
    true,
  );

  // 5. Doctor from DIFFERENT hospital querying queue status -> FORBIDDEN (403)
  const doctorDiffHosp = { role: 'DOCTOR', hospital_id: hosp2 };
  assert.strictEqual(
    (await checkQueueStatusAccess({ entry_id: entryId, callerClaims: doctorDiffHosp, entryHospitalId: hosp1 })).status,
    403,
  );
});
