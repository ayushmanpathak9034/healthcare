import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  ArrowUp,
  ArrowDown,
  Stethoscope,
  ClipboardList,
  Package,
  AlertTriangle,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Mic,
  Calendar,
  AlertOctagon,
  Building,
  HeartPulse,
  Bed,
} from 'lucide-react';
import {
  staffQueue,
  staffEntry,
  staffApprove,
  staffOverride,
  staffReorder,
  staffOcr,
  staffAudit,
  staffAuditLog,
  staffAdminOverview,
  staffUpdateBed,
  staffUpdateResource,
  emergencyRespond,
  asvPlan,
  asvRequest,
  asvStatus,
  type QueueRow,
  type AsvStatusResult,
  type AdminOverview,
  type DeclineReason,
  type ResourceAvailability,
  type IntakeSummary,
  type StaffUser,
} from '@/lib/api';
import type { LangCode } from '@/types';
import { t } from '@/lib/i18n';
import { useRefreshSignal, usePollFallback } from '@/lib/refresh';
import { compressImage } from '@/lib/helpers';
import {
  isKeyUnlocked,
  unlockWithPassphrase,
  unlockBreakGlass,
  lockKey,
  subscribeKeyStatus,
  LOCKED_MASK,
  LOCKED_MASK_SHORT,
} from '@/lib/crypto';

