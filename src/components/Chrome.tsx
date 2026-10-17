import { Phone, HeartPulse, Info, Globe } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { LangCode } from '@/types';

export function Header({
  lang,
  onHome,
  onToggleLang,
}: {
  lang: LangCode;
  onHome: () => void;
  onToggleLang?: (l: LangCode) => void;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-emerald-900/10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2 sm:gap-3">
        <button onClick={onHome} className="flex items-center gap-2 mr-auto text-left">
          <HeartPulse className="w-8 h-8 text-emerald-700 shrink-0" />
          <span>
            <span className="block font-bold text-lg leading-tight text-emerald-900">{t(lang, 'appName')}</span>
            <span className="block text-xs text-emerald-700">{t(lang, 'tagline')}</span>
          </span>
        </button>

        {/* Immediate language switcher in header */}
        {onToggleLang && (
          <button
            onClick={() => onToggleLang(lang === 'hi-IN' ? 'en-IN' : 'hi-IN')}
            className="text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-900 hover:bg-emerald-50 flex items-center gap-1"
            title="Switch language"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-700" />
            <span>{lang === 'hi-IN' ? 'English' : 'हिन्दी'}</span>
          </button>
        )}

        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold tracking-wide bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-2 py-1">
          <Info className="w-3 h-3" /> {t(lang, 'demoPill')}
        </span>

        <a
          href="tel:108"
          className="btn-touch !min-h-[44px] !text-sm sm:!text-base bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 flex items-center gap-1.5 sm:gap-2"
        >
          <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="whitespace-nowrap">108 / 112</span>
        </a>
      </div>
    </header>
  );
}

export function DemoBanner({ lang }: { lang: LangCode }) {
  return (
    <div className="bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm rounded-xl px-3 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0 text-amber-700" />
        <span>{t(lang, 'demoBanner')}</span>
      </div>
      <DemoBadge lang={lang} />
    </div>
  );
}

export function DemoBadge({ label, lang = 'en-IN' }: { label?: string; lang?: LangCode }) {
  return (
    <span className="inline-flex items-center text-[10px] font-bold tracking-wide bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-2 py-0.5 uppercase">
      {label ?? t(lang, 'demoSimulated')}
    </span>
  );
}
