import { useCallback, useEffect, useState } from 'react';
import { Clock, Hash, Users, Flag } from 'lucide-react';
import { queueStatus, type IntakeResult, type QueueStatusResult } from '@/lib/api';
import type { LangCode } from '@/types';
import { t } from '@/lib/i18n';
import { useRefreshSignal, usePollFallback } from '@/lib/refresh';
import { IntakeSummaryCard } from '@/screens/VoiceIntake';
import { DemoBadge } from '@/components/Chrome';

export function QueueStatus({
  lang,
  submitted,
  hospitalName,
  intake,
  onStaffLogin,
}: {
  lang: LangCode;
  submitted: { token: string; entry_id: string; status_token?: string; position: number; estimated_wait_minutes: number };
  hospitalName: string;
  intake: IntakeResult;
  onStaffLogin: () => void;
}) {
  const [status, setStatus] = useState<QueueStatusResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await queueStatus(submitted.entry_id, submitted.status_token));
    } catch {
      /* keep last known */
    }
  }, [submitted.entry_id, submitted.status_token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRefreshSignal(refresh, 'queue');
  usePollFallback(refresh);

  const s = status ?? {
    token: submitted.token,
    position: submitted.position,
    total: submitted.position,
    estimated_wait_minutes: submitted.estimated_wait_minutes,
    triage_level: intake.triage_level,
  };

  const translatedLevel =
    s.triage_level === 'EMERGENCY'
      ? t(lang, 'triageEmergency')
      : s.triage_level === 'URGENT'
      ? t(lang, 'triageUrgent')
      : t(lang, 'triageRoutine');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-emerald-900">{t(lang, 'appointmentTitle')}</h2>
        <DemoBadge lang={lang} />
      </div>
      <p className="text-sm text-emerald-700">{hospitalName}</p>

      <div className="card p-6 text-center space-y-3">
        <p className="text-sm text-emerald-700">{t(lang, 'yourToken')}</p>
        <p className="text-5xl font-black tracking-widest text-emerald-900 flex items-center justify-center gap-2">
          <Hash className="w-8 h-8 text-emerald-500" /> {s.token}
        </p>
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div>
            <Users className="w-5 h-5 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-900">
              {s.position} <span className="font-normal">{t(lang, 'positionOf')} {s.total}</span>
            </p>
            <p className="text-xs text-emerald-700">{t(lang, 'position')}</p>
          </div>
          <div>
            <Clock className="w-5 h-5 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-900">~{s.estimated_wait_minutes}</p>
            <p className="text-xs text-emerald-700">
              {t(lang, 'estimatedWait')} ({t(lang, 'minutes')})
            </p>
          </div>
          <div>
            <Flag className="w-5 h-5 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-900">{translatedLevel}</p>
            <p className="text-xs text-emerald-700">{t(lang, 'priority')}</p>
          </div>
        </div>
        <p className="text-xs text-emerald-600 pt-1">
          {t(lang, 'waiting')} · {t(lang, 'sentToDoctor')}
        </p>
      </div>

      <IntakeSummaryCard intake={intake} lang={lang} />

      <button onClick={onStaffLogin} className="w-full text-sm text-emerald-800 underline py-2">
        {t(lang, 'doctorLogin')}
      </button>

      <p className="text-[11px] text-gray-500 text-center">
        {t(lang, 'demoSimulated')}
      </p>
    </div>
  );
}
