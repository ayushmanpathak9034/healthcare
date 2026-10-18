import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  AlertOctagon,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  MapPin,
  RefreshCw,
  Bed,
} from 'lucide-react';
import type { LangCode, StaffIncomingEmergencyCard } from '@/types';
import { t } from '@/lib/i18n';
import { fetchDeskIncoming, respondDeskEmergency } from '@/lib/staffApi';
import { ResourcePanel } from './ResourcePanel';

// Format emergency types cleanly without ever labeling GENERAL_EMERGENCY
function formatEmergencyTypes(types?: string[]): string {
  if (!types || types.length === 0) return 'Emergency (type not given)';

  const filtered = types.filter((t) => {
    const lower = t.toLowerCase();
    return lower !== 'general_emergency' && lower !== 'general' && lower !== 'emergency';
  });

  if (filtered.length === 0) return 'Emergency (type not given)';

  return filtered
    .map((raw) => {
      return raw
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    })
    .join(', ');
}

type DeclineReasonKey = 'no_bed' | 'no_specialist' | 'no_equipment' | 'other';

const DECLINE_OPTIONS: Array<{ key: DeclineReasonKey; label: string }> = [
  { key: 'no_bed', label: 'No Bed Available' },
  { key: 'no_specialist', label: 'Specialist Not Available' },
  { key: 'no_equipment', label: 'Equipment / Resource Lacking' },
  { key: 'other', label: 'Other Operational Constraint' },
];

