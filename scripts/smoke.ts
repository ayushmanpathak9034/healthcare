/**
 * Swasthya Setu Smoke Test Suite
 *
 * Validates the 4 core demo scenarios:
 * 1. Green patient gets a token and score.
 * 2. A patient saying chest pain under GREEN is escalated to RED.
 * 3. Emergency create goes to 3 hospitals: one declines, another accepts, others cancelled.
 * 4. Flipping antivenom to "out" removes that hospital from a snakebite request.
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

async function req<T = any>(path: string, options: { method?: string; body?: any } = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`${options.method || 'GET'} ${path} failed: ${msg}`);
  }
  return data as T;
}

let allPassed = true;

function logPass(title: string, details?: string) {
  console.log(`\x1b[32m✔ PASS:\x1b[0m ${title}`);
  if (details) console.log(`   \x1b[90m${details}\x1b[0m`);
}

function logFail(title: string, err: any) {
  allPassed = false;
  console.error(`\x1b[31m✖ FAIL:\x1b[0m ${title}`);
  console.error(`   \x1b[31m${err?.message || err}\x1b[0m`);
}

async function runSmokeTests() {
  console.log('\n======================================================');
  console.log('🩺 SWASTHYA SETU — DEMO SMOKE TEST RUNNER');
  console.log('======================================================\n');

  // Ensure server is up or start if needed
  try {
    await req('/api/demo/reset', { method: 'POST' });
  } catch (e) {
    console.log('Backend not reachable at', BASE_URL, '— starting server...');
    const { spawn } = await import('node:child_process');
    const srv = spawn('npx', ['tsx', 'server/index.ts'], {
      stdio: 'inherit',
      shell: true,
      detached: false,
    });
    // Wait for server to boot
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        await req('/api/demo/reset', { method: 'POST' });
        break;
      } catch {}
    }
  }

  // Reset demo state cleanly
  await req('/api/demo/reset', { method: 'POST' });

  // ---------------------------------------------------------
  // TEST 1: Green patient gets a token and score
  // ---------------------------------------------------------
  try {
    const submitRes = await req('/api/queue/submit', {
      body: {
        hospital_id: 'h01',
        colour: 'GREEN',
        phone: '9876543210',
        name: 'Aarav Sharma',
        language: 'en-IN',
        transcript: 'Routine checkup for seasonal allergic sneezing and cough',
        answers: [{ question: 'Duration', answer: '3 days' }],
      },
    });

    if (!submitRes.token || !submitRes.entry_id || typeof submitRes.score !== 'number') {
      throw new Error(`Invalid queue submit response: ${JSON.stringify(submitRes)}`);
    }

    if (submitRes.score < 20) {
      throw new Error(`Expected score >= 20 for GREEN, got: ${submitRes.score}`);
    }

    // Check status
    const statusRes = await req(`/api/queue/status?entry_id=${submitRes.entry_id}`);
    if (statusRes.token !== submitRes.token || statusRes.position < 1) {
      throw new Error(`Queue status verification failed: ${JSON.stringify(statusRes)}`);
    }

    logPass(
      'Test 1: Green patient gets a token and priority score',
      `Token: ${submitRes.token}, Score: ${submitRes.score}, Position: ${statusRes.position}`
    );
  } catch (err) {
    logFail('Test 1: Green patient gets a token and priority score', err);
  }

  // ---------------------------------------------------------
  // TEST 2: Patient saying chest pain under GREEN is escalated
  // ---------------------------------------------------------
  try {
    // English test
    const intakeEn = await req('/api/intake', {
      body: {
        colour: 'GREEN',
        language: 'en-IN',
        transcript: 'I have severe chest pain and left arm numbness',
        answers: [],
      },
    });

    if (intakeEn.escalated_colour !== 'RED') {
      throw new Error(`Expected escalation to RED for English chest pain, got: ${intakeEn.escalated_colour}`);
    }

    // Hinglish test
    const intakeHinglish = await req('/api/intake', {
      body: {
        colour: 'GREEN',
        language: 'hi-IN',
        transcript: 'bahut tez seene mein dard ho raha hai',
        answers: [],
      },
    });

    if (intakeHinglish.escalated_colour !== 'RED') {
      throw new Error(`Expected escalation to RED for Hinglish 'seene mein dard', got: ${intakeHinglish.escalated_colour}`);
    }

    // Devanagari test
    const intakeDevanagari = await req('/api/intake', {
      body: {
        colour: 'GREEN',
        language: 'hi-IN',
        transcript: 'सीने में दर्द और सांस लेने में भारी तकलीफ है',
        answers: [],
      },
    });

    if (intakeDevanagari.escalated_colour !== 'RED') {
      throw new Error(`Expected escalation to RED for Devanagari, got: ${intakeDevanagari.escalated_colour}`);
    }

    logPass(
      'Test 2: Patient saying chest pain under GREEN is escalated',
      `Escalated to: ${intakeEn.escalated_colour}, Reasons: ${intakeEn.reasons.join('; ')}`
    );
  } catch (err) {
    logFail('Test 2: Patient saying chest pain under GREEN is escalated', err);
  }

  // ---------------------------------------------------------
  // TEST 3: Emergency create goes to 3 hospitals: one declines, another accepts, others cancelled
  // ---------------------------------------------------------
  try {
    const createRes = await req('/api/emergency/create', {
      body: {
        emergency_types: ['cardiac_chest_pain'],
        lat: 28.6139,
        lng: 77.2090,
        transcript: 'Severe cardiac arrest suspected',
      },
    });

    const reqId = createRes.request_id;
    const candidates = createRes.candidates || [];

    if (candidates.length < 3) {
      throw new Error(`Expected 3 broadcast candidates, received ${candidates.length}`);
    }

    const hosp1 = candidates[0].id || candidates[0].hospital_id;
    const hosp2 = candidates[1].id || candidates[1].hospital_id;
    const hosp3 = candidates[2].id || candidates[2].hospital_id;

    // Hospital 1 declines
    const declineRes = await req('/api/desk/respond', {
      body: {
        request_id: reqId,
        hospital_id: hosp1,
        action: 'decline',
        reason: 'no_bed',
      },
    });

    if (!declineRes.ok) {
      throw new Error(`Hospital 1 decline failed: ${JSON.stringify(declineRes)}`);
    }

    // Hospital 2 accepts
    const acceptRes = await req('/api/desk/respond', {
      body: {
        request_id: reqId,
        hospital_id: hosp2,
        action: 'accept',
      },
    });

    if (!acceptRes.ok || acceptRes.status !== 'accepted') {
      throw new Error(`Hospital 2 accept failed: ${JSON.stringify(acceptRes)}`);
    }

    // Check emergency status
    const statusRes = await req(`/api/emergency/status?request_id=${reqId}`);
    if (statusRes.status !== 'accepted' && statusRes.status !== 'ACCEPTED') {
      throw new Error(`Expected emergency status accepted, got: ${statusRes.status}`);
    }

    // Check hospital desk incoming for hosp3 (should now be cancelled)
    const desk3 = await req(`/api/desk/incoming?hospital_id=${hosp3}`);
    const card3 = (desk3.incoming || []).find((c: any) => c.request_id === reqId);

    if (card3 && card3.my_status !== 'cancelled') {
      throw new Error(`Expected remaining hospital candidate status to be cancelled, got: ${card3.my_status}`);
    }

    logPass(
      'Test 3: Emergency create goes to 3 hospitals, 1 declines, 1 accepts, others cancelled',
      `Request: ${reqId}, Accepted by: ${hosp2}, Declined by: ${hosp1}, Cancelled: ${hosp3}`
    );
  } catch (err) {
    logFail('Test 3: Emergency create goes to 3 hospitals, 1 declines, 1 accepts, others cancelled', err);
  }

  // ---------------------------------------------------------
  // TEST 4: Flipping antivenom to "out" removes that hospital from snakebite request
  // ---------------------------------------------------------
  try {
    // Reset to clean baseline
    await req('/api/demo/reset', { method: 'POST' });

    // Initial snakebite request to identify capable hospitals
    const initialCreate = await req('/api/emergency/create', {
      body: {
        emergency_types: ['snakebite'],
        lat: 28.6139,
        lng: 77.2090,
      },
    });

    const targetHospId = initialCreate.candidates[0]?.id;
    if (!targetHospId) {
      throw new Error('No capable snakebite hospital found in initial test');
    }

    // Flip antivenom (asv) to "out" for target hospital
    const flipRes = await req('/api/demo/flip', {
      body: {
        hospital_id: targetHospId,
        resource: 'asv',
        status: 'out',
      },
    });

    if (!flipRes.ok) {
      throw new Error(`Failed to flip antivenom: ${JSON.stringify(flipRes)}`);
    }

    // Now create a new snakebite request
    const afterFlipCreate = await req('/api/emergency/create', {
      body: {
        emergency_types: ['snakebite'],
        lat: 28.6139,
        lng: 77.2090,
      },
    });

    const afterCandidates = (afterFlipCreate.candidates || []).map((c: any) => c.id || c.hospital_id);

    if (afterCandidates.includes(targetHospId)) {
      throw new Error(
        `Hospital ${targetHospId} with antivenom 'out' was still included in snakebite candidates: ${afterCandidates.join(', ')}`
      );
    }

    logPass(
      'Test 4: Flipping antivenom to "out" removes that hospital from snakebite request',
      `Hospital ${targetHospId} excluded from capable list (${afterCandidates.length} remaining candidates broadcasted)`
    );
  } catch (err) {
    logFail('Test 4: Flipping antivenom to "out" removes that hospital from snakebite request', err);
  }

  console.log('\n======================================================');
  if (allPassed) {
    console.log('🎉 ALL 4 SMOKE TESTS PASSED SUCCESSFULLY! (PASS)');
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error('❌ ONE OR MORE SMOKE TESTS FAILED! (FAIL)');
    console.log('======================================================\n');
    process.exit(1);
  }
}

runSmokeTests().catch((e) => {
  console.error('Fatal smoke test runner error:', e);
  process.exit(1);
});