function useStaffQueue() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  const refresh = useCallback(async () => {
    try {
      const { queue: q } = await staffQueue();
      setQueue(q ?? []);
      setLastRefreshed(new Date().toLocaleTimeString());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRefreshSignal(refresh, 'queue');
  usePollFallback(refresh);
  return { queue, error, refresh, lastRefreshed };
}

const LEVEL_STYLE: Record<string, string> = {
  ROUTINE: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  URGENT: 'bg-amber-100 text-amber-900 border-amber-300',
  EMERGENCY: 'bg-red-100 text-red-900 border-red-300',
};

// ==========================================
// DOCTOR VIEW
// ==========================================
export function DoctorView({ lang, user }: { lang: LangCode; user?: StaffUser }) {
  const { queue, error, refresh, lastRefreshed } = useStaffQueue();
  const [openId, setOpenId] = useState<string | null>(null);
  const [entry, setEntry] = useState<QueueRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'QUEUE' | 'ASV' | 'AUDIT'>('QUEUE');
  const [unlocked, setUnlocked] = useState(isKeyUnlocked());
  const [passphrase, setPassphrase] = useState('doctor123');
  const [unlockError, setUnlockError] = useState('');
  const [showBreakGlassModal, setShowBreakGlassModal] = useState(false);
  const [breakGlassReason, setBreakGlassReason] = useState('');
  const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);
  const [auditLogList, setAuditLogList] = useState<{ id: string; ts: string; role: string; action: string; patient_ref: string; is_break_glass?: boolean }[]>([]);

  // Subscribe to crypto key status
  useEffect(() => {
    return subscribeKeyStatus(() => {
      setUnlocked(isKeyUnlocked());
    });
  }, []);

  async function handleUnlock() {
    setUnlockError('');
    if (!passphrase.trim()) {
      setUnlockError('Passphrase cannot be empty');
      return;
    }
    const ok = await unlockWithPassphrase(passphrase);
    if (!ok) {
      setUnlockError('Decryption failed. Please check your passphrase.');
    } else {
      setUnlocked(true);
      await staffAuditLog('KEY_UNLOCK', user?.username ?? 'doctor1', { method: 'passphrase' }, false);
    }
  }

  async function handleBreakGlass() {
    if (!breakGlassReason.trim()) {
      setUnlockError('Break-glass emergency access requires a mandatory justification');
      return;
    }
    const ok = unlockBreakGlass(breakGlassReason);
    if (ok) {
      setUnlocked(true);
      setShowBreakGlassModal(false);
      await staffAuditLog('BREAK_GLASS_ACCESS', user?.username ?? 'doctor1', { reason: breakGlassReason }, true);
      setBreakGlassReason('');
    }
  }

  function handleLock() {
    lockKey();
    setUnlocked(false);
    if (openId) {
      setOpenId(null);
      setEntry(null);
    }
  }

  async function open(id: string) {
    setOpenId(id);
    setBusy(true);
    try {
      const { entry: e } = await staffEntry(id);
      setEntry(e ?? null);
    } catch {
      setEntry(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadAudit() {
    try {
      const { log } = await staffAudit();
      setAuditLogList(log ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (view === 'AUDIT') loadAudit();
  }, [view]);

  if (openId) {
    return (
      <EntryDetail
        lang={lang}
        entry={entry}
        busy={busy}
        unlocked={unlocked}
        onBack={() => { setOpenId(null); refresh(); }}
        onLock={handleLock}
        onApprove={async (summary) => {
          if (!entry?.id) return;
          setBusy(true);
          try {
            await staffApprove(entry.id, summary);
            const { entry: e } = await staffEntry(entry.id);
            setEntry(e ?? null);
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
        onOverride={async (level, reason) => {
          if (!entry?.id) return;
          setBusy(true);
          try {
            await staffOverride(entry.id, level, reason);
            const { entry: e } = await staffEntry(entry.id);
            setEntry(e ?? null);
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
        onOcr={async (file) => {
          if (!entry?.id) return;
          setBusy(true);
          try {
            const { base64, mime } = await compressImage(file);
            const { record } = await staffOcr(entry.id, base64, mime);
            setEntry((e) => (e ? { ...e, ocr_records: [...(e.ocr_records ?? []), record] } : e));
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Key Unlock State Banner */}
      <div className={`p-4 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-3 shadow-sm ${unlocked ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${unlocked ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}`}>
            {unlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              {unlocked ? t(lang, 'keyUnlockedBadge') : t(lang, 'keyLocked')}
            </h3>
            <p className="text-xs text-slate-600">
              {unlocked ? 'WebCrypto AES-GCM key derived in browser memory' : t(lang, 'keyUnlockPrompt')}
            </p>
          </div>
        </div>

        {unlocked ? (
          <button
            onClick={handleLock}
            className="btn-touch !min-h-[40px] px-4 bg-white border-2 border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1.5"
          >
            <Lock className="w-4 h-4" /> {t(lang, 'lock')}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={t(lang, 'passphrase')}
              className="border-2 border-amber-300 rounded-xl px-3 text-sm h-10 focus:border-amber-500 outline-none flex-1 sm:w-44 bg-white"
            />
            <button
              onClick={handleUnlock}
              className="btn-touch !min-h-[40px] px-4 bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" /> {t(lang, 'unlock')}
            </button>
            <button
              onClick={() => setShowBreakGlassModal(true)}
              className="btn-touch !min-h-[40px] px-3 bg-red-600 text-white text-xs font-bold hover:bg-red-700 flex items-center gap-1"
            >
              <AlertOctagon className="w-4 h-4" /> Break-Glass
            </button>
          </div>
        )}
      </div>

      {unlockError && <p className="text-xs text-red-700 font-semibold px-1">{unlockError}</p>}

      {/* Break-glass emergency modal */}
      {showBreakGlassModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border-2 border-red-400">
            <div className="flex items-center gap-2 text-red-800 font-bold text-lg">
              <AlertOctagon className="w-6 h-6 text-red-600" />
              {t(lang, 'breakGlass')}
            </div>
            <p className="text-xs text-slate-600">
              {t(lang, 'breakGlassReasonHint')}. This action bypasses the doctor passphrase using the emergency recovery key and creates an indelible server audit log entry.
            </p>
            <textarea
              value={breakGlassReason}
              onChange={(e) => setBreakGlassReason(e.target.value)}
              placeholder="e.g. Patient in acute distress, primary clinician unavailable..."
              rows={3}
              className="w-full border-2 border-red-200 rounded-xl p-3 text-sm focus:border-red-500 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowBreakGlassModal(false)}
                className="btn-touch flex-1 !min-h-[44px] bg-slate-100 text-slate-700 text-sm"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                onClick={handleBreakGlass}
                className="btn-touch flex-1 !min-h-[44px] bg-red-600 text-white text-sm font-bold hover:bg-red-700"
              >
                Confirm Break-Glass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('QUEUE')}
          className={`btn-touch !min-h-[44px] flex-1 flex items-center justify-center gap-2 border-2 ${view === 'QUEUE' ? 'bg-emerald-700 text-white border-emerald-700 font-bold' : 'bg-white text-emerald-900 border-emerald-200'}`}
        >
          <ClipboardList className="w-4 h-4" /> {t(lang, 'doctorQueue')} ({queue.length})
        </button>
        <button
          onClick={() => setView('ASV')}
          className={`btn-touch !min-h-[44px] flex-1 flex items-center justify-center gap-2 border-2 ${view === 'ASV' ? 'bg-emerald-700 text-white border-emerald-700 font-bold' : 'bg-white text-emerald-900 border-emerald-200'}`}
        >
          <Package className="w-4 h-4" /> ASV Transfers
        </button>
        <button
          onClick={() => setView('AUDIT')}
          className={`btn-touch !min-h-[44px] flex-1 flex items-center justify-center gap-2 border-2 ${view === 'AUDIT' ? 'bg-emerald-700 text-white border-emerald-700 font-bold' : 'bg-white text-emerald-900 border-emerald-200'}`}
        >
          <ShieldCheck className="w-4 h-4" /> {t(lang, 'auditLog')}
        </button>
      </div>

      {error && <p className="text-sm text-red-700 font-medium">{error}</p>}

      {view === 'QUEUE' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-emerald-700 px-1">
            <span>Authoritative Deterministic Order</span>
            <span>Last refreshed: {lastRefreshed}</span>
          </div>

          {queue.length === 0 && (
            <div className="card p-8 text-center text-emerald-700 space-y-1">
              <p className="font-semibold">No patients currently in your hospital's OPD queue.</p>
              <p className="text-xs">New voice triage intakes will appear here automatically.</p>
            </div>
          )}

          {queue.map((row) => {
            const isScoreExpanded = expandedScoreId === row.id;
            const bd = row.score_breakdown;

            return (
              <div key={row.token} className="card p-4 space-y-3 hover:border-emerald-400 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-xl text-emerald-900">{row.token}</span>
                    <span className={`text-xs font-bold rounded-full px-2.5 py-1 border ${LEVEL_STYLE[row.triage_level ?? ''] ?? ''}`}>
                      {row.triage_level}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Score: {row.priority_score ?? 20}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {row.waiting_minutes ?? 0} min
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedScoreId(isScoreExpanded ? null : row.id!)}
                      className="text-xs text-emerald-800 hover:text-emerald-950 flex items-center gap-1 underline"
                    >
                      {t(lang, 'scoreBreakdown')}
                      {isScoreExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => row.id && open(row.id)}
                      className="btn-touch !min-h-[36px] px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Stethoscope className="w-3.5 h-3.5" /> Review Case Sheet
                    </button>
                  </div>
                </div>

                {/* Patient summary line (masked if locked) */}
                <p className="text-sm text-slate-800 font-medium">
                  {unlocked ? (row.summary?.chief_complaint ?? row.patient_label) : LOCKED_MASK_SHORT}
                </p>

                {/* Expandable Score Breakdown */}
                {isScoreExpanded && bd && (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1.5 fade-in">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-semibold text-emerald-900">
                      <div>Base Urgency: {bd.urgency}</div>
                      <div>Red Flags: +{bd.red_flag}</div>
                      <div>Vulnerability: +{bd.vulnerability}</div>
                      <div>Wait Points: +{bd.waiting_points}</div>
                    </div>
                    {bd.red_flag_reasons.length > 0 && (
                      <p className="text-red-700">Red-flags: {bd.red_flag_reasons.join(', ')}</p>
                    )}
                    {bd.vulnerability_reasons.length > 0 && (
                      <p className="text-amber-800">Risks: {bd.vulnerability_reasons.join(', ')}</p>
                    )}
                    <p className="text-slate-500 italic pt-1">
                      Formula: Urgency ({bd.urgency}) + Red Flags ({bd.red_flag}) + Vulnerability ({bd.vulnerability}) + Wait ({bd.waiting_points}) = <strong>{bd.total}</strong>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'ASV' && <DoctorAsv lang={lang} />}
      {view === 'AUDIT' && <AuditLog lang={lang} log={auditLogList} />}
    </div>
  );
}

// ==========================================
// STRUCTURED DOCTOR REPORT / DETAIL VIEW
// ==========================================
function EntryDetail({
  lang,
  entry,
  busy,
  unlocked,
  onBack,
  onLock,
  onApprove,
  onOverride,
  onOcr,
}: {
  lang: LangCode;
  entry: QueueRow | null;
  busy: boolean;
  unlocked: boolean;
  onBack: () => void;
  onLock: () => void;
  onApprove: (summary: IntakeSummary) => void;
  onOverride: (level: string, reason: string) => void;
  onOcr: (file: File) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState(5);
  const [relevantHistory, setRelevantHistory] = useState('');
  const [overrideLevel, setOverrideLevel] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string>('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  useEffect(() => {
    if (entry?.summary) {
      setChiefComplaint(entry.summary.chief_complaint ?? '');
      setDuration(entry.summary.duration ?? '');
      setSeverity(Number(entry.summary.severity) || 5);
      setRelevantHistory((entry.summary.relevant_history ?? []).join(', '));
    }
  }, [entry]);

  if (!entry) {
    return (
      <div className="card p-8 text-center text-emerald-700">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
        <p>{t(lang, 'loading')}</p>
      </div>
    );
  }

  function handleSaveEdit() {
    const updated: IntakeSummary = {
      chief_complaint: chiefComplaint.trim() || '—',
      duration: duration.trim() || '—',
      severity: Number(severity) || 5,
      relevant_history: relevantHistory.split(',').map((s) => s.trim()).filter(Boolean),
    };
    onApprove(updated);
    setEditing(false);
  }

  function handleOverrideSubmit() {
    if (!overrideReason.trim()) {
      setOverrideError('Priority override requires a mandatory justification');
      return;
    }
    onOverride(overrideLevel, overrideReason.trim());
    setShowOverrideModal(false);
    setOverrideReason('');
    setOverrideError('');
  }

  const isApproved = entry.status === 'APPROVED' || Boolean(entry.approved_by);

  return (
    <div className="space-y-4 fade-in">
      {/* Top action row */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="btn-touch !min-h-[40px] px-3 bg-white border border-emerald-300 text-emerald-800 text-sm font-semibold hover:bg-emerald-50">
          ← {t(lang, 'backToQueue')}
        </button>
        <div className="flex items-center gap-2">
          {unlocked ? (
            <button onClick={onLock} className="btn-touch !min-h-[40px] px-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> {t(lang, 'lock')}
            </button>
          ) : (
            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-300 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Key Locked
            </span>
          )}
        </div>
      </div>

      {/* Patient & Encounter Header */}
      <div className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-black text-3xl text-emerald-950">{entry.token}</span>
            <span className={`text-xs font-bold rounded-full px-3 py-1 border ${LEVEL_STYLE[entry.triage_level ?? ''] ?? ''}`}>
              {entry.triage_level}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
              Score: {entry.priority_score ?? 20}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isApproved ? (
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shadow-sm">
                <CheckCircle2 className="w-4 h-4" /> {t(lang, 'approvedBadge')}
              </span>
            ) : (
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                AI Draft — Pending Review
              </span>
            )}
            <button
              onClick={() => { setOverrideLevel(entry.triage_level ?? 'URGENT'); setShowOverrideModal(true); }}
              className="btn-touch !min-h-[38px] px-3 bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-200"
            >
              Override Priority
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
          <div><span className="font-semibold">Patient:</span> {entry.patient_label || 'OPD Walk-in'}</div>
          <div><span className="font-semibold">ABHA:</span> {entry.abha_id ? `***${entry.abha_id.slice(-4)}` : 'Unregistered'}</div>
          <div><span className="font-semibold">Wait:</span> {entry.waiting_minutes ?? 0} min</div>
          <div><span className="font-semibold">Encounter ID:</span> {entry.id?.slice(0, 8)}…</div>
        </div>

        {entry.approved_by && (
          <p className="text-xs text-emerald-700 font-semibold">
            Signed by {entry.approved_by} on {entry.approved_at ? new Date(entry.approved_at).toLocaleString() : '—'}
          </p>
        )}
        {entry.override_reason && (
          <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
            <strong>Priority Override Justification:</strong> {entry.override_reason}
          </p>
        )}
      </div>

      {/* LOCKED STATE GUARD */}
      {!unlocked ? (
        <div className="card p-8 text-center space-y-3 bg-amber-50/50 border-2 border-dashed border-amber-300">
          <Lock className="w-12 h-12 text-amber-600 mx-auto" />
          <h3 className="text-lg font-bold text-amber-950">{t(lang, 'keyLocked')}</h3>
          <p className="text-sm text-amber-800 max-w-md mx-auto">
            {LOCKED_MASK}. All clinical summaries, speech transcripts, follow-up answers, prior conditions, and OCR records are hidden until you unlock your private key.
          </p>
        </div>
      ) : (
        <>
          {/* SIDE-BY-SIDE: AI Draft Summary (Left) vs. Verbatim Transcript (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Generated Clinical Summary */}
            <div className="card p-5 space-y-3 bg-white border-2 border-emerald-200 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                  <h3 className="font-bold text-emerald-950 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-700" />
                    {t(lang, 'aiDraft')}
                  </h3>
                  {!editing && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs text-emerald-800 hover:text-emerald-950 font-bold underline"
                    >
                      {t(lang, 'editSummary')}
                    </button>
                  )}
                </div>

                {editing ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">{t(lang, 'chiefComplaint')}</label>
                      <textarea
                        value={chiefComplaint}
                        onChange={(e) => setChiefComplaint(e.target.value)}
                        rows={2}
                        className="w-full border-2 border-emerald-200 rounded-xl p-2 text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">{t(lang, 'duration')}</label>
                        <input
                          value={duration}
                          onChange={(e) => setDuration(e.target.value)}
                          className="w-full border-2 border-emerald-200 rounded-xl p-2 text-sm focus:border-emerald-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">{t(lang, 'severity')} (1-10): {severity}</label>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={severity}
                          onChange={(e) => setSeverity(Number(e.target.value))}
                          className="w-full mt-2 accent-emerald-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">{t(lang, 'relevantHistory')}</label>
                      <input
                        value={relevantHistory}
                        onChange={(e) => setRelevantHistory(e.target.value)}
                        placeholder="Comma-separated items"
                        className="w-full border-2 border-emerald-200 rounded-xl p-2 text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setEditing(false)} className="btn-touch flex-1 !min-h-[40px] bg-slate-100 text-slate-700">
                        {t(lang, 'cancel')}
                      </button>
                      <button onClick={handleSaveEdit} className="btn-touch flex-1 !min-h-[40px] bg-emerald-700 text-white font-bold">
                        {t(lang, 'saveChanges')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-900 font-semibold text-base">{entry.summary?.chief_complaint || '—'}</p>
                    <div className="flex gap-4 text-xs text-slate-600">
                      <span><strong>{t(lang, 'duration')}:</strong> {entry.summary?.duration || '—'}</span>
                      <span><strong>{t(lang, 'severity')}:</strong> {entry.summary?.severity ?? 5}/10</span>
                    </div>
                    {entry.summary?.relevant_history && entry.summary.relevant_history.length > 0 && (
                      <p className="text-xs text-slate-700">
                        <strong>{t(lang, 'relevantHistory')}:</strong> {entry.summary.relevant_history.join(', ')}
                      </p>
                    )}
                    {entry.source_tags && entry.source_tags.length > 0 && (
                      <p className="text-xs text-emerald-700 pt-1">
                        <strong>{t(lang, 'sourceTags')}:</strong> {entry.source_tags.map((s) => `${s.claim} (${s.source})`).join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Doctor Approval Trigger */}
              <div className="pt-3 border-t border-emerald-100">
                <button
                  onClick={() => entry.summary && onApprove(entry.summary)}
                  disabled={busy || !entry.summary}
                  className="btn-touch w-full !min-h-[48px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Stethoscope className="w-5 h-5" />
                  {isApproved ? 'Update & Re-Approve Case Sheet' : t(lang, 'approveAndSign')}
                </button>
              </div>
            </div>

            {/* Verbatim Speech Transcript */}
            <div className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <h3 className="font-bold text-emerald-950 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-emerald-700" />
                  {t(lang, 'rawTranscript')}
                </h3>
                <span className="text-xs text-slate-500 font-medium">Verbatim speech capture</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-800 italic leading-relaxed min-h-[140px]">
                {entry.transcript ? `"${entry.transcript}"` : <span className="text-slate-400 not-italic">No speech transcript recorded.</span>}
              </div>
              <p className="text-xs text-slate-500">
                Original voice recording transcript. Editing the clinical summary above does not modify this source of truth.
              </p>
            </div>
          </div>

          {/* Follow-up Questions & Answers */}
          <div className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
            <h3 className="font-bold text-emerald-950 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-emerald-700" />
              {t(lang, 'followups')}
            </h3>
            {entry.followup_answers && entry.followup_answers.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {entry.followup_answers.map((fa, i) => (
                  <li key={i} className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex flex-col gap-1">
                    <span className="font-semibold text-emerald-950">Q: {fa.question}</span>
                    <span className="text-emerald-800">A: {fa.answer}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">{t(lang, 'noFollowups')}</p>
            )}
          </div>

          {/* Prior ABHA History & OCR Prescriptions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Prior ABHA History */}
            <div className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <h3 className="font-bold text-emerald-950 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-700" />
                  {t(lang, 'priorRecords')}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">Simulated Demo</span>
              </div>
              {entry.prior_history ? (
                <div className="space-y-2 text-sm text-slate-800">
                  <p><strong>Conditions:</strong> {entry.prior_history.conditions.join(', ') || 'None documented'}</p>
                  <p><strong>Current Meds:</strong> {entry.prior_history.medicines.join(', ') || 'None'}</p>
                  <p><strong>Past Visits:</strong> {entry.prior_history.past_visits.join(', ') || 'None'}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No prior records linked to this ABHA token.</p>
              )}
            </div>

            {/* OCR Prescriptions */}
            <div className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <h3 className="font-bold text-emerald-950 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-700" />
                  {t(lang, 'ocrPrescriptions')}
                </h3>
                <label className="text-xs text-emerald-800 font-bold underline cursor-pointer hover:text-emerald-950">
                  + Add Prescription
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onOcr(f);
                    }}
                  />
                </label>
              </div>

              {entry.ocr_records && entry.ocr_records.length > 0 ? (
                <div className="space-y-2 text-xs">
                  {entry.ocr_records.map((r, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <div className="font-semibold text-slate-900">{r.header || `Prescription #${i + 1}`} ({r.date})</div>
                      {r.medicines.map((m, mi) => (
                        <div key={mi} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="text-slate-800">{m.name} — {m.dosage}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">{m.ocr_confidence}%</span>
                            {m.needs_review && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                {t(lang, 'reviewSuggested')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No prescription images uploaded for this encounter.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Override Priority Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border-2 border-emerald-300">
            <h3 className="font-bold text-emerald-950 text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Manual Priority Override
            </h3>
            <p className="text-xs text-slate-600">
              An authorized doctor may re-prioritize a patient. Escalations must be justified by clinical evidence and are logged in the authoritative audit trail.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {['ROUTINE', 'URGENT', 'EMERGENCY'].map((lv) => (
                <button
                  key={lv}
                  onClick={() => setOverrideLevel(lv)}
                  className={`btn-touch !min-h-[44px] text-xs font-bold border-2 ${overrideLevel === lv ? 'border-emerald-600 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-800'}`}
                >
                  {lv}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t(lang, 'overrideReason')} *
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t(lang, 'overrideReasonPlaceholder')}
                rows={3}
                className="w-full border-2 border-emerald-200 rounded-xl p-2.5 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            {overrideError && <p className="text-xs text-red-700 font-semibold">{overrideError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="btn-touch flex-1 !min-h-[44px] bg-slate-100 text-slate-700 text-sm"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                onClick={handleOverrideSubmit}
                disabled={busy}
                className="btn-touch flex-1 !min-h-[44px] bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800"
              >
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// HOSPITAL EMERGENCY DESK VIEW (ADMIN)
// ==========================================
export function AdminView({ lang, user }: { lang: LangCode; user?: StaffUser }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedDeclineId, setSelectedDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState<DeclineReason>('no bed');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  const refresh = useCallback(async () => {
    try {
      const ov = await staffAdminOverview();
      setOverview(ov);
      setLastRefreshed(new Date().toLocaleTimeString());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRefreshSignal(refresh, 'emergency');
  usePollFallback(refresh);

  async function handleBedUpdate(type: 'ICU' | 'EMERGENCY' | 'MATERNITY' | 'GENERAL', delta: number) {
    setBusy(true);
    try {
      await staffUpdateBed(type, delta);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResourceStatus(resourceId: string, status: ResourceAvailability) {
    setBusy(true);
    try {
      await staffUpdateResource(resourceId, status);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(requestId: string) {
    setBusy(true);
    setError('');
    try {
      await emergencyRespond(requestId, 'ACCEPT');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclineSubmit() {
    if (!selectedDeclineId) return;
    if (declineReason === 'other' && !otherReasonText.trim()) {
      setDeclineError('Please provide explanation for other reason');
      return;
    }
    const fullReason = declineReason === 'other' ? `other: ${otherReasonText.trim()}` : declineReason;
    setBusy(true);
    try {
      await emergencyRespond(selectedDeclineId, 'DECLINE', fullReason);
      setSelectedDeclineId(null);
      setOtherReasonText('');
      setDeclineError('');
      await refresh();
    } catch (e) {
      setDeclineError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hospital = overview?.hospital;

  return (
    <div className="space-y-5 fade-in">
      {/* Hospital Desk Header */}
      <div className="card p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Building className="w-6 h-6 text-emerald-300" />
              {hospital?.name || user?.hospital_name || 'Hospital Emergency Desk'}
            </h2>
            <p className="text-xs text-emerald-200">
              {hospital?.area ? `${hospital.area}, ${hospital.city}` : 'Emergency & Capacity Control Center'}
              {user?.display_name ? ` · Officer on Duty: ${user.display_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-700/80 border border-emerald-500 text-emerald-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Realtime Connected
            </span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 font-semibold px-1">{error}</p>}

      {/* 1. BED INVENTORY QUICK-UPDATE PANEL */}
      <section className="card p-5 space-y-4 bg-white border-2 border-emerald-200">
        <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
          <div className="flex items-center gap-2">
            <Bed className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-emerald-950 text-base">{t(lang, 'bedInventory')}</h3>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
            {t(lang, 'heldBeds')}: {overview?.held_beds_count ?? 0}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(overview?.beds ?? []).map((bed) => (
            <div key={bed.type} className="p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                  {bed.type === 'GENERAL' ? t(lang, 'generalBed')
                  : bed.type === 'MATERNITY' ? t(lang, 'maternityBed')
                  : bed.type === 'EMERGENCY' ? t(lang, 'emergencyBed')
                  : 'ICU'}
                </span>
                <span className="text-[10px] text-slate-500">Held: {bed.held}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleBedUpdate(bed.type, -1)}
                  disabled={busy || bed.available <= 0}
                  className="btn-touch !min-h-[40px] !min-w-[40px] bg-white border-2 border-emerald-300 text-emerald-900 font-black text-lg disabled:opacity-30 rounded-xl flex items-center justify-center hover:bg-emerald-100"
                >
                  −
                </button>
                <div className="text-center">
                  <span className="text-2xl font-black text-emerald-950">{bed.available}</span>
                  <span className="text-xs text-slate-500 block">/ {bed.total} total</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleBedUpdate(bed.type, 1)}
                  disabled={busy}
                  className="btn-touch !min-h-[40px] !min-w-[40px] bg-white border-2 border-emerald-300 text-emerald-900 font-black text-lg rounded-xl flex items-center justify-center hover:bg-emerald-100"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. CRITICAL RESOURCES PANEL WITH 60-MIN STALENESS */}
      <section className="card p-5 space-y-4 bg-white border-2 border-emerald-200">
        <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-emerald-950 text-base">{t(lang, 'resourcesPanel')}</h3>
          </div>
          <span className="text-xs text-slate-500">Stale after 60 min</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {(overview?.resources ?? []).map((res) => {
            const ageMinutes = Math.floor((Date.now() - new Date(res.updated_at).getTime()) / 60000);
            const isStale = ageMinutes > 60;

            return (
              <div
                key={res.id}
                className={`p-3.5 rounded-xl border-2 space-y-2 transition-all ${isStale ? 'bg-slate-100/80 border-slate-300 opacity-80' : 'bg-white border-emerald-100'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 capitalize">{res.name.replace(/_/g, ' ')}</span>
                  {isStale && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-700" />
                      {t(lang, 'callToConfirm')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {(['AVAILABLE', 'LOW', 'OUT'] as ResourceAvailability[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleResourceStatus(res.id, st)}
                      disabled={busy}
                      className={`btn-touch !min-h-[32px] !text-[11px] font-bold rounded-lg border ${
                        res.status === st
                          ? st === 'AVAILABLE' ? 'bg-emerald-600 text-white border-emerald-600'
                            : st === 'LOW' ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                  <span>Age: {ageMinutes} min ago</span>
                  {isStale && (
                    <button
                      type="button"
                      onClick={() => handleResourceStatus(res.id, res.status)}
                      className="text-emerald-700 font-bold underline hover:text-emerald-900"
                    >
                      Confirm Freshness
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. INCOMING EMERGENCY CARDS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-emerald-950 text-base">{t(lang, 'incomingRequests')}</h3>
          <span className="text-xs text-slate-500">Refreshed: {lastRefreshed}</span>
        </div>

        {(overview?.my_emergencies ?? []).length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            No incoming emergency requests for this hospital at this moment.
          </div>
        )}

        {(overview?.my_emergencies ?? []).map((r) => {
          const isTarget = r.current_target_hospital_id && r.status === 'BROADCASTING';
          const isAccepted = r.status === 'ACCEPTED';

          return (
            <div
              key={r.id}
              className={`card p-5 space-y-3 border-2 ${
                isAccepted ? 'border-emerald-400 bg-emerald-50/40'
                : 'border-red-400 bg-red-50/30'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg text-slate-900">{r.patient_label}</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-300">
                    {r.kind}
                  </span>
                  <span className="text-xs text-slate-600 font-semibold">ETA: ~{r.eta_minutes} min</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                      r.suggestion === 'CAN_ACCEPT'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                  >
                    {r.suggestion === 'CAN_ACCEPT' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {r.suggestion === 'CAN_ACCEPT' ? t(lang, 'canAccept') : t(lang, 'checkNeeded')}
                  </span>
                </div>
              </div>

              {/* Clinical summary & transcript */}
              {r.summary && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 text-sm space-y-1">
                  <p className="font-semibold text-slate-900">{r.summary.chief_complaint}</p>
                  <p className="text-xs text-slate-600">Severity: {r.summary.severity}/10</p>
                </div>
              )}

              {/* System Suggestion Reasons */}
              {r.suggestion_reasons && r.suggestion_reasons.length > 0 && (
                <ul className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-lg border border-slate-200 space-y-0.5">
                  {r.suggestion_reasons.map((sr, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> {sr}
                    </li>
                  ))}
                </ul>
              )}

              {/* Action Controls */}
              {isTarget && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => handleAccept(r.id)}
                    disabled={busy}
                    className="btn-touch !min-h-[52px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-base flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle2 className="w-5 h-5" /> {t(lang, 'accept')}
                  </button>
                  <button
                    onClick={() => { setSelectedDeclineId(r.id); setDeclineError(''); }}
                    disabled={busy}
                    className="btn-touch !min-h-[52px] bg-red-600 hover:bg-red-700 text-white font-bold text-base flex items-center justify-center gap-2 shadow-sm"
                  >
                    <AlertOctagon className="w-5 h-5" /> {t(lang, 'decline')}
                  </button>
                </div>
              )}

              {isAccepted && (
                <div className="p-3 bg-emerald-100 rounded-xl text-emerald-950 font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Accepted by your hospital. Bed reserved in emergency ward.
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 4. RECENT DECISIONS */}
      {(overview?.recent_decisions ?? []).length > 0 && (
        <section className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
          <h3 className="font-bold text-emerald-950 text-base">{t(lang, 'recentDecisions')}</h3>
          <div className="space-y-2 text-xs">
            {overview!.recent_decisions.map((rd) => (
              <div key={rd.id} className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-900">{rd.patient_label}</span>
                  <span className="text-slate-500 block">{rd.reason}</span>
                </div>
                <div className="text-right">
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${rd.decision === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                    {rd.decision}
                  </span>
                  <span className="text-slate-400 block text-[10px]">{new Date(rd.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mandatory Decline Modal */}
      {selectedDeclineId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border-2 border-red-300">
            <h3 className="font-bold text-red-950 text-lg flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-red-600" />
              {t(lang, 'declineReason')}
            </h3>
            <p className="text-xs text-slate-600">
              Please select an authoritative reason from the mandatory list. The emergency request will immediately cascade to the next eligible hospital.
            </p>

            <div className="space-y-2">
              {(['no bed', 'no specialist', 'no equipment', 'other'] as DeclineReason[]).map((r) => (
                <label key={r} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="declineReason"
                    value={r}
                    checked={declineReason === r}
                    onChange={() => setDeclineReason(r)}
                    className="accent-red-600 w-4 h-4"
                  />
                  <span className="text-sm text-slate-800 capitalize font-medium">{r}</span>
                </label>
              ))}
            </div>

            {declineReason === 'other' && (
              <input
                value={otherReasonText}
                onChange={(e) => setOtherReasonText(e.target.value)}
                placeholder="Explain why hospital cannot accept..."
                className="w-full border-2 border-red-200 rounded-xl p-2.5 text-sm focus:border-red-500 outline-none"
              />
            )}

            {declineError && <p className="text-xs text-red-700 font-semibold">{declineError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedDeclineId(null)}
                className="btn-touch flex-1 !min-h-[44px] bg-slate-100 text-slate-700 text-sm"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                onClick={handleDeclineSubmit}
                disabled={busy}
                className="btn-touch flex-1 !min-h-[44px] bg-red-600 text-white text-sm font-bold hover:bg-red-700"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// RECEPTION VIEW (TOKEN NUMBERS ONLY)
// ==========================================
export function ReceptionView({ lang }: { lang: LangCode }) {
  const { queue, error, refresh } = useStaffQueue();
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<string[]>([]);

  const rows = order.length === queue.length && queue.every((r) => r.id && order.includes(r.id))
    ? order.map((id) => queue.find((r) => r.id === id)!)
    : queue;

  function move(id: string, dir: -1 | 1) {
    const ids = rows.map((r) => r.id!);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  }

  async function save() {
    setBusy(true);
    try {
      await staffReorder(order);
      setOrder([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-emerald-900">{t(lang, 'receptionQueue')}</h2>
      {error && <p className="text-sm text-red-700 font-medium">{error}</p>}
      {rows.map((row, i) => (
        <div key={row.id ?? row.token} className="card p-3 flex items-center gap-3">
          <span className="font-black text-lg text-emerald-900">{row.token}</span>
          <span className={`text-xs font-bold rounded-full px-2 py-1 border ${LEVEL_STYLE[row.triage_level ?? ''] ?? ''}`}>
            {row.triage_level}
          </span>
          <span className="text-xs text-emerald-600 mr-auto">#{row.position}</span>
          <button onClick={() => row.id && move(row.id, -1)} disabled={i === 0} className="btn-touch !min-h-[44px] !min-w-[44px] bg-emerald-50 border border-emerald-300 disabled:opacity-30">
            <ArrowUp className="w-4 h-4" />
          </button>
          <button onClick={() => row.id && move(row.id, 1)} disabled={i === rows.length - 1} className="btn-touch !min-h-[44px] !min-w-[44px] bg-emerald-50 border border-emerald-300 disabled:opacity-30">
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      ))}
      {order.length > 0 && (
        <button onClick={save} disabled={busy} className="btn-touch w-full bg-emerald-700 text-white flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t(lang, 'queueUpdated')}
        </button>
      )}
    </div>
  );
}

// ==========================================
// DOCTOR ASV TRANSFER HANDLER
// ==========================================
function DoctorAsv({ lang }: { lang: LangCode }) {
  const [vials, setVials] = useState('2');
  const [stable, setStable] = useState(false);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<{ transfer_request_id: string; plan: Awaited<ReturnType<typeof asvPlan>>['plan'] } | null>(null);
  const [status, setStatus] = useState<AsvStatusResult | null>(null);

  async function makePlan() {
    setBusy(true);
    setError('');
    try {
      const result = await asvPlan({ origin_lat: 28.6139, origin_lng: 77.209, vials_needed: Number(vials) || 1, patient_stable: stable, patient_ref: ref.trim() || 'WALKIN' });
      setPlan(result);
    } catch (e) {
      setError((e as Error).message || t(lang, 'errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    if (!plan) return;
    setBusy(true);
    try {
      await asvRequest(plan.transfer_request_id);
      const s = await asvStatus(plan.transfer_request_id);
      setStatus(s);
    } catch (e) {
      setError((e as Error).message || t(lang, 'errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-2">
        <h3 className="font-bold text-emerald-900 flex items-center gap-2"><Package className="w-5 h-5" /> ASV Request</h3>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Patient reference" className="w-full border-2 border-emerald-200 rounded-xl px-3 min-h-[48px]" />
        <input value={vials} onChange={(e) => setVials(e.target.value)} inputMode="numeric" placeholder="Vials needed" className="w-full border-2 border-emerald-200 rounded-xl px-3 min-h-[48px]" />
        <label className="flex items-center gap-2 text-sm text-emerald-900">
          <input type="checkbox" checked={stable} onChange={(e) => setStable(e.target.checked)} /> Patient stable enough to travel
        </label>
        <button onClick={makePlan} disabled={busy} className="btn-touch w-full bg-emerald-700 text-white disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Calculate Plan
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      {plan && (
        <div className="card p-4 space-y-2 fade-in">
          <p className="font-bold text-emerald-900">{plan.plan.status}</p>
          <p className="text-sm text-emerald-800">{plan.plan.move_mode}: {plan.plan.move_reason}</p>
          {plan.plan.sources.map((s) => (
            <p key={s.batch_id} className="text-sm text-emerald-800">
              {s.hospital_name} — {s.vials} vial(s), batch {s.batch_code}, ~{s.travel_minutes} min {s.estimated ? '~' : ''}
              {s.toxicology_24x7 ? ' · 24x7 toxicology' : ''}
            </p>
          ))}
          {plan.plan.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {w}</p>
          ))}
          {plan.plan.status === 'PLAN_READY' && (
            <button onClick={sendRequest} disabled={busy} className="btn-touch w-full bg-emerald-600 text-white">
              Send Request
            </button>
          )}
        </div>
      )}

      {status && (
        <div className="card p-4 space-y-1 text-sm fade-in">
          <p className="font-bold text-emerald-900">Transfer {status.request.status}</p>
          <p className="text-emerald-800">Current location: {status.current_location ?? '—'}</p>
          <p className="text-emerald-800">Transit: {status.transit_minutes ?? '—'} min · Cold chain: {status.cold_chain_ok === false ? 'WARNING' : 'OK'}</p>
          {status.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// AUDIT LOG VIEW
// ==========================================
export function AuditLog({ lang, log }: { lang: LangCode; log: { id: string; ts: string; role: string; action: string; patient_ref: string; is_break_glass?: boolean }[] }) {
  return (
    <section className="card p-5 space-y-3 bg-white border-2 border-emerald-200">
      <h2 className="font-bold text-emerald-900 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-700" />
        {t(lang, 'auditLog')}
      </h2>
      <ul className="text-xs space-y-1.5 max-h-72 overflow-y-auto">
        {log.map((l) => (
          <li key={l.id} className="text-slate-700 border-b border-emerald-50 pb-1.5 flex items-center justify-between">
            <div>
              <span className="font-semibold text-emerald-900">[{l.role}]</span> {l.action} {l.patient_ref && `· Ref: ${l.patient_ref}`}
              {l.is_break_glass && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px]">
                  BREAK-GLASS
                </span>
              )}
            </div>
            <span className="text-slate-400 text-[10px]">{new Date(l.ts).toLocaleTimeString()}</span>
          </li>
        ))}
        {log.length === 0 && <li className="text-slate-400 italic">No audit records recorded yet.</li>}
      </ul>
    </section>
  );
}
