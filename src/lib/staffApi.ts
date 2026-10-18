import type {
  StaffDoctorQueueEntry,
  StaffIncomingEmergencyCard,
  StaffRecord,
  StaffHospitalResourceState,
  StaffHospitalBedsState,
  Hospital,
  IntakeSummary,
} from '@/types';

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Robust fetch wrapper for all staff-side API requests.
 * Handles non-ok, non-JSON, and network error responses gracefully
 * and never throws unhandled crashes.
 */
async function safeFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    // Check if JSON response
    const contentType = res.headers.get('content-type') || '';
    let parsedBody: any = null;

    if (contentType.includes('application/json')) {
      parsedBody = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');
      parsedBody = { message: text };
    }

    if (!res.ok) {
      const errorMsg =
        parsedBody?.error?.message ||
        parsedBody?.error ||
        parsedBody?.message ||
        `Request failed with status ${res.status}`;
      return {
        ok: false,
        error: String(errorMsg),
        status: res.status,
      };
    }

    return {
      ok: true,
      data: parsedBody as T,
      status: res.status,
    };
  } catch (err) {
    const msg = (err as Error).message || 'Network error, please check connection';
    return {
      ok: false,
      error: msg,
      status: 0,
    };
  }
}

// -------------------------------------------------------------------------
// 1. Hospitals List
// -------------------------------------------------------------------------
export async function fetchStaffHospitals(): Promise<ApiResponse<{ hospitals: Hospital[] }>> {
  return safeFetch<{ hospitals: Hospital[] }>('/api/hospitals', { method: 'GET' });
}

// -------------------------------------------------------------------------
// 2. Doctor Queue Endpoints (Stage 1)
// -------------------------------------------------------------------------
export async function fetchDoctorQueue(
  hospitalId: string
): Promise<ApiResponse<{ queue: StaffDoctorQueueEntry[]; entries: StaffDoctorQueueEntry[] }>> {
  const url = `/api/doctor/queue?hospital_id=${encodeURIComponent(hospitalId)}`;
  return safeFetch<{ queue: StaffDoctorQueueEntry[]; entries: StaffDoctorQueueEntry[] }>(url, {
    method: 'GET',
  });
}

export async function overrideDoctorPriority(
  entryId: string,
  newColour: string,
  reason: string
): Promise<ApiResponse<{ ok: boolean; entry: StaffDoctorQueueEntry }>> {
  return safeFetch<{ ok: boolean; entry: StaffDoctorQueueEntry }>('/api/doctor/override', {
    method: 'POST',
    body: JSON.stringify({
      entry_id: entryId,
      new_colour: newColour,
      reason,
    }),
  });
}

export async function approveDoctorSummary(
  entryId: string,
  editedSummary: Partial<IntakeSummary>
): Promise<ApiResponse<{ ok: boolean; approved_by: string; approved_at: string }>> {
  return safeFetch<{ ok: boolean; approved_by: string; approved_at: string }>(
    '/api/doctor/approve',
    {
      method: 'POST',
      body: JSON.stringify({
        entry_id: entryId,
        edited_summary: editedSummary,
      }),
    }
  );
}

export async function lookupPatientHistory(
  abhaId: string
): Promise<
  ApiResponse<{
    patient: {
      name: string;
      age: number;
      gender: string;
      conditions: string[];
      medicines: string[];
      allergies: string[];
      past_visits: string[];
    } | null;
  }>
> {
  return safeFetch('/api/patient/lookup', {
    method: 'POST',
    body: JSON.stringify({ abha_id: abhaId }),
  });
}

// -------------------------------------------------------------------------
// 3. Hospital Desk Endpoints (Stage 2)
// -------------------------------------------------------------------------
export async function fetchDeskIncoming(
  hospitalId: string
): Promise<ApiResponse<{ incoming: StaffIncomingEmergencyCard[] }>> {
  const url = `/api/desk/incoming?hospital_id=${encodeURIComponent(hospitalId)}`;
  return safeFetch<{ incoming: StaffIncomingEmergencyCard[] }>(url, {
    method: 'GET',
  });
}

export async function respondDeskEmergency(
  requestId: string,
  hospitalId: string,
  action: 'accept' | 'decline',
  reason?: string
): Promise<ApiResponse<{ ok: boolean; status: string }>> {
  return safeFetch<{ ok: boolean; status: string }>('/api/desk/respond', {
    method: 'POST',
    body: JSON.stringify({
      request_id: requestId,
      hospital_id: hospitalId,
      action,
      reason,
    }),
  });
}

// -------------------------------------------------------------------------
// 4. Resource Panel & Demo Tools (Stage 3)
// -------------------------------------------------------------------------
export async function fetchHospitalResources(
  hospitalId: string
): Promise<
  ApiResponse<{
    hospital_id: string;
    name: string;
    beds: StaffHospitalBedsState;
    resources: Record<string, StaffHospitalResourceState>;
  }>
> {
  const url = `/api/hospital/resources?hospital_id=${encodeURIComponent(hospitalId)}`;
  return safeFetch(url, { method: 'GET' });
}

export async function updateHospitalBeds(
  hospitalId: string,
  bedType: 'icu' | 'general' | 'ot',
  available: number
): Promise<ApiResponse<{ ok: boolean; beds: StaffHospitalBedsState }>> {
  return safeFetch<{ ok: boolean; beds: StaffHospitalBedsState }>('/api/hospital/beds', {
    method: 'PATCH',
    body: JSON.stringify({
      hospital_id: hospitalId,
      bed_type: bedType,
      available,
    }),
  });
}

export async function updateHospitalResource(
  hospitalId: string,
  resource: string,
  status: 'available' | 'low' | 'out'
): Promise<ApiResponse<{ ok: boolean; resource: StaffHospitalResourceState }>> {
  return safeFetch<{ ok: boolean; resource: StaffHospitalResourceState }>(
    '/api/hospital/resources',
    {
      method: 'PATCH',
      body: JSON.stringify({
        hospital_id: hospitalId,
        resource,
        status,
      }),
    }
  );
}

export async function demoReset(): Promise<ApiResponse<{ ok: boolean; message: string }>> {
  return safeFetch<{ ok: boolean; message: string }>('/api/demo/reset', {
    method: 'POST',
  });
}

export async function demoFlip(
  hospitalId: string,
  resource: string,
  status: 'available' | 'out'
): Promise<ApiResponse<{ ok: boolean }>> {
  return safeFetch<{ ok: boolean }>('/api/demo/flip', {
    method: 'POST',
    body: JSON.stringify({
      hospital_id: hospitalId,
      resource,
      status,
    }),
  });
}

export async function demoSimulateStale(
  hospitalId: string
): Promise<ApiResponse<{ ok: boolean; message: string }>> {
  return safeFetch<{ ok: boolean; message: string }>('/api/demo/stale', {
    method: 'POST',
    body: JSON.stringify({ hospital_id: hospitalId }),
  });
}

// -------------------------------------------------------------------------
// 5. Patient Records (Stage 4)
// -------------------------------------------------------------------------
export async function fetchPatientRecords(
  entryId: string,
  abhaId?: string
): Promise<ApiResponse<{ entry_id: string; patient_name: string; records: StaffRecord[] }>> {
  const query = new URLSearchParams({ entry_id: entryId });
  if (abhaId) query.append('abha_id', abhaId);
  const url = `/api/records?${query.toString()}`;
  return safeFetch(url, { method: 'GET' });
}
