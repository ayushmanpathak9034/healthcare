import { useState, useEffect } from 'react';
import {
  FileText,
  AlertCircle,
  Loader2,
  Calendar,
  CheckCircle,
  Upload,
  Image as ImageIcon,
  Edit2,
  Sparkles,
} from 'lucide-react';
import type { LangCode, StaffRecord } from '@/types';
import { t } from '@/lib/i18n';
import { fetchPatientRecords } from '@/lib/staffApi';

interface PatientRecordsCardProps {
  lang: LangCode;
  entryId: string;
  abhaId?: string | null;
}

export function PatientRecordsCard({
  lang,
  entryId,
  abhaId,
}: PatientRecordsCardProps) {
  const [records, setRecords] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Browser OCR state (Stage 5)
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [browserRecords, setBrowserRecords] = useState<
    Array<{
      id: string;
      title: string;
      date: string;
      extracted_text: string;
      confidence: number;
    }>
  >([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetchPatientRecords(entryId, abhaId || undefined);
      if (active) {
        if (res.ok && res.data) {
          setRecords(res.data.records || []);
        } else {
          setError(res.error || 'Unable to fetch patient records');
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [entryId, abhaId]);

  // Run browser-side OCR on an image file or URL using tesseract.js
  async function runBrowserOcr(imageSource: File | string, title: string) {
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrStatusText('Initializing OCR engine in browser…');

    try {
      // Dynamic import of tesseract.js to avoid bundle weight if unused
      const Tesseract = await import('tesseract.js');

      const result = await Tesseract.recognize(imageSource, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round((m.progress || 0) * 100));
            setOcrStatusText(`Reading text… ${Math.round((m.progress || 0) * 100)}%`);
          } else {
            setOcrStatusText(m.status || 'Processing…');
          }
        },
      });

      const extractedText = result.data.text.trim();
      const meanConfidence = Math.round(result.data.confidence || 0);

      const newRecord = {
        id: `ocr-${Date.now()}`,
        title,
        date: new Date().toISOString().split('T')[0],
        extracted_text: extractedText || '(No readable printed text detected)',
        confidence: meanConfidence,
      };

      setBrowserRecords((prev) => [newRecord, ...prev]);
    } catch (err) {
      const msg = (err as Error).message || 'OCR processing failed';
      setBrowserRecords((prev) => [
        {
          id: `ocr-${Date.now()}`,
          title: `${title} (Failed)`,
          date: new Date().toISOString().split('T')[0],
          extracted_text: `OCR Error: ${msg}. Please review original document manually.`,
          confidence: 0,
        },
        ...prev,
      ]);
    } finally {
      setOcrRunning(false);
      setOcrProgress(null);
      setOcrStatusText('');
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      runBrowserOcr(file, `Uploaded: ${file.name}`);
    }
    // reset input
    e.target.value = '';
  }

  function handleTrySample(samplePath: string, sampleTitle: string) {
    runBrowserOcr(samplePath, sampleTitle);
  }

  return (
    <div className="card p-4 bg-white border border-emerald-200 rounded-xl space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
        <div>
          <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-700" />
            {t(lang, 'staff.recordsOcr')}
          </h4>
          <p className="text-[11px] text-emerald-700">
            {t(lang, 'staff.sampleSimulated')} • Clinical reports & prescriptions
          </p>
        </div>

        {/* OCR Action Buttons (Stage 5) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="btn-touch !min-h-[34px] px-2.5 py-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 rounded-lg font-semibold flex items-center gap-1 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{t(lang, 'staff.uploadReport')}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={ocrRunning}
            />
          </label>

          <button
            type="button"
            disabled={ocrRunning}
            onClick={() => handleTrySample('/sample-reports/report-blood-test.png', 'Sample Blood Test Report')}
            className="btn-touch !min-h-[34px] px-2.5 py-1 text-xs bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg font-semibold flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sample Lab Report</span>
          </button>

          <button
            type="button"
            disabled={ocrRunning}
            onClick={() => handleTrySample('/sample-reports/report-prescription.png', 'Sample Prescription Report')}
            className="btn-touch !min-h-[34px] px-2.5 py-1 text-xs bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 rounded-lg font-semibold flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-700" />
            <span>Sample Rx Report</span>
          </button>
        </div>
      </div>

      {/* OCR Progress Indicator */}
      {ocrRunning && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              {ocrStatusText || 'Running browser OCR (English)…'}
            </span>
            {ocrProgress !== null && <span>{ocrProgress}%</span>}
          </div>
          {ocrProgress !== null && (
            <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-700 h-full transition-all duration-300"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
          )}
          <p className="text-[10px] text-emerald-700">
            Processed 100% in browser with Tesseract.js. No images uploaded or stored on servers.
          </p>
        </div>
      )}

      {/* Real Browser OCR Extracted Records (Stage 5) */}
      {browserRecords.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            {t(lang, 'staff.extractedBrowser')}:
          </span>
          {browserRecords.map((brec, bidx) => {
            const isLowConf = brec.confidence < 60;
            const isEditing = editingIndex === bidx;

            return (
              <div
                key={brec.id || bidx}
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  isLowConf
                    ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                    : 'bg-emerald-50/40 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs">{brec.title}</span>
                    <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {brec.date}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        isLowConf
                          ? 'bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-emerald-200 text-emerald-900 border border-emerald-300'
                      }`}
                    >
                      {brec.confidence}% confidence
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(isEditing ? null : bidx)}
                      className="text-emerald-700 hover:text-emerald-900 p-1"
                      title="Edit extracted text"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isLowConf && (
                  <div className="text-[11px] text-amber-900 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                    {t(lang, 'staff.lowConfidenceWarning')}
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={brec.extracted_text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBrowserRecords((prev) => {
                          const copy = [...prev];
                          copy[bidx] = { ...copy[bidx], extracted_text: val };
                          return copy;
                        });
                      }}
                      rows={5}
                      className="w-full text-xs font-mono p-2 border-2 border-emerald-300 rounded-lg bg-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingIndex(null)}
                      className="text-xs bg-emerald-700 text-white px-2.5 py-1 rounded font-semibold"
                    >
                      Done Editing
                    </button>
                  </div>
                ) : (
                  <div className="bg-white p-2 rounded-lg border border-emerald-100 font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {brec.extracted_text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Simulated Server Seeded Records (Stage 4) */}
      {loading ? (
        <div className="p-4 flex items-center justify-center gap-2 text-xs text-emerald-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading synthetic clinical records…
        </div>
      ) : error ? (
        <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          <span>{error}</span>
        </div>
      ) : records.length === 0 ? (
        <p className="text-xs text-emerald-700 italic">No prior sample records seeded for this patient.</p>
      ) : (
        <div className="space-y-2.5">
          {records.map((rec) => (
            <div
              key={rec.id}
              className="p-3 bg-white rounded-xl border border-emerald-200 shadow-sm text-xs space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-950 text-xs">{rec.title}</span>
                  <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {rec.date}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                  {rec.confidence}% confidence (simulated)
                </span>
              </div>

              <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 font-mono text-[11px] text-emerald-950 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {rec.extracted_text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
