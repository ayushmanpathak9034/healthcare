import { useState, useEffect, useCallback } from 'react';
import {
  Bed,
  Activity,
  Plus,
  Minus,
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle,
  FlaskConical,
  RefreshCw,
  Loader2,
  Wrench,
  Check,
} from 'lucide-react';
import type { LangCode, StaffHospitalBedsState, StaffHospitalResourceState } from '@/types';
import { t } from '@/lib/i18n';
import {
  fetchHospitalResources,
  updateHospitalBeds,
  updateHospitalResource,
  demoReset,
  demoFlip,
  demoSimulateStale,
} from '@/lib/staffApi';

const RESOURCE_KEYS: Array<{ key: string; label: string; category: string }> = [
  { key: 'asv', label: 'Antivenom (ASV)', category: 'Antidotes' },
  { key: 'anti_rabies', label: 'Anti-rabies Vaccine', category: 'Vaccines' },
  { key: 'adrenaline', label: 'Adrenaline', category: 'Emergency Drugs' },
  { key: 'rate_control_drugs', label: 'Rate-control Drugs', category: 'Cardiology' },
  { key: 'thrombolysis', label: 'Thrombolytic Therapy', category: 'Emergency Meds' },
  { key: 'oxygen', label: 'Medical Oxygen', category: 'Respiratory' },
  { key: 'blood_o_neg', label: 'Blood Group O- (Universal)', category: 'Blood Bank' },
  { key: 'blood_a_pos', label: 'Blood Group A+', category: 'Blood Bank' },
  { key: 'blood_b_pos', label: 'Blood Group B+', category: 'Blood Bank' },
  { key: 'blood_ab_pos', label: 'Blood Group AB+', category: 'Blood Bank' },
];

