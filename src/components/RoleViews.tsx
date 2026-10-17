import { useEffect, useState } from 'react';
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  Bed,
  Activity,
  Flame,
  Check,
  X,
} from 'lucide-react';
import {
  doctorQueue,
  doctorOverride,
  doctorApprove,
  deskIncoming,
  deskRespond,
  updateHospitalResource,
  updateHospitalBeds,
  demoFlip,
  type DoctorQueueEntry,
  type DeskEmergencyCard,
} from '@/lib/api';
import type { LangCode } from '@/types';

const LEVEL_STYLE: Record<string, string> = {
  ROUTINE: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  GREEN: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  URGENT: 'bg-amber-100 text-amber-900 border-amber-300',
  YELLOW: 'bg-amber-100 text-amber-900 border-amber-300',
  EMERGENCY: 'bg-red-100 text-red-900 border-red-300',
  RED: 'bg-red-100 text-red-900 border-red-300',
};

// ==================== DOCTOR VIEW ====================

export function DoctorView({
  lang,
  hospitalId = 'h01',
}: {
  lang: LangCode;
  hospitalId?: string;
}) {
  const [queue, setQueue] = useState<DoctorQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Override state
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideColour, setOverrideColour] = useState<'GREEN' | 'YELLOW' | 'RED'>('YELLOW');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // Edit/approve state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedComplaint, setEditedComplaint] = useState('');

  // 3-second live polling
  useEffect(() => {
    let active = true;

    async function fetchQueue() {
      try {
        const res = await doctorQueue(hospitalId);
        if (active) {
          setQueue(res.queue || res.entries || []);
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchQueue();
    const timer = setInterval(fetchQueue, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hospitalId]);

  async function handleOverride(entryId: string) {
    if (!overrideReason.trim()) {
      alert('Override reason is mandatory.');
      return;
    }
    setActionBusy(true);
    try {
      await doctorOverride(entryId, overrideColour, overrideReason.trim());
      setOverrideId(null);
      setOverrideReason('');
      const res = await doctorQueue(hospitalId);
      setQueue(res.queue || res.entries || []);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApprove(entry: DoctorQueueEntry) {
    setActionBusy(true);
    try {
      const summaryToSave = {
        ...entry.draft_summary,
        chief_complaint: editingId === entry.id ? editedComplaint : entry.draft_summary.chief_complaint,
      };
      await doctorApprove(entry.id, summaryToSave);
      setEditingId(null);
      const res = await doctorQueue(hospitalId);
      setQueue(res.queue || res.entries || []);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
          Doctor Live Queue ({queue.length} patients)
        </h2>
        <span className="text-xs text-emerald-700 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 animate-pulse text-emerald-600" /> Auto-updating every 3s
        </span>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded-lg">{error}</div>}

      {loading && queue.length === 0 ? (
        <div className="card p-8 flex items-center justify-center gap-2 text-emerald-700">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading live triage queue…
        </div>
      ) : queue.length === 0 ? (
        <div className="card p-8 text-center text-emerald-700">
          No patients waiting in queue for this hospital.
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((entry, idx) => {
            const isExpanded = expandedId === entry.id;
            const colourBadgeClass = LEVEL_STYLE[entry.colour] || LEVEL_STYLE.GREEN;

            return (
              <div
                key={entry.id || entry.token || idx}
                className="card p-4 space-y-3 border-2 border-emerald-100 hover:border-emerald-300 transition-colors"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-black text-xl text-emerald-950">{entry.token}</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${colourBadgeClass}`}
                    >
                      {entry.colour}
                    </span>
                    <span className="font-semibold text-emerald-900 text-sm">
                      {entry.patient_label || 'Patient'}
                    </span>
                    {entry.abha_id && (
                      <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                        ABHA: {entry.abha_id}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-900 text-white font-extrabold text-sm px-3 py-1 rounded-lg">
                      Score: {entry.score}
                    </div>
                    {entry.status === 'APPROVED' ? (
                      <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approved
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditedComplaint(entry.draft_summary.chief_complaint);
                        }}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5 py-1 rounded"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="p-1 hover:bg-emerald-50 rounded text-emerald-800"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Review Flags */}
                {entry.review_flags && entry.review_flags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.review_flags.map((flag, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> {flag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Side-by-Side: AI Summary & Raw Transcript */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-xs">
                  <div className="space-y-1">
                    <span className="font-bold text-emerald-900 block uppercase tracking-wide">
                      AI Draft Summary
                    </span>
                    {editingId === entry.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editedComplaint}
                          onChange={(e) => setEditedComplaint(e.target.value)}
                          className="w-full border border-emerald-300 rounded p-1.5 text-xs text-emerald-950 font-medium"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(entry)}
                            disabled={actionBusy}
                            className="bg-emerald-700 text-white px-2 py-0.5 rounded font-bold"
                          >
                            Save & Approve
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-emerald-700 underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-emerald-950 font-semibold">
                          {entry.draft_summary?.chief_complaint || 'No complaint details'}
                        </p>
                        <p className="text-emerald-800">
                          Duration: {entry.draft_summary?.duration} · Severity: {entry.draft_summary?.severity}/10
                        </p>
                        {entry.draft_summary?.relevant_history &&
                          entry.draft_summary.relevant_history.length > 0 && (
                            <p className="text-emerald-700">
                              History: {entry.draft_summary.relevant_history.join(', ')}
                            </p>
                          )}
                      </>
                    )}
                  </div>

                  <div className="space-y-1 md:border-l md:border-emerald-200 md:pl-3">
                    <span className="font-bold text-emerald-900 block uppercase tracking-wide">
                      Raw Transcript / Answers
                    </span>
                    <p className="italic text-emerald-900">
                      "{entry.transcript || 'No voice transcript recorded'}"
                    </p>
                    {entry.answers && entry.answers.length > 0 && (
                      <div className="pt-1 space-y-0.5">
                        {entry.answers.map((a, i) => (
                          <p key={i} className="text-emerald-800">
                            <span className="font-medium">Q: {a.question}</span> → A: {a.answer}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expandable Score Breakdown */}
                {isExpanded && entry.breakdown && (
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-xs space-y-2 fade-in">
                    <span className="font-bold text-emerald-900 block">
                      Priority Score Breakdown (Total: {entry.score})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-emerald-800">
                      <div>Base ({entry.colour}): +{entry.breakdown.base}</div>
                      <div>Moderate Red-Flag: +{entry.breakdown.moderate_red_flag}</div>
                      <div>Age Risk (&lt;5 or &gt;=60): +{entry.breakdown.age_risk}</div>
                      <div>Pregnancy: +{entry.breakdown.pregnancy}</div>
                      <div>Chronic Condition: +{entry.breakdown.chronic_condition}</div>
                      <div>Wait Time (+1/5m): +{entry.breakdown.wait_time}</div>
                    </div>

                    {entry.doctor_override && (
                      <div className="bg-amber-50 border border-amber-300 p-2 rounded text-amber-900 mt-2">
                        <span className="font-bold">Overridden by Doctor:</span> {entry.doctor_override.original_colour} → {entry.doctor_override.new_colour}
                        <br />
                        <span className="font-semibold">Reason:</span> {entry.doctor_override.reason}
                      </div>
                    )}
                  </div>
                )}

                {/* Doctor Override Action Panel */}
                {overrideId === entry.id ? (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 space-y-2 text-xs">
                    <span className="font-bold text-amber-950">Override Patient Priority</span>
                    <div className="flex gap-2">
                      {(['GREEN', 'YELLOW', 'RED'] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setOverrideColour(c)}
                          className={`px-3 py-1 rounded font-bold border ${
                            overrideColour === c
                              ? 'bg-amber-700 text-white border-amber-700'
                              : 'bg-white text-amber-900 border-amber-300'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Mandatory clinical justification for override..."
                      className="w-full border border-amber-300 rounded px-2 py-1 text-xs outline-none"
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleOverride(entry.id)}
                        disabled={actionBusy}
                        className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-3 py-1 rounded disabled:opacity-50"
                      >
                        Submit Override
                      </button>
                      <button
                        onClick={() => {
                          setOverrideId(null);
                          setOverrideReason('');
                        }}
                        className="text-amber-900 underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2 pt-1 text-xs">
                    <button
                      onClick={() => {
                        setOverrideId(entry.id);
                        setOverrideColour(entry.colour);
                      }}
                      className="text-emerald-700 hover:text-emerald-900 font-semibold underline"
                    >
                      Override Priority
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== HOSPITAL DESK VIEW ====================

export function DeskView({
  lang,
  hospitalId = 'h01',
}: {
  lang: LangCode;
  hospitalId?: string;
}) {
  const [cards, setCards] = useState<DeskEmergencyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // Decline dialog state
  const [declineReqId, setDeclineReqId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState<
    'no_bed' | 'no_specialist' | 'no_equipment' | 'other'
  >('no_bed');

  // Resource & Bed controls
  const [icuBeds, setIcuBeds] = useState(12);
  const [generalBeds, setGeneralBeds] = useState(45);
  const [asvStatus, setAsvStatus] = useState<'available' | 'low' | 'out'>('available');
  const [thrombolysisStatus, setThrombolysisStatus] = useState<'available' | 'low' | 'out'>('available');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isStale, setIsStale] = useState(false);

  // Poll incoming emergencies every 3 seconds
  useEffect(() => {
    let active = true;

    async function fetchDesk() {
      try {
        const res = await deskIncoming(hospitalId);
        if (active) {
          setCards(res.incoming || []);
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDesk();
    const timer = setInterval(fetchDesk, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hospitalId]);

  async function handleAccept(requestId: string) {
    setActionBusy(true);
    try {
      await deskRespond(requestId, hospitalId, 'accept');
      const res = await deskIncoming(hospitalId);
      setCards(res.incoming || []);
      setIcuBeds((prev) => Math.max(0, prev - 1));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDecline(requestId: string) {
    setActionBusy(true);
    try {
      await deskRespond(requestId, hospitalId, 'decline', declineReason);
      setDeclineReqId(null);
      const res = await deskIncoming(hospitalId);
      setCards(res.incoming || []);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUpdateBeds(delta: number) {
    const next = Math.max(0, icuBeds + delta);
    setIcuBeds(next);
    setLastUpdated(new Date());
    setIsStale(false);
    await updateHospitalBeds(hospitalId, 'icu', next).catch(() => {});
  }

  async function handleToggleResource(resName: string, current: 'available' | 'low' | 'out') {
    const cycle: Record<string, 'available' | 'low' | 'out'> = {
      available: 'low',
      low: 'out',
      out: 'available',
    };
    const next = cycle[current];
    if (resName === 'asv') setAsvStatus(next);
    if (resName === 'thrombolysis') setThrombolysisStatus(next);
    setLastUpdated(new Date());
    setIsStale(false);
    await updateHospitalResource(hospitalId, resName, next).catch(() => {});
  }

  async function handleDemoFlip(status: 'available' | 'out') {
    setAsvStatus(status);
    setLastUpdated(new Date());
    setIsStale(false);
    await demoFlip(hospitalId, 'asv', status).catch(() => {});
  }

  return (
    <div className="space-y-6">
      {/* Resource & Bed Management Panel */}
      <div className={`card p-4 space-y-3 ${isStale ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
          <h3 className="font-bold text-emerald-950 flex items-center gap-2">
            <Bed className="w-5 h-5 text-emerald-700" /> Bed Counts & Critical Resources
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-700">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
            <button
              onClick={() => setIsStale(!isStale)}
              className="text-[11px] underline text-emerald-800"
            >
              {isStale ? 'Mark Fresh' : 'Simulate Stale (&gt;60m)'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {/* ICU Beds */}
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <span className="block text-xs font-semibold text-emerald-800">ICU Beds Available</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-black text-emerald-950">{icuBeds}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleUpdateBeds(-1)}
                  className="w-7 h-7 bg-white border border-emerald-300 rounded font-bold hover:bg-emerald-100"
                >
                  -
                </button>
                <button
                  onClick={() => handleUpdateBeds(1)}
                  className="w-7 h-7 bg-white border border-emerald-300 rounded font-bold hover:bg-emerald-100"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* General Beds */}
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <span className="block text-xs font-semibold text-emerald-800">General Beds Free</span>
            <div className="text-2xl font-black text-emerald-950 mt-1">{generalBeds}</div>
          </div>

          {/* Antivenom (ASV) */}
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
            <span className="block text-xs font-semibold text-emerald-800">Antivenom (ASV)</span>
            <button
              onClick={() => handleToggleResource('asv', asvStatus)}
              className={`w-full text-xs font-bold py-1 px-2 rounded uppercase border ${
                asvStatus === 'available'
                  ? 'bg-emerald-200 text-emerald-900 border-emerald-400'
                  : asvStatus === 'low'
                  ? 'bg-amber-200 text-amber-950 border-amber-400'
                  : 'bg-red-200 text-red-950 border-red-400'
              }`}
            >
              {asvStatus} (click to toggle)
            </button>
          </div>

          {/* Thrombolysis */}
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
            <span className="block text-xs font-semibold text-emerald-800">Thrombolysis</span>
            <button
              onClick={() => handleToggleResource('thrombolysis', thrombolysisStatus)}
              className={`w-full text-xs font-bold py-1 px-2 rounded uppercase border ${
                thrombolysisStatus === 'available'
                  ? 'bg-emerald-200 text-emerald-900 border-emerald-400'
                  : thrombolysisStatus === 'low'
                  ? 'bg-amber-200 text-amber-950 border-amber-400'
                  : 'bg-red-200 text-red-950 border-red-400'
              }`}
            >
              {thrombolysisStatus} (click to toggle)
            </button>
          </div>
        </div>

        {/* Live Demo Quick Flip Button */}
        <div className="pt-2 flex items-center justify-between border-t border-emerald-100 text-xs">
          <span className="font-semibold text-emerald-900">Live Demo Quick Flip:</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleDemoFlip('out')}
              className="bg-red-100 hover:bg-red-200 text-red-900 font-bold px-3 py-1 rounded border border-red-300"
            >
              Flip Antivenom to "OUT"
            </button>
            <button
              onClick={() => handleDemoFlip('available')}
              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold px-3 py-1 rounded border border-emerald-300"
            >
              Flip Antivenom to "AVAILABLE"
            </button>
          </div>
        </div>
      </div>

      {/* Incoming Emergency Broadcast Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-red-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-600" /> Incoming Emergency Broadcasts ({cards.length})
          </h3>
          <span className="text-xs text-emerald-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 animate-pulse text-emerald-600" /> Auto-polling every 3s
          </span>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded-lg">{error}</div>}

        {loading && cards.length === 0 ? (
          <div className="card p-8 flex items-center justify-center gap-2 text-emerald-700">
            <Loader2 className="w-5 h-5 animate-spin" /> Checking incoming broadcasts…
          </div>
        ) : cards.length === 0 ? (
          <div className="card p-8 text-center text-emerald-700">
            No active incoming emergency alerts for this hospital desk.
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((card) => {
              const suggestionClass =
                card.suggestion === 'can_accept'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-amber-100 text-amber-950 border-amber-300';

              return (
                <div
                  key={card.request_id}
                  className="card p-5 space-y-3 border-2 border-red-200 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm uppercase bg-red-600 text-white px-2.5 py-1 rounded-md">
                        {card.emergency_types.join(', ')}
                      </span>
                      <span className="text-xs font-bold text-emerald-900">
                        {card.distance_km} km away · ETA ~{card.eta_min} min
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Suggestion badge */}
                      <span
                        className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${suggestionClass}`}
                      >
                        {card.suggestion === 'can_accept'
                          ? 'SUGGESTION: CAN ACCEPT'
                          : 'SUGGESTION: CHECK NEEDED'}
                      </span>
                    </div>
                  </div>

                  {/* Suggestion Reasons */}
                  <div className="text-xs text-emerald-800 bg-emerald-50/70 p-2 rounded-lg border border-emerald-100">
                    <span className="font-semibold text-emerald-950">System Assessment: </span>
                    {card.suggestion_reasons.join(' · ')}
                  </div>

                  {/* Patient Details */}
                  <div className="space-y-1 text-sm bg-white p-3 rounded-lg border border-emerald-100">
                    <p className="font-bold text-emerald-950">
                      Chief Complaint: {card.summary?.chief_complaint || card.transcript}
                    </p>
                    {card.answers && card.answers.length > 0 && (
                      <div className="pt-1 space-y-0.5 text-xs text-emerald-800">
                        {card.answers.map((a, i) => (
                          <p key={i}>
                            <span className="font-semibold">{a.question}:</span> {a.answer}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Desk Actions */}
                  {card.my_status === 'pending' ? (
                    declineReqId === card.request_id ? (
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 space-y-2 text-xs">
                        <span className="font-bold text-amber-950">Select Decline Reason:</span>
                        <select
                          value={declineReason}
                          onChange={(e) =>
                            setDeclineReason(
                              e.target.value as 'no_bed' | 'no_specialist' | 'no_equipment' | 'other'
                            )
                          }
                          className="w-full border border-amber-300 rounded p-1.5 bg-white font-medium outline-none"
                        >
                          <option value="no_bed">No ICU/Emergency Bed Available</option>
                          <option value="no_specialist">No Specialist on Duty</option>
                          <option value="no_equipment">Required Equipment Down</option>
                          <option value="other">Other Operational Reason</option>
                        </select>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleDecline(card.request_id)}
                            disabled={actionBusy}
                            className="bg-red-700 hover:bg-red-800 text-white font-bold px-3 py-1 rounded"
                          >
                            Confirm Decline
                          </button>
                          <button
                            onClick={() => setDeclineReqId(null)}
                            className="text-amber-900 underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => handleAccept(card.request_id)}
                          disabled={actionBusy}
                          className="btn-touch !min-h-[46px] flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center gap-2"
                        >
                          <Check className="w-5 h-5" /> Accept Emergency (Hold Bed)
                        </button>
                        <button
                          onClick={() => setDeclineReqId(card.request_id)}
                          disabled={actionBusy}
                          className="btn-touch !min-h-[46px] px-4 bg-white border-2 border-red-300 text-red-700 font-bold hover:bg-red-50 flex items-center justify-center gap-1.5"
                        >
                          <X className="w-4 h-4" /> Decline…
                        </button>
                      </div>
                    )
                  ) : card.my_status === 'accepted' ? (
                    <div className="bg-emerald-100 text-emerald-900 font-extrabold text-xs px-3 py-2 rounded-lg border border-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Accepted by this hospital. 1 bed held for 30 minutes.
                    </div>
                  ) : card.my_status === 'declined' ? (
                    <div className="bg-gray-100 text-gray-700 font-semibold text-xs px-3 py-2 rounded-lg border border-gray-300">
                      Declined by this hospital.
                    </div>
                  ) : (
                    <div className="bg-gray-100 text-gray-700 font-semibold text-xs px-3 py-2 rounded-lg border border-gray-300">
                      Cancelled / Handled by another hospital.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
