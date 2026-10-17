import { useState } from 'react';
import { LogOut, Loader2, ShieldAlert, KeyRound, Building2 } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { LangCode, StaffUser } from '@/types';
import { staffLogin, setStaffToken, clearStaffToken } from '@/lib/api';
import { lockKey } from '@/lib/crypto';
import { DemoBadge } from '@/components/Chrome';
import { DoctorView, ReceptionView, AdminView } from '@/components/RoleViews';

export function StaffLogin({ lang, onLoggedIn, onBack }: { lang: LangCode; onLoggedIn: (u: StaffUser) => void; onBack: () => void }) {
  const [username, setUsername] = useState('doctor1');
  const [password, setPassword] = useState('demo123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setBusy(true);
    setError('');
    try {
      const { token, user } = await staffLogin(username, password);
      setStaffToken(token);
      onLoggedIn(user);
    } catch (e) {
      setError((e as Error).message || t(lang, 'errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  function pickPreset(u: string) {
    setUsername(u);
    setPassword('demo123');
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4 fade-in">
      <div className="card p-5 space-y-3">
        <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-emerald-700" /> {t(lang, 'doctorLogin')}
        </h2>
        <div className="flex flex-wrap gap-1.5 pb-1">
          <button
            type="button"
            onClick={() => pickPreset('doctor1')}
            className={`text-xs px-2.5 py-1 rounded-full border ${username === 'doctor1' ? 'bg-emerald-700 text-white border-emerald-700 font-semibold' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
          >
            doctor1 (Hosp A)
          </button>
          <button
            type="button"
            onClick={() => pickPreset('doctor2')}
            className={`text-xs px-2.5 py-1 rounded-full border ${username === 'doctor2' ? 'bg-emerald-700 text-white border-emerald-700 font-semibold' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
          >
            doctor2 (Hosp B)
          </button>
          <button
            type="button"
            onClick={() => pickPreset('desk1')}
            className={`text-xs px-2.5 py-1 rounded-full border ${username === 'desk1' ? 'bg-emerald-700 text-white border-emerald-700 font-semibold' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
          >
            desk1 (Desk A)
          </button>
          <button
            type="button"
            onClick={() => pickPreset('admin1')}
            className={`text-xs px-2.5 py-1 rounded-full border ${username === 'admin1' ? 'bg-emerald-700 text-white border-emerald-700 font-semibold' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
          >
            admin1 (Desk B)
          </button>
          <button
            type="button"
            onClick={() => pickPreset('reception1')}
            className={`text-xs px-2.5 py-1 rounded-full border ${username === 'reception1' ? 'bg-emerald-700 text-white border-emerald-700 font-semibold' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
          >
            reception1
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
          className="space-y-3"
        >
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError('');
            }}
            placeholder={t(lang, 'username')}
            className="w-full border-2 border-emerald-200 rounded-xl px-3 text-lg min-h-[52px] focus:border-emerald-500 outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder={t(lang, 'password')}
            className="w-full border-2 border-emerald-200 rounded-xl px-3 text-lg min-h-[52px] focus:border-emerald-500 outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-touch w-full bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-5 h-5 animate-spin" />} {t(lang, 'login')}
          </button>
        </form>
        <p className="text-xs text-emerald-700">{t(lang, 'loginHint')}</p>
        {error && <p className="text-sm text-red-700 font-medium">{error}</p>}
        <button type="button" onClick={onBack} className="text-sm text-emerald-800 underline">
          ← {t(lang, 'goHome')}
        </button>
      </div>
    </div>
  );
}

export function StaffDashboard({ lang, user, onLogout }: { lang: LangCode; user: StaffUser; onLogout: () => void }) {
  function logout() {
    lockKey();
    clearStaffToken();
    onLogout();
  }

  const roleLabel =
    user.role === 'HOSPITAL_DESK' ? 'Emergency Desk'
    : user.role === 'ADMIN' ? 'Hospital Admin'
    : user.role;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border-2 border-emerald-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold">
            {user.role === 'DOCTOR' ? <KeyRound className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-emerald-950">{user.display_name}</h1>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
              {roleLabel} {user.hospital_id ? `· Hosp ID: ${user.hospital_id.slice(0, 8)}…` : ''}
            </p>
          </div>
        </div>
        <button onClick={logout} className="btn-touch !min-h-[44px] bg-white border-2 border-emerald-300 text-emerald-800 flex items-center gap-2 hover:bg-red-50 hover:border-red-300 hover:text-red-700">
          <LogOut className="w-4 h-4" /> {t(lang, 'logout')}
        </button>
      </div>
      <DemoBadge />

      {user.role === 'DOCTOR' && <DoctorView lang={lang} user={user} />}
      {user.role === 'RECEPTION' && <ReceptionView lang={lang} />}
      {(user.role === 'ADMIN' || user.role === 'HOSPITAL_DESK') && <AdminView lang={lang} user={user} />}
    </div>
  );
}