export function ResourcePanel({
  lang,
  hospitalId,
}: {
  lang: LangCode;
  hospitalId: string;
}) {
  const [beds, setBeds] = useState<StaffHospitalBedsState | null>(null);
  const [resources, setResources] = useState<Record<string, StaffHospitalResourceState>>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  // Check if ?demo=1 in URL
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsDemoMode(params.get('demo') === '1');
    }
  }, []);

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const res = await fetchHospitalResources(hospitalId);
    if (res.ok && res.data) {
      setBeds(res.data.beds);
      setResources(res.data.resources || {});
      setErrorMsg(null);
    } else {
      setErrorMsg(res.error || 'Failed to load hospital resource inventory');
    }
    if (isInitial) setLoading(false);
  }, [hospitalId]);

  // Poll every 3 seconds with cleanup on unmount
  useEffect(() => {
    let active = true;

    async function initial() {
      if (!active) return;
      await loadData(true);
    }

    initial();

    const timer = setInterval(() => {
      if (active) loadData(false);
    }, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadData]);

  // Bed adjustment (+ or -)
  const handleBedChange = async (bedType: 'icu' | 'general' | 'ot', delta: number) => {
    if (!beds) return;
    const current =
      bedType === 'icu' ? beds.available_icu : bedType === 'general' ? beds.available_general : (beds.available_ot || 0);
    const newCount = Math.max(0, current + delta);

    setUpdatingKey(`bed-${bedType}`);
    setActionMsg(null);

    const res = await updateHospitalBeds(hospitalId, bedType, newCount);
    setUpdatingKey(null);

    if (res.ok && res.data) {
      setBeds(res.data.beds);
      setActionMsg({ text: `Updated ${bedType.toUpperCase()} beds to ${newCount}` });
    } else {
      setActionMsg({ text: res.error || 'Failed to update bed count', error: true });
    }
  };

  // Resource status toggle (Available / Low / Out)
  const handleResourceToggle = async (resourceKey: string, status: 'available' | 'low' | 'out') => {
    setUpdatingKey(`res-${resourceKey}`);
    setActionMsg(null);

    const res = await updateHospitalResource(hospitalId, resourceKey, status);
    setUpdatingKey(null);

    if (res.ok && res.data) {
      setResources((prev) => ({
        ...prev,
        [resourceKey]: res.data!.resource,
      }));
      setActionMsg({ text: `Updated ${resourceKey} to ${status.toUpperCase()}` });
    } else {
      setActionMsg({ text: res.error || 'Failed to update resource', error: true });
    }
  };

  // Demo Tools actions
  const handleDemoReset = async () => {
    setUpdatingKey('demo-reset');
    setActionMsg(null);
    const res = await demoReset();
    setUpdatingKey(null);
    if (res.ok) {
      setActionMsg({ text: 'Demo store reset successfully' });
      await loadData(false);
    } else {
      setActionMsg({ text: res.error || 'Failed to reset demo', error: true });
    }
  };

  const handleDemoFlip = async () => {
    const currentAsvStatus = resources.asv?.status || 'available';
    const nextStatus = currentAsvStatus === 'out' ? 'available' : 'out';

    setUpdatingKey('demo-flip');
    setActionMsg(null);

    const res = await demoFlip(hospitalId, 'asv', nextStatus);
    setUpdatingKey(null);

    if (res.ok) {
      setActionMsg({ text: `Antivenom flipped to ${nextStatus.toUpperCase()}` });
      await loadData(false);
    } else {
      setActionMsg({ text: res.error || 'Failed to flip antivenom', error: true });
    }
  };

  const handleDemoSimulateStale = async () => {
    setUpdatingKey('demo-stale');
    setActionMsg(null);

    const res = await demoSimulateStale(hospitalId);
    setUpdatingKey(null);

    if (res.ok) {
      setActionMsg({ text: 'Simulated stale timestamps (>60 min ago)' });
      await loadData(false);
    } else {
      setActionMsg({ text: res.error || 'Failed to simulate stale timestamps', error: true });
    }
  };

  // Format time and check stale status (>60 min)
  const getFreshness = (isoString?: string) => {
    if (!isoString) return { isStale: false, label: 'Just now' };
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const isStale = diffMinutes >= 60;

    let label = '';
    if (diffMinutes < 1) label = 'Just now';
    else if (diffMinutes < 60) label = `${diffMinutes}m ago`;
    else {
      const hours = Math.floor(diffMinutes / 60);
      label = `${hours}h ${diffMinutes % 60}m ago`;
    }

    return { isStale, label };
  };

  const bedsFreshness = getFreshness(beds?.last_updated);

  return (
    <div className="space-y-4">
      {/* Demo Tools Strip (visible only with ?demo=1 in URL) */}
      {isDemoMode && (
        <div className="card p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5 uppercase tracking-wide">
              <Wrench className="w-4 h-4 text-amber-700" />
              Demo Tools Strip (?demo=1)
            </span>
            <span className="text-[11px] font-medium text-amber-800">
              Instant controls for testing triage exclusion & stale warning
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={updatingKey !== null}
              onClick={handleDemoReset}
              className="btn-touch !min-h-[36px] px-3 py-1 text-xs bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-50 rounded-lg font-bold flex items-center gap-1.5 shadow-sm"
            >
              {updatingKey === 'demo-reset' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Reset Demo
            </button>

            <button
              type="button"
              disabled={updatingKey !== null}
              onClick={handleDemoFlip}
              className="btn-touch !min-h-[36px] px-3 py-1 text-xs bg-white text-amber-950 border border-amber-300 hover:bg-amber-100 rounded-lg font-bold flex items-center gap-1.5 shadow-sm"
            >
              {updatingKey === 'demo-flip' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FlaskConical className="w-3.5 h-3.5 text-amber-700" />
              )}
              Flip Antivenom ({resources.asv?.status === 'out' ? 'OUT → AVAILABLE' : 'AVAILABLE → OUT'})
            </button>

            <button
              type="button"
              disabled={updatingKey !== null}
              onClick={handleDemoSimulateStale}
              className="btn-touch !min-h-[36px] px-3 py-1 text-xs bg-white text-gray-800 border border-gray-300 hover:bg-gray-100 rounded-lg font-bold flex items-center gap-1.5 shadow-sm"
            >
              {updatingKey === 'demo-stale' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Simulate Stale (&gt;60m)
            </button>
          </div>
        </div>
      )}

      {/* Header and status banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-950 flex items-center gap-2">
            <Bed className="w-5 h-5 text-emerald-700" />
            {t(lang, 'staff.resources')}
          </h2>
          <p className="text-xs text-emerald-700">
            {t(lang, 'staff.demoSimulated')} • Live bed counts & critical emergency drug inventory
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(false)}
          className="p-1.5 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-50 border border-emerald-200"
          title="Refresh resources"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Inline Action & Error Feedback */}
      {actionMsg && (
        <div
          className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            actionMsg.error ? 'bg-red-50 text-red-900 border border-red-200' : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
          }`}
        >
          {actionMsg.error ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <CheckCircle className="w-4 h-4 text-emerald-700" />}
          <span>{actionMsg.text}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="card p-8 flex flex-col items-center justify-center gap-2 text-emerald-800">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-sm font-medium">Loading hospital resources…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Bed Counts Per Type with + and - */}
          <div
            className={`card p-4 border rounded-xl space-y-3 transition-colors ${
              bedsFreshness.isStale
                ? 'bg-gray-100 border-gray-300 text-gray-800 opacity-70'
                : 'bg-white border-emerald-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  <Bed className="w-4 h-4 text-emerald-700" />
                  Bed Availability Counts
                </span>
                {bedsFreshness.isStale && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                    {t(lang, 'staff.callToConfirm')} ({bedsFreshness.label})
                  </span>
                )}
              </div>
              <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Updated: {bedsFreshness.label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* ICU Beds */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950">ICU Beds</span>
                  <span className="text-[11px] font-mono text-emerald-700">Total: {beds?.icu ?? 20}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-emerald-950">
                    {beds?.available_icu ?? 0}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={updatingKey === 'bed-icu' || (beds?.available_icu ?? 0) <= 0}
                      onClick={() => handleBedChange('icu', -1)}
                      className="btn-touch !min-h-[36px] w-9 h-9 flex items-center justify-center bg-white border border-emerald-300 rounded-lg text-emerald-900 font-bold hover:bg-emerald-100 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={updatingKey === 'bed-icu'}
                      onClick={() => handleBedChange('icu', 1)}
                      className="btn-touch !min-h-[36px] w-9 h-9 flex items-center justify-center bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* General Beds */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950">General Beds</span>
                  <span className="text-[11px] font-mono text-emerald-700">Total: {beds?.total ?? 200}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-emerald-950">
                    {beds?.available_general ?? 0}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={updatingKey === 'bed-general' || (beds?.available_general ?? 0) <= 0}
                      onClick={() => handleBedChange('general', -1)}
                      className="btn-touch !min-h-[36px] w-9 h-9 flex items-center justify-center bg-white border border-emerald-300 rounded-lg text-emerald-900 font-bold hover:bg-emerald-100 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={updatingKey === 'bed-general'}
                      onClick={() => handleBedChange('general', 1)}
                      className="btn-touch !min-h-[36px] w-9 h-9 flex items-center justify-center bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* OT / Emergency Beds */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950">Emergency OT Beds</span>
                  <span className="text-[11px] font-mono text-emerald-700">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-emerald-950">
                    {beds?.available_ot ?? 2}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={updatingKey === 'bed-ot' || (beds?.available_ot ?? 0) <= 0}
                      onClick={() => handleBedChange('ot', -1)}
                      className="btn-touch !min-h-[36px] w-9 h-9 flex items-center justify-center bg-white border border-emerald-300 rounded-lg text-emerald-900 font-bold hover:bg-emerald-100 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={updatingKey === 'bed-ot'}
                      onClick={() => handleBedChange('ot', 1)}
                      className="btn-touch !min-h-[36px] w-9 h-9 flex items-center justify-center bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Critical Resources: Available / Low / Out Toggles */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-emerald-950 uppercase tracking-wide">
              Critical Emergency Resources & Antidotes
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {RESOURCE_KEYS.map((item) => {
                const resState = resources[item.key] || {
                  status: 'available',
                  updated_at: new Date().toISOString(),
                };
                const { isStale, label } = getFreshness(resState.updated_at);
                const currentStatus = (resState.status || 'available').toLowerCase();

                return (
                  <div
                    key={item.key}
                    className={`card p-3.5 border rounded-xl space-y-2.5 transition-all shadow-sm ${
                      isStale
                        ? 'bg-gray-100 border-gray-300 text-gray-800 opacity-65'
                        : 'bg-white border-emerald-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div>
                        <span className="font-bold text-xs text-emerald-950 block">{item.label}</span>
                        <span className="text-[10px] text-emerald-700 font-medium">{item.category}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-right">
                        {isStale && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                            {t(lang, 'staff.callToConfirm')}
                          </span>
                        )}
                        <span className="text-[10px] text-emerald-700 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {label}
                        </span>
                      </div>
                    </div>

                    {/* Available / Low / Out 3-way toggle */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={updatingKey === `res-${item.key}`}
                        onClick={() => handleResourceToggle(item.key, 'available')}
                        className={`btn-touch !min-h-[36px] py-1 text-xs font-bold rounded-lg border transition-all ${
                          currentStatus === 'available'
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                            : 'bg-emerald-50/50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        Available
                      </button>

                      <button
                        type="button"
                        disabled={updatingKey === `res-${item.key}`}
                        onClick={() => handleResourceToggle(item.key, 'low')}
                        className={`btn-touch !min-h-[36px] py-1 text-xs font-bold rounded-lg border transition-all ${
                          currentStatus === 'low'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                            : 'bg-amber-50/50 text-amber-950 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        Low
                      </button>

                      <button
                        type="button"
                        disabled={updatingKey === `res-${item.key}`}
                        onClick={() => handleResourceToggle(item.key, 'out')}
                        className={`btn-touch !min-h-[36px] py-1 text-xs font-bold rounded-lg border transition-all ${
                          currentStatus === 'out'
                            ? 'bg-red-700 text-white border-red-700 shadow-sm'
                            : 'bg-red-50/50 text-red-950 border-red-200 hover:bg-red-100'
                        }`}
                      >
                        Out
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