export function DeskView({
  lang,
  hospitalId,
}: {
  lang: LangCode;
  hospitalId: string;
}) {
  const [activeTab, setActiveTab] = useState<'INCOMING' | 'RESOURCES'>('INCOMING');
  const [incoming, setIncoming] = useState<StaffIncomingEmergencyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Decline picker state: requestId -> selected reason
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState<DeclineReasonKey>('no_bed');

  // Loading and feedback per card: requestId -> { busy, conflictMsg, errorMsg, successMsg }
  const [actionStates, setActionStates] = useState<
    Record<string, { busy?: boolean; conflictMsg?: string; errorMsg?: string; successMsg?: string }>
  >({});

  // Toggle for collapsed Recent list
  const [showRecent, setShowRecent] = useState(false);

  // 3-second live polling with cleanup on unmount
  const loadIncoming = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const res = await fetchDeskIncoming(hospitalId);
    if (res.ok && res.data) {
      setIncoming(res.data.incoming || []);
      setFetchError(null);
    } else {
      setFetchError(res.error || 'Unable to update incoming emergency requests');
    }
    if (isInitial) setLoading(false);
  }, [hospitalId]);

  useEffect(() => {
    let active = true;

    async function initial() {
      if (!active) return;
      await loadIncoming(true);
    }

    initial();

    const timer = setInterval(() => {
      if (active) loadIncoming(false);
    }, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadIncoming]);

  // Handle Accept
  const handleAccept = async (card: StaffIncomingEmergencyCard) => {
    const reqId = card.request_id;
    setActionStates((prev) => ({
      ...prev,
      [reqId]: { busy: true, conflictMsg: undefined, errorMsg: undefined },
    }));

    const res = await respondDeskEmergency(reqId, hospitalId, 'accept');

    if (res.ok) {
      setActionStates((prev) => ({
        ...prev,
        [reqId]: { busy: false, successMsg: 'Emergency request accepted. Bed held for 30 minutes.' },
      }));
      await loadIncoming(false);
    } else {
      const is409 =
        res.status === 409 ||
        (res.error && res.error.toLowerCase().includes('already accepted'));

      setActionStates((prev) => ({
        ...prev,
        [reqId]: {
          busy: false,
          conflictMsg: is409 ? t(lang, 'staff.anotherAccepted') : undefined,
          errorMsg: is409 ? undefined : (res.error || 'Failed to accept request'),
        },
      }));
    }
  };

  // Handle Decline
  const handleConfirmDecline = async (card: StaffIncomingEmergencyCard) => {
    const reqId = card.request_id;
    setActionStates((prev) => ({
      ...prev,
      [reqId]: { busy: true, errorMsg: undefined },
    }));

    const res = await respondDeskEmergency(reqId, hospitalId, 'decline', selectedDeclineReason);

    if (res.ok) {
      setDecliningId(null);
      setActionStates((prev) => ({
        ...prev,
        [reqId]: { busy: false, successMsg: 'Request declined and forwarded to alternate hospitals.' },
      }));
      await loadIncoming(false);
    } else {
      setActionStates((prev) => ({
        ...prev,
        [reqId]: {
          busy: false,
          errorMsg: res.error || 'Failed to decline request',
        },
      }));
    }
  };

  // Separate pending vs non-pending (cancelled, accepted, expired)
  const pendingCards = incoming.filter((c) => c.my_status === 'pending');
  const recentCards = incoming.filter((c) => c.my_status !== 'pending');

  return (
    <div className="space-y-4">
      {/* Sub-nav tabs: Incoming Emergency Queue vs Resource & Bed Panel */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('INCOMING')}
            className={`btn-touch !min-h-[40px] px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border-2 ${
              activeTab === 'INCOMING'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <AlertOctagon className="w-4 h-4 text-red-500" />
            {t(lang, 'staff.hospitalDesk')} ({pendingCards.length} pending)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RESOURCES')}
            className={`btn-touch !min-h-[40px] px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border-2 ${
              activeTab === 'RESOURCES'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <Bed className="w-4 h-4" />
            {t(lang, 'staff.resources')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live polling (3s)
          </span>
          <button
            type="button"
            onClick={() => loadIncoming(false)}
            title="Refresh"
            className="p-1.5 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-50 border border-emerald-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Render Resource Panel if active tab */}
      {activeTab === 'RESOURCES' && (
        <ResourcePanel lang={lang} hospitalId={hospitalId} />
      )}

      {/* Render Incoming Emergencies if active tab */}
      {activeTab === 'INCOMING' && (
        <div className="space-y-4">
          <p className="text-xs text-emerald-700">
            {t(lang, 'staff.demoSimulated')} • Emergency broadcast cards with automatic distance & resource suitability
          </p>

          {fetchError && (
            <div className="card p-3 bg-amber-50 border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {loading && incoming.length === 0 ? (
            <div className="card p-8 flex flex-col items-center justify-center gap-2 text-emerald-800">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <p className="text-sm font-medium">Monitoring incoming emergency broadcasts…</p>
            </div>
          ) : pendingCards.length === 0 ? (
            <div className="card p-8 text-center text-emerald-800 space-y-1">
              <p className="font-semibold text-base">No pending emergency alerts right now</p>
              <p className="text-xs text-emerald-600">
                When a patient submits an emergency request within your area, it will immediately appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCards.map((card) => {
                const actionState = actionStates[card.request_id] || {};
                const isDeclining = decliningId === card.request_id;
                const formattedType = formatEmergencyTypes(card.emergency_types);

                return (
                  <div
                    key={card.request_id}
                    className="card p-4.5 bg-white border-2 border-emerald-200 rounded-2xl shadow-sm space-y-3.5 hover:border-emerald-300 transition-all"
                  >
                    {/* Top Row: Type & ETA */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1.5">
                          <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
                          {formattedType}
                        </span>
                        <span className="font-mono text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {card.request_id}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-bold text-emerald-950">
                        <span className="flex items-center gap-1 text-emerald-800">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          {card.distance_km} km away
                        </span>
                        <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                          <Clock className="w-3.5 h-3.5" />
                          ETA: ~{card.eta_min} min
                        </span>
                      </div>
                    </div>

                    {/* Middle: Clinical Summary / Transcript */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 space-y-1">
                        <span className="font-bold text-emerald-950 block">Clinical Summary:</span>
                        <p className="text-emerald-900 leading-relaxed">
                          {card.summary?.chief_complaint || 'Emergency assessment reported'}
                        </p>
                      </div>

                      <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 space-y-1">
                        <span className="font-bold text-emerald-950 block">Patient Transcript:</span>
                        <p className="text-emerald-950 font-mono italic leading-relaxed">
                          {card.transcript ? `"${card.transcript}"` : '(No raw transcript text)'}
                        </p>
                      </div>
                    </div>

                    {/* System Suggestion Badge + Reasons (ONLY shown when pending) */}
                    {card.my_status === 'pending' && (
                      <div
                        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                          card.suggestion === 'can_accept'
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                            : 'bg-amber-50/80 border-amber-300 text-amber-950'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              card.suggestion === 'can_accept'
                                ? 'bg-emerald-700 text-white border-emerald-700'
                                : 'bg-amber-600 text-white border-amber-600'
                            }`}
                          >
                            {card.suggestion === 'can_accept'
                              ? t(lang, 'staff.canAccept')
                              : t(lang, 'staff.checkNeeded')}
                          </span>
                          <span className="text-xs font-medium">
                            {card.suggestion_reasons?.join('; ') || 'Resource verification complete'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Feedback Messages (Conflict / Error / Success) */}
                    {actionState.conflictMsg && (
                      <div className="p-3 bg-red-100 border-2 border-red-400 rounded-xl text-red-950 text-xs font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                        <span>{actionState.conflictMsg}</span>
                      </div>
                    )}
                    {actionState.errorMsg && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{actionState.errorMsg}</span>
                      </div>
                    )}
                    {actionState.successMsg && (
                      <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-950 text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>{actionState.successMsg}</span>
                      </div>
                    )}

                    {/* Decline Reason Picker (shown if Decline clicked) */}
                    {isDeclining && (
                      <div className="p-3.5 bg-red-50/60 border-2 border-red-200 rounded-xl space-y-2.5">
                        <span className="text-xs font-bold text-red-950 block">
                          Select Reason for Declining:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {DECLINE_OPTIONS.map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setSelectedDeclineReason(opt.key)}
                              className={`p-2 rounded-lg text-xs font-semibold border text-left transition-all ${
                                selectedDeclineReason === opt.key
                                  ? 'bg-red-700 text-white border-red-700'
                                  : 'bg-white text-red-950 border-red-200 hover:bg-red-50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={actionState.busy}
                            onClick={() => handleConfirmDecline(card)}
                            className="btn-touch !min-h-[40px] px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
                          >
                            {actionState.busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            Confirm Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecliningId(null)}
                            className="text-xs text-red-800 underline px-2 py-1"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons: Accept & Decline (Shown ONLY when my_status === 'pending') */}
                    {card.my_status === 'pending' && !isDeclining && (
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          disabled={actionState.busy}
                          onClick={() => handleAccept(card)}
                          className="btn-touch !min-h-[46px] px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-xl flex-1 flex items-center justify-center gap-2 shadow-sm"
                        >
                          {actionState.busy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {t(lang, 'staff.accept')}
                        </button>

                        <button
                          type="button"
                          disabled={actionState.busy}
                          onClick={() => {
                            setDecliningId(card.request_id);
                            setSelectedDeclineReason('no_bed');
                          }}
                          className="btn-touch !min-h-[46px] px-5 py-2 bg-white hover:bg-red-50 text-red-700 border-2 border-red-300 text-sm font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          {t(lang, 'staff.decline')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Small Collapsed "Recent Decisions / Resolved Requests" List */}
          {recentCards.length > 0 && (
            <div className="card p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
              <button
                type="button"
                onClick={() => setShowRecent(!showRecent)}
                className="w-full flex items-center justify-between text-xs font-bold text-gray-700 hover:text-gray-900"
              >
                <span>Recent / Resolved Requests ({recentCards.length})</span>
                {showRecent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showRecent && (
                <div className="space-y-2 pt-1 border-t border-gray-200">
                  {recentCards.map((rc) => {
                    const isAccepted = rc.my_status === 'accepted';
                    const isCancelled = rc.my_status === 'cancelled';
                    const formattedType = formatEmergencyTypes(rc.emergency_types);

                    return (
                      <div
                        key={rc.request_id}
                        className="p-2.5 bg-white rounded-lg border border-gray-200 text-xs flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              isAccepted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : isCancelled
                                ? 'bg-gray-100 text-gray-700 border border-gray-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {rc.my_status.toUpperCase()}
                          </span>
                          <span className="font-semibold text-gray-900">{formattedType}</span>
                          <span className="font-mono text-gray-500">({rc.request_id})</span>
                        </div>

                        {/* Specific Cancel Reason */}
                        <div className="text-[11px] font-medium text-gray-600">
                          {rc.cancel_reason ? (
                            <span className="italic">{rc.cancel_reason}</span>
                          ) : isAccepted ? (
                            <span className="text-emerald-700">Accepted by this hospital</span>
                          ) : (
                            <span>{rc.overall_status}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
