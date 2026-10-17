import { useEffect, useState } from 'react';
import { LogOut, Stethoscope, Building2, ShieldAlert } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { LangCode, StaffUser, Hospital } from '@/types';
import { setStaffToken, clearStaffToken, hospitalsList } from '@/lib/api';
import { DemoBadge } from '@/components/Chrome';
import { DoctorView, DeskView } from '@/components/RoleViews';

export function StaffLogin({
  lang,
  onLoggedIn,
  onBack,
}: {
  lang: LangCode;
  onLoggedIn: (u: StaffUser) => void;
  onBack: () => void;
}) {
  const [role, setRole] = useState<'DOCTOR' | 'RECEPTION'>('DOCTOR');
  const [hospitalId, setHospitalId] = useState('h01');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    hospitalsList()
      .then((d) => {
        if (d.hospitals && d.hospitals.length > 0) {
          setHospitals(d.hospitals);
          setHospitalId(d.hospitals[0].id);
        }
      })
      .catch(() => {});
  }, []);

  function handleEnter() {
    const selectedHosp = hospitals.find((h) => h.id === hospitalId);
    const hospName = selectedHosp?.name || 'Demo Hospital';
    const user: StaffUser = {
      id: `staff-${Date.now()}`,
      username: role === 'DOCTOR' ? 'doctor_demo' : 'desk_demo',
      role: role,
      display_name: role === 'DOCTOR' ? `Dr. Sharma (${hospName})` : `Admissions Desk (${hospName})`,
      hospital_id: hospitalId,
    };
    setStaffToken('demo-staff-token');
    onLoggedIn(user);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4 fade-in">
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-700" /> Staff Portal
          </h2>
          <DemoBadge label="DEMO ONLY" />
        </div>

        <p className="text-xs text-emerald-700">
          Demo data: simulated. Select role and hospital to enter without credentials.
        </p>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-emerald-900">Role</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole('DOCTOR')}
              className={`btn-touch !min-h-[48px] flex items-center justify-center gap-2 border-2 ${
                role === 'DOCTOR'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-900 border-emerald-200'
              }`}
            >
              <Stethoscope className="w-4 h-4" /> Doctor
            </button>
            <button
              type="button"
              onClick={() => setRole('RECEPTION')}
              className={`btn-touch !min-h-[48px] flex items-center justify-center gap-2 border-2 ${
                role === 'RECEPTION'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-900 border-emerald-200'
              }`}
            >
              <Building2 className="w-4 h-4" /> Hospital Desk
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-emerald-900">Hospital</label>
          <select
            value={hospitalId}
            onChange={(e) => setHospitalId(e.target.value)}
            className="w-full border-2 border-emerald-200 rounded-xl px-3 min-h-[50px] text-emerald-950 font-medium bg-white focus:border-emerald-500 outline-none"
          >
            {hospitals.length > 0 ? (
              hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.area})
                </option>
              ))
            ) : (
              <>
                <option value="h01">Demo General Hospital 01 (Connaught Place)</option>
                <option value="h02">Demo Medical Institute 02 (Ansari Nagar)</option>
                <option value="h03">Demo District Hospital 03 (Rohini)</option>
                <option value="h04">Demo Trauma Centre 04 (Civil Lines)</option>
              </>
            )}
          </select>
        </div>

        <button
          onClick={handleEnter}
          className="btn-touch w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center gap-2 mt-4"
        >
          Enter Dashboard
        </button>

        <button onClick={onBack} className="text-sm text-emerald-800 underline block text-center pt-2">
          ← {t(lang, 'goHome')}
        </button>
      </div>
    </div>
  );
}

export function StaffDashboard({
  lang,
  user,
  onLogout,
}: {
  lang: LangCode;
  user: StaffUser;
  onLogout: () => void;
}) {
  const [activeHospitalId, setActiveHospitalId] = useState(user.hospital_id || 'h01');
  const [activeRole, setActiveRole] = useState<'DOCTOR' | 'DESK'>(
    user.role === 'DOCTOR' ? 'DOCTOR' : 'DESK'
  );
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    hospitalsList()
      .then((d) => setHospitals(d.hospitals ?? []))
      .catch(() => {});
  }, []);

  function logout() {
    clearStaffToken();
    onLogout();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4 fade-in">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-emerald-900">{user.display_name}</h1>
            <DemoBadge label="DEMO ONLY" />
          </div>
          <p className="text-xs text-emerald-700">Demo data: simulated</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex border border-emerald-300 rounded-lg overflow-hidden text-xs">
            <button
              onClick={() => setActiveRole('DOCTOR')}
              className={`px-3 py-1.5 font-bold ${
                activeRole === 'DOCTOR' ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-900'
              }`}
            >
              Doctor Queue
            </button>
            <button
              onClick={() => setActiveRole('DESK')}
              className={`px-3 py-1.5 font-bold ${
                activeRole === 'DESK' ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-900'
              }`}
            >
              Hospital Desk
            </button>
          </div>

          <select
            value={activeHospitalId}
            onChange={(e) => setActiveHospitalId(e.target.value)}
            className="text-xs border border-emerald-300 rounded-lg px-2 py-1.5 bg-white font-medium text-emerald-900 outline-none"
          >
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          <button
            onClick={logout}
            className="btn-touch !min-h-[36px] px-3 py-1 bg-white border border-emerald-300 text-emerald-800 text-xs flex items-center gap-1.5 rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" /> {t(lang, 'logout')}
          </button>
        </div>
      </div>

      {activeRole === 'DOCTOR' ? (
        <DoctorView lang={lang} hospitalId={activeHospitalId} />
      ) : (
        <DeskView lang={lang} hospitalId={activeHospitalId} />
      )}
    </div>
  );
}
