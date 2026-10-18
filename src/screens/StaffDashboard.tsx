import { useEffect, useState } from 'react';
import { LogOut, Stethoscope, Building2, ShieldAlert, ChevronDown } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { LangCode, StaffUser, Hospital } from '@/types';
import { setStaffToken, clearStaffToken } from '@/lib/api';
import { fetchStaffHospitals } from '@/lib/staffApi';
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
  const [role, setRole] = useState<'DOCTOR' | 'HOSPITAL_DESK'>('DOCTOR');
  const [hospitalId, setHospitalId] = useState('h01');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    fetchStaffHospitals()
      .then((res) => {
        if (res.ok && res.data?.hospitals && res.data.hospitals.length > 0) {
          setHospitals(res.data.hospitals);
          setHospitalId(res.data.hospitals[0].id);
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
      role: role === 'DOCTOR' ? 'DOCTOR' : 'RECEPTION',
      display_name:
        role === 'DOCTOR'
          ? `Dr. Sharma (${hospName})`
          : `Admissions Officer (${hospName})`,
      hospital_id: hospitalId,
    };
    setStaffToken('demo-staff-token');
    onLoggedIn(user);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4 fade-in">
      <div className="card p-6 space-y-4 bg-white border border-emerald-200 shadow-sm rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-950 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-700" /> {t(lang, 'staff.portalTitle')}
          </h2>
          <DemoBadge label="demo only" />
        </div>

        <p className="text-xs text-emerald-700 font-medium">
          {t(lang, 'staff.demoSimulated')}. Select role and hospital to enter without credentials.
        </p>

        {/* Role dropdown (Doctor / Hospital desk) labelled "demo only" */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-emerald-950">
            Role <span className="text-[11px] font-normal text-emerald-600">(demo only)</span>
          </label>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'DOCTOR' | 'HOSPITAL_DESK')}
              className="w-full border-2 border-emerald-200 rounded-xl px-3.5 min-h-[48px] text-emerald-950 font-semibold bg-white focus:border-emerald-600 outline-none appearance-none"
            >
              <option value="DOCTOR">{t(lang, 'staff.roleDoctor')}</option>
              <option value="HOSPITAL_DESK">{t(lang, 'staff.roleDesk')}</option>
            </select>
            <ChevronDown className="w-4 h-4 text-emerald-700 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Hospital dropdown labelled "demo only" */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-emerald-950">
            Hospital <span className="text-[11px] font-normal text-emerald-600">(demo only)</span>
          </label>
          <div className="relative">
            <select
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              className="w-full border-2 border-emerald-200 rounded-xl px-3.5 min-h-[48px] text-emerald-950 font-semibold bg-white focus:border-emerald-600 outline-none appearance-none"
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
            <ChevronDown className="w-4 h-4 text-emerald-700 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <button
          type="button"
          onClick={handleEnter}
          className="btn-touch w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center gap-2 mt-4 text-sm"
        >
          Enter Dashboard
        </button>

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-emerald-800 hover:text-emerald-950 underline block text-center pt-2 font-medium"
        >
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
  const [activeRole, setActiveRole] = useState<'DOCTOR' | 'HOSPITAL_DESK'>(
    user.role === 'DOCTOR' ? 'DOCTOR' : 'HOSPITAL_DESK'
  );
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  useEffect(() => {
    fetchStaffHospitals()
      .then((res) => {
        if (res.ok && res.data?.hospitals) {
          setHospitals(res.data.hospitals);
        }
      })
      .catch(() => {});
  }, []);

  function logout() {
    clearStaffToken();
    onLogout();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4 fade-in">
      {/* Top Header Card */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3 bg-white border border-emerald-200 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-emerald-950">{user.display_name}</h1>
            <DemoBadge label="demo only" />
          </div>
          <p className="text-xs text-emerald-700 font-semibold">{t(lang, 'staff.demoSimulated')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Dropdown labelled "demo only" */}
          <div className="relative">
            <select
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as 'DOCTOR' | 'HOSPITAL_DESK')}
              title="Role (demo only)"
              className="text-xs border-2 border-emerald-200 rounded-lg px-2.5 py-1.5 bg-white font-bold text-emerald-950 outline-none appearance-none pr-7"
            >
              <option value="DOCTOR">{t(lang, 'staff.roleDoctor')} (demo)</option>
              <option value="HOSPITAL_DESK">{t(lang, 'staff.roleDesk')} (demo)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-700 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Hospital Dropdown labelled "demo only" */}
          <div className="relative">
            <select
              value={activeHospitalId}
              onChange={(e) => setActiveHospitalId(e.target.value)}
              title="Hospital (demo only)"
              className="text-xs border-2 border-emerald-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-emerald-950 outline-none appearance-none pr-7 max-w-[200px] truncate"
            >
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-700 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Existing Log out button */}
          <button
            type="button"
            onClick={logout}
            className="btn-touch !min-h-[36px] px-3 py-1 bg-white border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-1.5 rounded-lg hover:bg-emerald-50"
          >
            <LogOut className="w-3.5 h-3.5" /> {t(lang, 'logout')}
          </button>
        </div>
      </div>

      {/* Main View: Doctor View or Hospital Desk View */}
      {activeRole === 'DOCTOR' ? (
        <DoctorView lang={lang} hospitalId={activeHospitalId} />
      ) : (
        <DeskView lang={lang} hospitalId={activeHospitalId} />
      )}
    </div>
  );
}
