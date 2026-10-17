import { useMemo, useState } from 'react';
import { MapPin, Sparkles, CheckCircle2, Star } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { LangCode, Hospital } from '@/types';
import { haversineKm } from '@/lib/helpers';
import { DemoBadge } from '@/components/Chrome';

interface Props {
  lang: LangCode;
  location: { lat: number; lng: number };
  hospitals: Hospital[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}

export function HospitalChooser({ lang, location, hospitals, selected, onSelect, onNext }: Props) {
  const [recommendation, setRecommendation] = useState<string | null>(null);

  const scoredHospitals = useMemo(() => {
    return hospitals.map((h) => {
      const km = haversineKm(location, h);
      const distPts = Math.max(0, 50 - km * 2);
      const queuePts = Math.max(0, 30 - h.queue_length * 1.5);
      const bedPts = Math.min(20, h.icu_beds_available * 2);
      return { h, km, total: distPts + queuePts + bedPts };
    });
  }, [hospitals, location]);

  const bestHospitalId = useMemo(() => {
    if (scoredHospitals.length === 0) return null;
    const sorted = [...scoredHospitals].sort((a, b) => b.total - a.total);
    return sorted[0].h.id;
  }, [scoredHospitals]);

  const ranked = useMemo(
    () =>
      [...scoredHospitals].sort((a, b) => a.km - b.km),
    [scoredHospitals],
  );

  function recommend() {
    const sorted = [...scoredHospitals].sort((a, b) => b.total - a.total);
    const best = sorted[0];
    if (best) {
      onSelect(best.h.id);
      setRecommendation(
        `${best.h.name} — ${best.km.toFixed(1)} ${t(lang, 'kmAway')}, ${best.h.queue_length} ${t(lang, 'queueLen')}, ${best.h.icu_beds_available} ICU. (${t(lang, 'recommended')})`,
      );
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-emerald-900">{t(lang, 'chooseHospital')}</h2>
        <DemoBadge lang={lang} />
      </div>

      <button
        onClick={recommend}
        className="btn-touch w-full bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center gap-2 font-bold"
      >
        <Sparkles className="w-5 h-5 text-amber-300" /> {t(lang, 'recommend')}
      </button>

      {recommendation && (
        <p className="text-sm bg-emerald-50 border border-emerald-300 text-emerald-950 font-medium rounded-xl px-3 py-2 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{recommendation}</span>
        </p>
      )}

      <ul className="space-y-3">
        {ranked.map(({ h, km }) => {
          const isRecommended = h.id === bestHospitalId;
          const isSelected = selected === h.id;

          return (
            <li key={h.id}>
              <button
                onClick={() => onSelect(h.id)}
                className={`w-full text-left card p-4 transition border-2 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/80 shadow-sm'
                    : 'hover:border-emerald-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      <p className="font-bold text-emerald-900">{h.name}</p>
                      {isRecommended && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-600 fill-amber-500" /> {t(lang, 'recommended')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-emerald-700">{h.area}, {h.city}</p>
                    <p className="text-xs text-emerald-600">{h.specialties?.join(' · ')}</p>
                  </div>

                  <div className="text-right text-sm whitespace-nowrap">
                    <p className="text-emerald-800 font-semibold flex items-center gap-1 justify-end">
                      <MapPin className="w-4 h-4 text-emerald-600" /> {km.toFixed(1)} {t(lang, 'kmAway')}
                    </p>
                    <p className="text-amber-700 text-xs font-medium">
                      {h.queue_length} {t(lang, 'queueLen')}
                    </p>
                    <p className="text-emerald-700 text-[11px]">
                      {h.icu_beds_available} ICU beds
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        onClick={onNext}
        disabled={!selected}
        className="btn-touch w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-40"
      >
        {t(lang, 'continue')}
      </button>

      <p className="text-[11px] text-gray-500 text-center">
        {t(lang, 'demoSimulated')}
      </p>
    </div>
  );
}
