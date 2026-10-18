import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  ArrowUpDown,
  User,
  Activity,
  History,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { LangCode, StaffDoctorQueueEntry } from '@/types';
import { t } from '@/lib/i18n';
import {
  fetchDoctorQueue,
  approveDoctorSummary,
  overrideDoctorPriority,
  lookupPatientHistory,
} from '@/lib/staffApi';
import { PatientRecordsCard } from './PatientRecordsCard';

interface PatientHistoryData {
  name: string;
  age: number;
  gender: string;
  conditions: string[];
  medicines: string[];
  allergies: string[];
  past_visits: string[];
}

export function DoctorView({
  lang,
  hospitalId = 'h01',
}: {
  lang: LangCode;
  hospitalId: string;
}) {
  const [queue, setQueue] = useState<StaffDoctorQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit summary state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedComplaint, setEditedComplaint] = useState('');
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveMsg, setApproveMsg] = useState<{ id: string; success?: string; error?: string } | null>(null);

  // Override state
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideColour, setOverrideColour] = useState<'GREEN' | 'YELLOW' | 'RED'>('YELLOW');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideMsg, setOverrideMsg] = useState<{ id: string; success?: string; error?: string } | null>(null);

  // ABHA history cache: abha_id -> PatientHistoryData
  const [historyCache, setHistoryCache] = useState<Record<string, PatientHistoryData | null>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  // 3-second live polling with cleanup on unmount
  const loadQueue = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const res = await fetchDoctorQueue(hospitalId);
    if (res.ok && res.data) {
      const list = res.data.queue || res.data.entries || [];
      // Sort by score descending; tie-breaker: earlier arrival (lower created_at)
      list.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.created_at || 0) - (b.created_at || 0));
      setQueue(list);
      setFetchError(null);
    } else {
      setFetchError(res.error || 'Unable to update live queue');
    }
    if (isInitial) setLoading(false);
  }, [hospitalId]);

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      if (!active) return;
      await loadQueue(true);
    }

    initialLoad();

    const timer = setInterval(() => {
      if (active) {
        loadQueue(false);
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadQueue]);

  // Fetch ABHA history when a row is expanded
  const handleToggleRow = (entry: StaffDoctorQueueEntry) => {
    const isOpening = expandedId !== entry.entry_id;
    setExpandedId(isOpening ? entry.entry_id : null);

    if (isOpening && entry.abha_id && !historyCache[entry.abha_id]) {
      setLoadingHistory(entry.abha_id);
      lookupPatientHistory(entry.abha_id).then((res) => {
        setLoadingHistory(null);
        if (res.ok && res.data?.patient) {
          setHistoryCache((prev) => ({
            ...prev,
            [entry.abha_id!]: res.data!.patient,
          }));
        } else {
          setHistoryCache((prev) => ({
            ...prev,
            [entry.abha_id!]: null,
          }));
        }
      });
    }

    if (isOpening) {
      setEditingId(null);
      setApproveMsg(null);
      setOverrideMsg(null);
    }
  };

  // Start editing summary
  const handleStartEdit = (entry: StaffDoctorQueueEntry) => {
    setEditingId(entry.entry_id);
    setEditedComplaint(entry.draft_summary?.chief_complaint || entry.summary?.chief_complaint || '');
    setApproveMsg(null);
  };

  // Approve summary (doctor/approve)
  const handleApprove = async (entry: StaffDoctorQueueEntry) => {
    setApproveBusy(true);
    setApproveMsg(null);

    const updatedSummary = {
      ...(entry.draft_summary || entry.summary),
      chief_complaint: editingId === entry.entry_id ? editedComplaint.trim() : (entry.draft_summary?.chief_complaint || entry.summary?.chief_complaint || ''),
    };

    const res = await approveDoctorSummary(entry.entry_id, updatedSummary);
    setApproveBusy(false);

    if (res.ok) {
      setApproveMsg({ id: entry.entry_id, success: `Approved by ${res.data?.approved_by || 'Doctor'}` });
      setEditingId(null);
      await loadQueue(false);
    } else {
      setApproveMsg({ id: entry.entry_id, error: res.error || 'Failed to approve summary' });
    }
  };

  // Override priority (doctor/override)
  const handleOverride = async (entry: StaffDoctorQueueEntry) => {
    if (!overrideReason.trim()) {
      setOverrideMsg({
        id: entry.entry_id,
        error: t(lang, 'staff.overrideReasonMandatory'),
      });
      return;
    }

    setOverrideBusy(true);
    setOverrideMsg(null);

    const res = await overrideDoctorPriority(entry.entry_id, overrideColour, overrideReason.trim());
    setOverrideBusy(false);

    if (res.ok) {
      setOverrideMsg({ id: entry.entry_id, success: `Priority re-prioritised to ${overrideColour}` });
      setOverrideId(null);
      setOverrideReason('');
      await loadQueue(false);
    } else {
      setOverrideMsg({ id: entry.entry_id, error: res.error || 'Failed to override priority' });
    }
  };

  const getColourBadge = (colour: string) => {
    switch (colour) {
      case 'RED':
      case 'EMERGENCY':
        return {
          label: t(lang, 'staff.triageRed'),
          style: 'bg-red-100 text-red-800 border-red-300',
        };
      case 'YELLOW':
      case 'URGENT':
        return {
          label: t(lang, 'staff.triageYellow'),
          style: 'bg-amber-100 text-amber-800 border-amber-300',
        };
      default:
        return {
          label: t(lang, 'staff.triageGreen'),
          style: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and live status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-950 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-emerald-700" />
            {t(lang, 'staff.doctorQueue')}
          </h2>
          <p className="text-xs text-emerald-700">
            {t(lang, 'staff.demoSimulated')} • Live queue sorted by score descending
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live polling (3s)
          </span>
          <button
            type="button"
            onClick={() => loadQueue(false)}
            title="Refresh queue"
            className="p-1.5 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-50 border border-emerald-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fetch error inline message */}
      {fetchError && (
        <div className="card p-3 bg-amber-50 border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="card p-8 flex flex-col items-center justify-center gap-2 text-emerald-800">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-sm font-medium">Loading live clinical queue…</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="card p-8 text-center text-emerald-800 space-y-1">
          <p className="font-semibold text-base">No patients currently in queue</p>
          <p className="text-xs text-emerald-600">New patient entries will automatically appear here within 3 seconds.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((entry, index) => {
            const isExpanded = expandedId === entry.entry_id;
            const badge = getColourBadge(entry.colour);
            const waitMinutes =
              entry.created_at ? Math.max(0, Math.floor((Date.now() - entry.created_at) / 60000)) : (entry.breakdown?.wait_time || 0) * 5;

            // Score breakdown calculations
            const urgencyPts = entry.breakdown?.base ?? (entry.colour === 'YELLOW' ? 50 : entry.colour === 'RED' ? 90 : 20);
            const redFlagPts = entry.breakdown?.moderate_red_flag ?? 0;
            const vulnerabilityPts =
              (entry.breakdown?.age_risk ?? 0) +
              (entry.breakdown?.pregnancy ?? 0) +
              (entry.breakdown?.chronic_condition ?? 0);
            const waitPts = entry.breakdown?.wait_time ?? Math.floor(waitMinutes / 5);

            const patientHistory = entry.abha_id ? historyCache[entry.abha_id] : null;

            return (
              <div
                key={entry.entry_id || entry.id || index}
                className="card border border-emerald-100 bg-white transition-all shadow-sm hover:border-emerald-300"
              >
                {/* Row Summary Bar */}
                <div
                  onClick={() => handleToggleRow(entry)}
                  className="p-4 cursor-pointer flex flex-wrap items-center justify-between gap-3 hover:bg-emerald-50/40"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-base px-2.5 py-1 bg-emerald-50 text-emerald-950 rounded-lg border border-emerald-200">
                      {entry.token}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badge.style}`}
                    >
                      {badge.label}
                    </span>
                    <span className="font-bold text-sm text-emerald-950">
                      {entry.patient_label || 'Patient'}
                    </span>
                    {entry.status === 'APPROVED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Approved
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-900">
                        {t(lang, 'staff.score')}: {entry.score}
                      </div>
                      <div className="text-xs text-emerald-700 flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        {waitMinutes} min wait
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-emerald-700" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-emerald-700" />
                    )}
                  </div>

                  {/* Review Tags on Row */}
                  {entry.review_flags && entry.review_flags.length > 0 && (
                    <div className="w-full flex flex-wrap gap-1.5 pt-1">
                      {entry.review_flags.map((rf, rfi) => (
                        <span
                          key={rfi}
                          className="text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md"
                        >
                          {rf}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 border-t border-emerald-100 bg-emerald-50/20 space-y-4">
                    {/* 1. Score Breakdown */}
                    <div className="bg-white p-3 rounded-xl border border-emerald-200">
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-700" />
                        {t(lang, 'staff.scoreBreakdown')} (Total: {entry.score})
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                          <p className="text-emerald-700 font-medium">{t(lang, 'staff.urgency')}</p>
                          <p className="text-base font-bold text-emerald-950">+{urgencyPts}</p>
                          <p className="text-[10px] text-emerald-600">Base level</p>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                          <p className="text-emerald-700 font-medium">{t(lang, 'staff.redFlag')}</p>
                          <p className="text-base font-bold text-emerald-950">+{redFlagPts}</p>
                          <p className="text-[10px] text-emerald-600">Moderate flags</p>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                          <p className="text-emerald-700 font-medium">{t(lang, 'staff.vulnerability')}</p>
                          <p className="text-base font-bold text-emerald-950">+{vulnerabilityPts}</p>
                          <p className="text-[10px] text-emerald-600">Age / Chronic</p>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                          <p className="text-emerald-700 font-medium">{t(lang, 'staff.waitingMinutes')}</p>
                          <p className="text-base font-bold text-emerald-950">+{waitPts}</p>
                          <p className="text-[10px] text-emerald-600">{waitMinutes} min waited</p>
                        </div>
                      </div>
                    </div>

                    {/* 2. Side-by-Side AI Summary & RAW Transcript */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Left: AI Clinical Summary */}
                      <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5 mb-2">
                            <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-emerald-700" />
                              {t(lang, 'staff.aiSummary')}
                            </span>
                            {editingId !== entry.entry_id && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(entry)}
                                className="text-xs font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" /> {t(lang, 'staff.editSummary')}
                              </button>
                            )}
                          </div>

                          {editingId === entry.entry_id ? (
                            <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-emerald-900">
                                Edit Chief Complaint:
                              </label>
                              <textarea
                                value={editedComplaint}
                                onChange={(e) => setEditedComplaint(e.target.value)}
                                rows={3}
                                className="w-full text-xs p-2 rounded-lg border-2 border-emerald-300 focus:border-emerald-600 outline-none text-emerald-950 bg-white"
                              />
                            </div>
                          ) : (
                            <div className="space-y-1.5 text-xs text-emerald-900">
                              <p>
                                <strong className="text-emerald-950">Complaint:</strong>{' '}
                                {entry.draft_summary?.chief_complaint || entry.summary?.chief_complaint || 'No complaint recorded'}
                              </p>
                              <p>
                                <strong className="text-emerald-950">Duration:</strong>{' '}
                                {entry.draft_summary?.duration || entry.summary?.duration || 'Not specified'}
                              </p>
                              <p>
                                <strong className="text-emerald-950">Severity:</strong>{' '}
                                {entry.draft_summary?.severity ?? entry.summary?.severity ?? 'N/A'}/10
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Inline messages */}
                        {approveMsg && approveMsg.id === entry.entry_id && (
                          <div
                            className={`p-2 rounded-lg text-xs font-medium ${
                              approveMsg.success ? 'bg-emerald-100 text-emerald-900' : 'bg-red-50 text-red-800'
                            }`}
                          >
                            {approveMsg.success || approveMsg.error}
                          </div>
                        )}

                        {/* Approve Button */}
                        <div className="pt-2 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={approveBusy}
                            onClick={() => handleApprove(entry)}
                            className="btn-touch !min-h-[40px] px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
                          >
                            {approveBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {t(lang, 'staff.saveApprove')}
                          </button>
                          {editingId === entry.entry_id && (
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-xs text-emerald-700 underline px-2 py-1"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Right: RAW Patient Transcript */}
                      <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
                        <div className="border-b border-emerald-100 pb-1.5">
                          <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-emerald-700" />
                            {t(lang, 'staff.rawTranscript')}
                          </span>
                        </div>
                        <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 max-h-40 overflow-y-auto">
                          <p className="text-xs font-mono text-emerald-950 whitespace-pre-wrap leading-relaxed">
                            {entry.transcript ? `"${entry.transcript}"` : '(No voice or typed transcript recorded)'}
                          </p>
                        </div>
                        {entry.answers && entry.answers.length > 0 && (
                          <div className="pt-1 space-y-1">
                            <span className="text-[11px] font-bold text-emerald-900">Follow-up QA:</span>
                            {entry.answers.map((qa, qi) => (
                              <div key={qi} className="text-[11px] text-emerald-800 bg-white p-1.5 rounded border border-emerald-100">
                                <strong>Q:</strong> {qa.question} — <strong>A:</strong> {qa.answer}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Symptom Tags & Escalation Reasons */}
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="font-bold text-emerald-950 block mb-1">
                            {t(lang, 'staff.symptomTags')}:
                          </span>
                          {entry.tags && entry.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {entry.tags.map((tg, tgi) => (
                                <span
                                  key={tgi}
                                  className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 font-medium text-[11px]"
                                >
                                  #{tg}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-emerald-600 italic">No specific tags flagged</span>
                          )}
                        </div>

                        <div>
                          <span className="font-bold text-emerald-950 block mb-1">
                            {t(lang, 'staff.escalationReasons')}:
                          </span>
                          {entry.review_flags && entry.review_flags.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-emerald-900 text-[11px]">
                              {entry.review_flags.map((rf, rfi) => (
                                <li key={rfi}>{rf}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-emerald-600 italic">Routine clinical review</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4. History from Mock ABHA Data */}
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
                      <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-emerald-700" />
                        {t(lang, 'staff.mockAbhaHistory')}
                        {entry.abha_id && (
                          <span className="font-mono text-[11px] font-normal text-emerald-700">
                            ({entry.abha_id})
                          </span>
                        )}
                      </h4>

                      {loadingHistory === entry.abha_id ? (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 py-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching ABHA health records…
                        </div>
                      ) : patientHistory ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs pt-1">
                          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                            <span className="font-semibold text-emerald-900 block mb-1">Conditions:</span>
                            {patientHistory.conditions?.length ? (
                              <ul className="list-disc list-inside text-[11px] text-emerald-950 space-y-0.5">
                                {patientHistory.conditions.map((c, ci) => (
                                  <li key={ci}>{c}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-emerald-600 text-[11px]">None known</span>
                            )}
                          </div>

                          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                            <span className="font-semibold text-emerald-900 block mb-1">Current Meds:</span>
                            {patientHistory.medicines?.length ? (
                              <ul className="list-disc list-inside text-[11px] text-emerald-950 space-y-0.5">
                                {patientHistory.medicines.map((m, mi) => (
                                  <li key={mi}>{m}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-emerald-600 text-[11px]">None recorded</span>
                            )}
                          </div>

                          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                            <span className="font-semibold text-emerald-900 block mb-1">Allergies:</span>
                            {patientHistory.allergies?.length ? (
                              <ul className="list-disc list-inside text-[11px] text-red-900 font-medium space-y-0.5">
                                {patientHistory.allergies.map((a, ai) => (
                                  <li key={ai}>{a}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-emerald-600 text-[11px]">None known</span>
                            )}
                          </div>

                          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                            <span className="font-semibold text-emerald-900 block mb-1">Past Visits:</span>
                            {patientHistory.past_visits?.length ? (
                              <ul className="text-[10px] text-emerald-950 space-y-1">
                                {patientHistory.past_visits.slice(0, 2).map((pv, pvi) => (
                                  <li key={pvi} className="truncate" title={pv}>
                                    {pv}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-emerald-600 text-[11px]">No prior records</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-700 italic">
                          No linked ABHA card for this entry. Patient registered as walk-in / new.
                        </p>
                      )}
                    </div>

                    {/* Records (OCR) Card */}
                    <PatientRecordsCard
                      lang={lang}
                      entryId={entry.entry_id}
                      abhaId={entry.abha_id}
                    />

                    {/* 5. Re-prioritise (doctor/override) */}
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                          <ArrowUpDown className="w-3.5 h-3.5 text-emerald-700" />
                          {t(lang, 'staff.reprioritise')}
                        </span>
                        {entry.doctor_override && (
                          <span className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Overridden to {entry.doctor_override.new_colour} (Reason: {entry.doctor_override.reason})
                          </span>
                        )}
                      </div>

                      {overrideId === entry.entry_id ? (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-emerald-900">New level:</span>
                            <div className="flex gap-1.5">
                              {(['GREEN', 'YELLOW', 'RED'] as const).map((lvl) => (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => setOverrideColour(lvl)}
                                  className={`text-xs px-3 py-1 rounded-lg border font-bold ${
                                    overrideColour === lvl
                                      ? lvl === 'RED'
                                        ? 'bg-red-700 text-white border-red-700'
                                        : lvl === 'YELLOW'
                                        ? 'bg-amber-600 text-white border-amber-600'
                                        : 'bg-emerald-700 text-white border-emerald-700'
                                      : 'bg-white text-emerald-900 border-emerald-200'
                                  }`}
                                >
                                  {lvl}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-emerald-900">
                              Mandatory Clinician Reason:
                            </label>
                            <input
                              type="text"
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              placeholder="e.g. Clinical red-flag on bedside exam, severe pallor"
                              className="w-full text-xs p-2 rounded-lg border-2 border-emerald-300 focus:border-emerald-600 outline-none text-emerald-950 bg-white"
                            />
                          </div>

                          {overrideMsg && overrideMsg.id === entry.entry_id && (
                            <div
                              className={`p-2 rounded-lg text-xs font-medium ${
                                overrideMsg.success ? 'bg-emerald-100 text-emerald-900' : 'bg-red-50 text-red-800'
                              }`}
                            >
                              {overrideMsg.success || overrideMsg.error}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={overrideBusy}
                              onClick={() => handleOverride(entry)}
                              className="btn-touch !min-h-[38px] px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
                            >
                              {overrideBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5" />
                              )}
                              Confirm Re-prioritise
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOverrideId(null);
                                setOverrideMsg(null);
                              }}
                              className="text-xs text-emerald-700 underline px-2 py-1"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideId(entry.entry_id);
                            setOverrideColour(entry.colour === 'YELLOW' ? 'RED' : 'YELLOW');
                            setOverrideReason('');
                            setOverrideMsg(null);
                          }}
                          className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" /> Re-prioritise Priority
                        </button>
                      )}
                    </div>
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
