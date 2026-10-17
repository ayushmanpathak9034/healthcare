import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Ambulance,
  Phone,
  Loader2,
  MapPin,
  RotateCcw,
  Mic,
  MicOff,
  Send,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  emergencyCreate,
  emergencyStatus,
  emergencyRetry,
  emergencyAnswers,
  type EmergencyCreateResult,
  type EmergencyStatusResult,
  type IntakeResult,
} from '@/lib/api';
import type { LangCode } from '@/types';
import { t } from '@/lib/i18n';
import { formatClock, createRecognition } from '@/lib/helpers';
import { DemoBadge } from '@/components/Chrome';

export function RedPath({
  lang,
  location,
}: {
  lang: LangCode;
  location: { lat: number; lng: number } | null;
}) {
  const [step, setStep] = useState<'IDLE' | 'SENT'>('IDLE');
  const [description, setDescription] = useState('');
  const [listeningDesc, setListeningDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Emergency tracking
  const [requestId, setRequestId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<EmergencyCreateResult['candidates']>([]);
  const [status, setStatus] = useState<EmergencyStatusResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [isFallback, setIsFallback] = useState(false);

  // Follow-up open questions (max 3, one at a time, answered by voice or text)
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [listeningAnswer, setListeningAnswer] = useState(false);
  const [answeredList, setAnsweredList] = useState<{ question: string; answer: string }[]>([]);
  const [followupBusy, setFollowupBusy] = useState(false);

  const descRecRef = useRef<ReturnType<typeof createRecognition>>(null);
  const answerRecRef = useRef<ReturnType<typeof createRecognition>>(null);

  // Speech recognition for main description
  function toggleDescMic() {
    if (listeningDesc) {
      descRecRef.current?.stop();
      setListeningDesc(false);
      return;
    }
    const rec = createRecognition(lang);
    if (!rec) return;
    descRecRef.current = rec;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (text) setDescription((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onerror = () => setListeningDesc(false);
    rec.onend = () => setListeningDesc(false);
    rec.start();
    setListeningDesc(true);
  }

  // Speech recognition for follow-up answer
  function toggleAnswerMic() {
    if (listeningAnswer) {
      answerRecRef.current?.stop();
      setListeningAnswer(false);
      return;
    }
    const rec = createRecognition(lang);
    if (!rec) return;
    answerRecRef.current = rec;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (text) setCurrentAnswer((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onerror = () => setListeningAnswer(false);
    rec.onend = () => setListeningAnswer(false);
    rec.start();
    setListeningAnswer(true);
  }

  // Poll status when emergency sent
  useEffect(() => {
    if (step !== 'SENT' || !requestId) return;

    let active = true;
    async function check() {
      if (!requestId) return;
      try {
        const s: any = await emergencyStatus(requestId);
        if (!active) return;
        setStatus(s);
        if (s.seconds_left !== undefined) {
          setSecondsLeft(s.seconds_left);
        }
        if (s.status === 'fallback' || s.fallback) {
          setIsFallback(true);
        }
      } catch {
        /* continue polling */
      }
    }

    check();
    const interval = setInterval(check, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [step, requestId]);

  // Immediate alert broadcast
  const sendEmergencyAlert = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const created = await emergencyCreate({
        kind: 'AMBULANCE',
        lat: location?.lat || 28.6139,
        lng: location?.lng || 77.2090,
        language: lang,
        transcript: description.trim() || undefined,
      } as any);

      setRequestId(created.request_id);
      setCandidates(created.candidates ?? []);
      setStep('SENT');

      // Fetch initial follow-up question if any
      const initialAnswers = await emergencyAnswers({
        request_id: created.request_id,
        transcript: description.trim(),
        answers: [],
        language: lang,
      });

      if (initialAnswers.summary?.followup_question) {
        setCurrentQuestion(initialAnswers.summary.followup_question);
      }
    } catch (e) {
      setError((e as Error).message || t(lang, 'errorGeneric'));
    } finally {
      setBusy(false);
    }
  }, [description, lang, location]);

  // Submit open follow-up answer
  async function submitFollowupAnswer() {
    if (!requestId || !currentQuestion || !currentAnswer.trim()) return;

    const newPair = { question: currentQuestion, answer: currentAnswer.trim() };
    const nextList = [...answeredList, newPair];
    setAnsweredList(nextList);
    setCurrentAnswer('');
    setFollowupBusy(true);

    try {
      const res = await emergencyAnswers({
        request_id: requestId,
        answers: nextList,
        language: lang,
      });

      if (res.summary?.followup_question && nextList.length < 3) {
        setCurrentQuestion(res.summary.followup_question);
      } else {
        setCurrentQuestion(null);
      }
    } catch {
      setCurrentQuestion(null);
    } finally {
      setFollowupBusy(false);
    }
  }

  async function handleRetry() {
    if (!requestId) return;
    try {
      await emergencyRetry(requestId);
      setIsFallback(false);
    } catch {
      /* ignore */
    }
  }

  // ==================== 1. IDLE SCREEN ====================
  if (step === 'IDLE') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 fade-in">
        <div className="flex items-center justify-between">
          <DemoBadge lang={lang} />
          <span className="text-xs text-red-700 font-semibold">{t(lang, 'emergency')}</span>
        </div>

        <h2 className="text-2xl font-black text-red-900">{t(lang, 'redTitle')}</h2>
        <p className="text-sm text-red-800">{t(lang, 'redNoLogin')}</p>

        {/* Immediate Call Ambulance Button */}
        <button
          onClick={sendEmergencyAlert}
          disabled={busy}
          className="btn-touch w-full !min-h-[140px] !text-2xl bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center gap-2 pulse-red disabled:opacity-60 shadow-lg"
        >
          {busy ? <Loader2 className="w-12 h-12 animate-spin" /> : <Ambulance className="w-12 h-12" />}
          <span className="font-black tracking-wide">{t(lang, 'callAmbulance')}</span>
          <span className="text-xs font-normal opacity-90">Broadcasts alert to nearest 3 hospitals immediately</span>
        </button>

        {/* Immediate Call 108 */}
        <a
          href="tel:108"
          className="btn-touch w-full !min-h-[56px] bg-red-900 hover:bg-red-950 text-white flex items-center justify-center gap-2 font-bold text-lg"
        >
          <Phone className="w-6 h-6" /> {t(lang, 'call108')}
        </a>

        {/* Describe what happened: open voice or text */}
        <div className="card p-5 space-y-3 bg-white border border-red-200">
          <label className="block font-bold text-red-950 text-base">
            {t(lang, 'describeWhatHappened')}
          </label>

          <div className="relative">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Chest pain radiating to arm, or snake bite on foot…"
              rows={3}
              className="w-full border-2 border-red-200 rounded-xl px-3 py-2 pr-12 text-sm text-red-950 focus:border-red-500 outline-none"
            />
            <button
              type="button"
              onClick={toggleDescMic}
              className={`absolute right-2.5 top-2.5 p-2 rounded-full ${
                listeningDesc ? 'bg-red-600 text-white animate-pulse' : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
              title="Speak description"
            >
              {listeningDesc ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={sendEmergencyAlert}
            disabled={busy}
            className="btn-touch w-full bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-5 h-5 animate-spin" />}
            {t(lang, 'sendRequest')}
          </button>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-50 p-2 rounded-lg">{error}</p>}

        <p className="text-[11px] text-gray-500 text-center">
          {t(lang, 'demoSimulated')}
        </p>
      </div>
    );
  }

  // ==================== 2. SENT SCREEN (Live Status + Follow-ups) ====================
  const acceptedHospital =
    (status as any)?.accepted_hospital ||
    (status?.accepted_name ? { name: status.accepted_name, address: status.accepted_address } : null);

  const isAccepted = status?.status === 'ACCEPTED' || !!acceptedHospital;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <DemoBadge lang={lang} />
        <span className="text-xs font-bold text-red-700 uppercase">Alert Active</span>
      </div>

      <h2 className="text-2xl font-black text-red-900">{t(lang, 'emergencyRequestSent')}</h2>

      {/* Live Status Card */}
      {isAccepted ? (
        <div className="card p-6 text-center border-2 border-emerald-500 bg-emerald-50 space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto" />
          <p className="text-lg font-bold text-emerald-950">{t(lang, 'acceptedBy')}</p>
          <p className="text-xl font-black text-emerald-900">
            {acceptedHospital?.name || 'Emergency Hospital'}
          </p>
          {acceptedHospital?.address && (
            <p className="text-sm text-emerald-800 flex items-center justify-center gap-1">
              <MapPin className="w-4 h-4" /> {acceptedHospital.address}
            </p>
          )}
          <p className="text-xs text-emerald-700 font-semibold pt-2">
            Bed held for 30 minutes. Medical team prepared for pre-arrival.
          </p>
        </div>
      ) : isFallback ? (
        <div className="card p-6 text-center border-2 border-red-600 bg-red-100 space-y-3">
          <AlertTriangle className="w-12 h-12 text-red-700 mx-auto" />
          <p className="text-lg font-bold text-red-950">
            {t(lang, 'fallbackAlert')}
          </p>
          <p className="text-sm text-red-800">
            Broadcasting exhausted 2 rounds. 108 Emergency Service notified.
          </p>
          <a
            href="tel:108"
            className="btn-touch w-full bg-red-800 text-white font-bold flex items-center justify-center gap-2 text-lg"
          >
            <Phone className="w-6 h-6" /> 108 / 112
          </a>
          <button
            onClick={handleRetry}
            className="btn-touch !min-h-[44px] bg-white border-2 border-red-300 text-red-800 inline-flex items-center gap-2 mx-auto"
          >
            <RotateCcw className="w-4 h-4" /> Keep retrying
          </button>
        </div>
      ) : (
        <div className="card p-6 text-center border-2 border-red-300 bg-red-50 space-y-2">
          <p className="text-red-900 font-bold pulse-red text-lg">{t(lang, 'waitingAccept')}</p>
          <p className="text-red-800 text-sm font-semibold">
            {t(lang, 'countdown')} {formatClock(secondsLeft)}s
          </p>

          <p className="text-xs text-red-700">
            Alert broadcasted to top 3 capable hospitals in your vicinity.
          </p>

          <button
            onClick={handleRetry}
            className="btn-touch !min-h-[44px] bg-white border-2 border-red-300 text-red-800 inline-flex items-center gap-2 mx-auto mt-2"
          >
            <RotateCcw className="w-4 h-4" /> Keep retrying
          </button>
        </div>
      )}

      {/* Up to 3 AI Follow-up Questions (One at a time, answered by voice or text) */}
      {currentQuestion && !isAccepted && !isFallback && (
        <div className="card p-5 space-y-3 bg-white border-2 border-emerald-300 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
              Clinician Follow-up ({answeredList.length + 1} of 3)
            </span>
            <span className="text-[11px] text-emerald-600">Voice or Text</span>
          </div>

          <p className="font-extrabold text-emerald-950 text-sm">
            {currentQuestion}
          </p>

          <div className="relative">
            <input
              type="text"
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Speak or type your answer…"
              className="w-full border-2 border-emerald-300 rounded-xl px-3 py-2 pr-20 text-sm text-emerald-950 focus:border-emerald-500 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && submitFollowupAnswer()}
            />
            <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={toggleAnswerMic}
                className={`p-1.5 rounded-lg ${
                  listeningAnswer
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                }`}
                title="Speak answer"
              >
                {listeningAnswer ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={submitFollowupAnswer}
                disabled={followupBusy || !currentAnswer.trim()}
                className="p-1.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Answered Questions log */}
      {answeredList.length > 0 && (
        <div className="card p-4 space-y-2 text-xs bg-emerald-50/50 border border-emerald-200">
          <span className="font-bold text-emerald-950 block">Details attached to hospital alert:</span>
          {answeredList.map((a, i) => (
            <div key={i} className="text-emerald-900">
              <span className="font-semibold">{a.question}:</span> {a.answer}
            </div>
          ))}
        </div>
      )}

      {/* Candidate Hospitals List */}
      {candidates.length > 0 && (
        <div className="card p-4 bg-white border border-emerald-100">
          <h3 className="font-bold text-emerald-900 mb-2 text-sm">{t(lang, 'hospitalsNearby')}</h3>
          <ul className="space-y-1.5 text-xs text-emerald-800">
            {candidates.map((c) => (
              <li key={c.id} className="flex justify-between items-center py-1 border-b border-emerald-50">
                <span className="font-medium text-emerald-950">{c.name}</span>
                <span className="text-emerald-700 font-semibold">{c.distance_km} {t(lang, 'kmAway')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href="tel:108"
        className="btn-touch w-full bg-red-900 text-white flex items-center justify-center gap-2 font-bold"
      >
        <Phone className="w-5 h-5" /> 108 / 112
      </a>

      <p className="text-[11px] text-gray-500 text-center">
        {t(lang, 'demoSimulated')}
      </p>
    </div>
  );
}
