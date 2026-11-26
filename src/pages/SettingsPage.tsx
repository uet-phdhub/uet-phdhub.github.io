import { Database, Download, LogOut, Plus, RefreshCw, Save, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_REGULATION_3638_CONFIG, PUBLICATION_TYPE_LABELS } from '../../shared/regulation3638';
import type { EmailTemplateItem, FeeRateItem, PublicationType, Regulation3638Config, SystemBannerConfig } from '../../shared/types';
import type { AppCatalogs } from '../App';
import { apiFetch, downloadBlob } from '../shared/api';
import { formatDateTimeVN, formatDateVN } from '../shared/format';
import { Button, Drawer, Field, PageTop, Panel, StatusDot, Tag, UnderlineTabs } from '../shared/ui';

type SettingsTab = 'regulation' | 'catalogs' | 'fees' | 'users' | 'templates' | 'system';

export function SettingsPage({
  catalogs,
  onRefreshCatalogs,
}: {
  catalogs: AppCatalogs;
  onRefreshCatalogs: () => Promise<void>;
}) {
  const [tab, setTab] = useState<SettingsTab>('regulation');
  const [cfg, setCfg] = useState<Regulation3638Config>(catalogs.regulationConfig || DEFAULT_REGULATION_3638_CONFIG);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<any | null>(null);

  // Versions & Cohorts
  const [versions, setVersions] = useState<any[]>([]);
  const [newVer, setNewVer] = useState({ code: '', name: '', effective_from: new Date().toISOString().slice(0, 10) });
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [newCohort, setNewCohort] = useState({ code: '', start_date: '', regulation_version_id: '' });

  // Catalogs
  const [newFac, setNewFac] = useState({ code: '', name: '', short_name: '' });
  const [newMajor, setNewMajor] = useState({ code: '', name: '', faculty_id: '' });

  // Fee Rates
  const [feeRates, setFeeRates] = useState<FeeRateItem[]>([]);
  const [pitRatePct, setPitRatePct] = useState('10');
  const [pitThreshold, setPitThreshold] = useState('2000000');

  // Users & Auth Events
  const [users, setUsers] = useState<any[]>([]);
  const [scientists, setScientists] = useState<any[]>([]);
  const [authEvents, setAuthEvents] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'admin', scientist_id: '', expires_at: '' });

  // Email Templates
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<EmailTemplateItem | null>(null);

  // System Health, Audit Logs, Secret Logs, Backups, Orphans
  const [sysHealth, setSysHealth] = useState<any | null>(null);
  const [bannerForm, setBannerForm] = useState<SystemBannerConfig>({
    maintenanceMode: false,
    maintenanceMessage: '',
    bannerText: '',
    bannerTone: 'info',
  });
  const [backups, setBackups] = useState<any[]>([]);
  const [orphanScan, setOrphanScan] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditDiff, setAuditDiff] = useState<any | null>(null);
  const [secretLogs, setSecretLogs] = useState<any[]>([]);

  useEffect(() => {
    if (catalogs.regulationConfig) setCfg(catalogs.regulationConfig);
  }, [catalogs.regulationConfig]);

  const loadSystemTab = useCallback(async () => {
    try {
      const [h, bkp, logs, sec] = await Promise.all([
        apiFetch('/api/system/health'),
        apiFetch<{ items: any[] }>('/api/system/backups'),
        apiFetch<{ items: any[] }>(`/api/settings/audit-logs?search=${encodeURIComponent(auditSearch)}`),
        apiFetch<{ items: any[] }>('/api/settings/secret-access-logs'),
      ]);
      setSysHealth(h);
      if (h.systemBanner) setBannerForm(h.systemBanner);
      setBackups(bkp.items || []);
      setAuditLogs(logs.items || []);
      setSecretLogs(sec.items || []);
    } catch {}
  }, [auditSearch]);

  useEffect(() => {
    if (tab === 'regulation') {
      apiFetch<{ items: any[] }>('/api/settings/regulation-versions').then((d) => setVersions(d.items || [])).catch(() => {});
      apiFetch<{ items: any[] }>('/api/settings/cohorts').then((d) => setCohorts(d.items || [])).catch(() => {});
    } else if (tab === 'fees') {
      apiFetch<{ items: FeeRateItem[] }>('/api/settings/fee-rates')
        .then((d) => {
          const list = d.items || [];
          setFeeRates(list);
          if (list[0]) {
            setPitRatePct(String(Math.round(Number(list[0].pit_tax_rate ?? 0.1) * 100)));
            setPitThreshold(String(Number(list[0].pit_threshold ?? 2000000)));
          }
        })
        .catch(() => {});
    } else if (tab === 'users') {
      apiFetch<{ items: any[] }>('/api/settings/users').then((d) => setUsers(d.items || [])).catch(() => {});
      apiFetch<{ items: any[] }>('/api/scientists?listType=all').then((d) => setScientists(d.items || [])).catch(() => {});
      apiFetch<{ items: any[] }>('/api/settings/auth-events').then((d) => setAuthEvents(d.items || [])).catch(() => {});
    } else if (tab === 'templates') {
      apiFetch<{ items: EmailTemplateItem[] }>('/api/settings/email-templates')
        .then((d) => {
          const list = d.items || [];
          setTemplates(list);
          if (list[0] && !selectedTpl) setSelectedTpl(list[0]);
        })
        .catch(() => {});
    } else if (tab === 'system') {
      loadSystemTab();
    }
  }, [tab, loadSystemTab]);

  const handleSaveRegulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/settings/regulation-3638', { method: 'PUT', body: JSON.stringify(cfg) });
      await onRefreshCatalogs();
      setImpact(null);
      toast.success('Đã lưu cấu hình Quy chế 3638.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewImpact = async () => {
    try {
      const res = await apiFetch('/api/settings/regulation-versions/preview-impact', {
        method: 'POST',
        body: JSON.stringify({ config: cfg }),
      });
      setImpact(res);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings/regulation-versions', {
        method: 'POST',
        body: JSON.stringify({ ...newVer, config: cfg }),
      });
      setNewVer({ code: '', name: '', effective_from: new Date().toISOString().slice(0, 10) });
      const d = await apiFetch<{ items: any[] }>('/api/settings/regulation-versions');
      setVersions(d.items || []);
      await onRefreshCatalogs();
      toast.success('Đã tạo phiên bản quy chế mới.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings/cohorts', { method: 'POST', body: JSON.stringify(newCohort) });
      setNewCohort({ code: '', start_date: '', regulation_version_id: '' });
      const d = await apiFetch<{ items: any[] }>('/api/settings/cohorts');
      setCohorts(d.items || []);
      await onRefreshCatalogs();
      toast.success('Đã thêm khóa tuyển sinh.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveFeeRates = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{ items: FeeRateItem[] }>('/api/settings/fee-rates', {
        method: 'PUT',
        body: JSON.stringify({
          items: feeRates,
          pit_tax_rate: (Number(pitRatePct) || 0) / 100,
          pit_threshold: Number(pitThreshold) || 2000000,
        }),
      });
      setFeeRates(res.items || []);
      toast.success('Đã lưu bảng đơn giá thù lao.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings/faculties', { method: 'POST', body: JSON.stringify(newFac) });
      setNewFac({ code: '', name: '', short_name: '' });
      await onRefreshCatalogs();
      toast.success('Đã thêm Khoa / Viện.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddMajor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings/majors', { method: 'POST', body: JSON.stringify(newMajor) });
      setNewMajor({ code: '', name: '', faculty_id: '' });
      await onRefreshCatalogs();
      toast.success('Đã thêm Ngành đào tạo.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify({
          ...newUser,
          scientist_id: newUser.scientist_id ? Number(newUser.scientist_id) : null,
          expires_at: newUser.expires_at || null,
        }),
      });
      setNewUser({ email: '', name: '', role: 'admin', scientist_id: '', expires_at: '' });
      const d = await apiFetch<{ items: any[] }>('/api/settings/users');
      setUsers(d.items || []);
      toast.success('Đã tạo tài khoản.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleUserActive = async (u: any) => {
    await apiFetch(`/api/settings/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ active: !u.active }) });
    const d = await apiFetch<{ items: any[] }>('/api/settings/users');
    setUsers(d.items || []);
    toast.success(u.active ? `Đã khóa ${u.email}` : `Đã mở khóa ${u.email}`);
  };

  const handleRevokeSessions = async (u: any) => {
    await apiFetch(`/api/settings/users/${u.id}/revoke-sessions`, { method: 'POST' });
    toast.success(`Đã thu hồi mọi phiên đăng nhập của ${u.email}.`);
    const ev = await apiFetch<{ items: any[] }>('/api/settings/auth-events');
    setAuthEvents(ev.items || []);
  };

  return (
    <div className="space-y-5">
      <PageTop
        title="Quản trị Hệ thống"
        actions={
          tab === 'regulation' ? (
            <>
              <Button variant="secondary" onClick={handlePreviewImpact}>
                Mô phỏng tác động
              </Button>
              <Button type="submit" form="reg-3638-form" variant="primary" leadingIcon={<Save size={14} />} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </Button>
            </>
          ) : tab === 'fees' ? (
            <Button variant="primary" leadingIcon={<Save size={14} />} disabled={saving} onClick={handleSaveFeeRates}>
              Lưu bảng giá
            </Button>
          ) : null
        }
      />

      <UnderlineTabs<SettingsTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'regulation', label: 'Quy chế & Khóa' },
          { value: 'catalogs', label: 'Khoa & Ngành' },
          { value: 'fees', label: 'Đơn giá thù lao' },
          { value: 'users', label: 'Tài khoản & Phiên' },
          { value: 'templates', label: 'Mẫu Email' },
          { value: 'system', label: 'Nhật ký & Hệ thống' },
        ]}
      />

      {/* TAB 1: REGULATION 3638, VERSIONS & COHORTS */}
      {tab === 'regulation' && (
        <div className="space-y-5">
          {impact && (
            <div className="px-4 py-3 rounded-lg bg-[#eff5fc] border border-[#d2e4f8] text-xs text-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span>
                Mô phỏng trên <strong>{impact.activePhds}</strong> NCS đang học: đạt 3638 thay đổi từ{' '}
                <strong>{impact.beforeMet}</strong> → <strong>{impact.afterMet}</strong> ({impact.affectedCount} hồ sơ bị ảnh hưởng).
              </span>
              <button type="button" onClick={() => setImpact(null)} className="text-[#034ea1] font-medium cursor-pointer">Đóng</button>
            </div>
          )}

          <form id="reg-3638-form" onSubmit={handleSaveRegulation}>
            <Panel className="divide-y divide-slate-200">
              <div className="p-5 space-y-3.5">
                <h2 className="font-display text-sm font-semibold text-slate-900">Quota & Giờ hướng dẫn</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  <Field label="Trần Giáo sư (GS)"><input type="number" value={cfg.quotaGs} onChange={(e) => setCfg({ ...cfg, quotaGs: Number(e.target.value) })} /></Field>
                  <Field label="Trần PGS / TSKH"><input type="number" value={cfg.quotaPgsTskh} onChange={(e) => setCfg({ ...cfg, quotaPgsTskh: Number(e.target.value) })} /></Field>
                  <Field label="Trần Tiến sĩ (TS)"><input type="number" value={cfg.quotaTs} onChange={(e) => setCfg({ ...cfg, quotaTs: Number(e.target.value) })} /></Field>
                  <Field label="Giờ chuẩn / 1.0"><input type="number" value={cfg.standardHoursPerUnit} onChange={(e) => setCfg({ ...cfg, standardHoursPerUnit: Number(e.target.value) })} /></Field>
                  <Field label="Hệ số Độc lập"><input type="number" step="0.1" value={cfg.weightIndependent} onChange={(e) => setCfg({ ...cfg, weightIndependent: Number(e.target.value) })} /></Field>
                  <Field label="Hệ số HD chính"><input type="number" step="0.1" value={cfg.weightPrimary} onChange={(e) => setCfg({ ...cfg, weightPrimary: Number(e.target.value) })} /></Field>
                  <Field label="Hệ số HD phụ"><input type="number" step="0.1" value={cfg.weightSecondary} onChange={(e) => setCfg({ ...cfg, weightSecondary: Number(e.target.value) })} /></Field>
                  <Field label="Hệ số Đồng HD"><input type="number" step="0.1" value={cfg.weightCo} onChange={(e) => setCfg({ ...cfg, weightCo: Number(e.target.value) })} /></Field>
                </div>
              </div>

              <div className="p-5 space-y-3.5">
                <h2 className="font-display text-sm font-semibold text-slate-900">Ngưỡng chuẩn 3638 & Nhắc hạn</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  <Field label="NCS: Điểm tối thiểu"><input type="number" step="0.25" value={cfg.phdMinPoints} onChange={(e) => setCfg({ ...cfg, phdMinPoints: Number(e.target.value) })} /></Field>
                  <Field label="NCS: Bài WoS/Scopus"><input type="number" value={cfg.phdMinWosScopus} onChange={(e) => setCfg({ ...cfg, phdMinWosScopus: Number(e.target.value) })} /></Field>
                  <Field label="Cửa sổ xét CB (năm)"><input type="number" value={cfg.scientistWindowYears} onChange={(e) => setCfg({ ...cfg, scientistWindowYears: Number(e.target.value) })} /></Field>
                  <Field label="Hệ số Đồng tác giả"><input type="number" step="0.1" value={cfg.coauthorWeight} onChange={(e) => setCfg({ ...cfg, coauthorWeight: Number(e.target.value) })} /></Field>
                  <Field label="Chuẩn CBHD (đ)"><input type="number" step="0.25" value={cfg.supervisorMinPoints} onChange={(e) => setCfg({ ...cfg, supervisorMinPoints: Number(e.target.value) })} /></Field>
                  <Field label="Chuẩn PBĐL (đ)"><input type="number" step="0.25" value={cfg.reviewerMinPoints} onChange={(e) => setCfg({ ...cfg, reviewerMinPoints: Number(e.target.value) })} /></Field>
                  <Field label="Chuẩn HĐ LATS (đ)"><input type="number" step="0.25" value={cfg.councilMinPoints} onChange={(e) => setCfg({ ...cfg, councilMinPoints: Number(e.target.value) })} /></Field>
                  <Field label="Chuẩn Seminar (đ)"><input type="number" step="0.25" value={cfg.seminarMinPoints} onChange={(e) => setCfg({ ...cfg, seminarMinPoints: Number(e.target.value) })} /></Field>
                  <Field label="Cảnh báo ĐT (ngày)"><input type="number" value={cfg.deadlineWarnDays} onChange={(e) => setCfg({ ...cfg, deadlineWarnDays: Number(e.target.value) })} /></Field>
                  <Field label="Khẩn cấp ĐT (ngày)"><input type="number" value={cfg.deadlineUrgentDays} onChange={(e) => setCfg({ ...cfg, deadlineUrgentDays: Number(e.target.value) })} /></Field>
                  <Field label="Cảnh báo CĐR NN"><input type="number" value={cfg.flWarnDays} onChange={(e) => setCfg({ ...cfg, flWarnDays: Number(e.target.value) })} /></Field>
                  <Field label="Cảnh báo PBĐL"><input type="number" value={cfg.irWarnDays} onChange={(e) => setCfg({ ...cfg, irWarnDays: Number(e.target.value) })} /></Field>
                </div>
              </div>

              <div className="p-5 space-y-3.5">
                <h2 className="font-display text-sm font-semibold text-slate-900">Bảng quy đổi điểm công trình</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {(Object.keys(PUBLICATION_TYPE_LABELS) as PublicationType[]).map((key) => (
                    <Field key={key} label={PUBLICATION_TYPE_LABELS[key]}>
                      <input
                        type="number"
                        step="0.25"
                        value={cfg.pubTypePoints[key]}
                        onChange={(e) => setCfg({ ...cfg, pubTypePoints: { ...cfg.pubTypePoints, [key]: Number(e.target.value) } })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            </Panel>
          </form>

          {/* Regulation Versions & Cohorts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="font-display text-sm font-semibold text-slate-900">Phiên bản Quy chế ({versions.length})</h2>
              </div>
              <form onSubmit={handleAddVersion} className="p-3.5 border-b border-slate-100 bg-slate-50/50 grid grid-cols-12 gap-2">
                <input required placeholder="Mã (VD: 2027/QĐ)" className="col-span-4" value={newVer.code} onChange={(e) => setNewVer({ ...newVer, code: e.target.value })} />
                <input required placeholder="Tên phiên bản" className="col-span-5" value={newVer.name} onChange={(e) => setNewVer({ ...newVer, name: e.target.value })} />
                <Button type="submit" size="sm" variant="primary" className="col-span-3" leadingIcon={<Plus size={12} />}>Nhân bản</Button>
              </form>
              <div className="divide-y divide-slate-100 text-xs">
                {versions.map((v) => (
                  <div key={v.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="mono font-semibold text-[#034ea1] mr-2">{v.code}</span>
                      <span className="text-slate-800">{v.name}</span>
                    </div>
                    {v.is_default ? <Tag tone="success">Mặc định</Tag> : <span className="text-slate-400 mono">{formatDateVN(v.effective_from)}</span>}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="font-display text-sm font-semibold text-slate-900">Khóa / Đợt tuyển sinh ({cohorts.length})</h2>
              </div>
              <form onSubmit={handleAddCohort} className="p-3.5 border-b border-slate-100 bg-slate-50/50 grid grid-cols-12 gap-2">
                <input required placeholder="QH-2026-Đợt 2" className="col-span-4" value={newCohort.code} onChange={(e) => setNewCohort({ ...newCohort, code: e.target.value })} />
                <input type="date" className="col-span-3" value={newCohort.start_date} onChange={(e) => setNewCohort({ ...newCohort, start_date: e.target.value })} />
                <select className="col-span-3" value={newCohort.regulation_version_id} onChange={(e) => setNewCohort({ ...newCohort, regulation_version_id: e.target.value })}>
                  <option value="">Quy chế</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}
                </select>
                <Button type="submit" size="sm" variant="primary" className="col-span-2">Thêm</Button>
              </form>
              <div className="divide-y divide-slate-100 text-xs max-h-[260px] overflow-y-auto">
                {cohorts.map((c) => (
                  <div key={c.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900 mr-2">{c.code}</span>
                      <span className="text-slate-400">{c.standard_months_master}/{c.max_months_master}th</span>
                    </div>
                    <Tag tone="info">{c.regulation_code || '3638'}</Tag>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: FACULTIES & MAJORS */}
      {tab === 'catalogs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">Khoa / Viện ({catalogs.faculties.length})</h2>
            </div>
            <form onSubmit={handleAddFaculty} className="p-3.5 border-b border-slate-100 grid grid-cols-12 gap-2 bg-slate-50/50">
              <input required placeholder="Mã (FIT)" className="col-span-3" value={newFac.code} onChange={(e) => setNewFac({ ...newFac, code: e.target.value })} />
              <input required placeholder="Tên Khoa / Viện" className="col-span-6" value={newFac.name} onChange={(e) => setNewFac({ ...newFac, name: e.target.value })} />
              <Button type="submit" size="sm" variant="primary" className="col-span-3">Thêm</Button>
            </form>
            <div className="divide-y divide-slate-100 text-xs">
              {catalogs.faculties.map((f) => (
                <div key={f.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                  <div className={f.active ? '' : 'opacity-50 line-through'}>
                    <span className="mono font-semibold text-[#034ea1] mr-2">{f.code}</span>
                    <span className="text-slate-800">{f.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/settings/faculties/${f.id}`, { method: 'PUT', body: JSON.stringify({ active: !f.active }) });
                      await onRefreshCatalogs();
                    }}
                    className="cursor-pointer"
                  >
                    <StatusDot tone={f.active ? 'success' : 'neutral'}>{f.active ? 'Bật' : 'Ẩn'}</StatusDot>
                  </button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">Ngành đào tạo ({catalogs.majors.length})</h2>
            </div>
            <form onSubmit={handleAddMajor} className="p-3.5 border-b border-slate-100 grid grid-cols-12 gap-2 bg-slate-50/50">
              <input required placeholder="Mã ngành" className="col-span-3" value={newMajor.code} onChange={(e) => setNewMajor({ ...newMajor, code: e.target.value })} />
              <input required placeholder="Tên ngành" className="col-span-4" value={newMajor.name} onChange={(e) => setNewMajor({ ...newMajor, name: e.target.value })} />
              <select required className="col-span-3" value={newMajor.faculty_id} onChange={(e) => setNewMajor({ ...newMajor, faculty_id: e.target.value })}>
                <option value="">Khoa</option>
                {catalogs.faculties.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
              </select>
              <Button type="submit" size="sm" variant="primary" className="col-span-2">Thêm</Button>
            </form>
            <div className="divide-y divide-slate-100 text-xs">
              {catalogs.majors.map((m) => (
                <div key={m.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                  <div className={m.active ? '' : 'opacity-50 line-through'}>
                    <span className="mono text-slate-500 mr-2">{m.code}</span>
                    <span className="text-slate-800 font-medium">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag tone="info">{m.faculty_code}</Tag>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/settings/majors/${m.id}`, { method: 'PUT', body: JSON.stringify({ active: !m.active }) });
                        await onRefreshCatalogs();
                      }}
                      className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-900"
                    >
                      {m.active ? 'Ẩn' : 'Bật'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: FEE RATES & PIT TAX */}
      {tab === 'fees' && (
        <Panel className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-end gap-4">
            <Field label="Thuế TNCN ngoài Trường (%)" className="w-48">
              <input type="number" step="0.5" value={pitRatePct} onChange={(e) => setPitRatePct(e.target.value)} />
            </Field>
            <Field label="Ngưỡng khấu trừ thuế (VNĐ)" className="w-56">
              <input type="number" step="100000" value={pitThreshold} onChange={(e) => setPitThreshold(e.target.value)} />
            </Field>
          </div>
          <table className="uet-table">
            <thead>
              <tr>
                <th className="px-5 py-2.5">Nhóm hoạt động</th>
                <th className="px-3 py-2.5">Vai trò / Mô tả</th>
                <th className="px-5 py-2.5 text-right">Đơn giá (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              {feeRates.map((fr, idx) => (
                <tr key={fr.id}>
                  <td className="px-5 py-2.5 mono text-xs text-slate-500">{fr.activity_type}</td>
                  <td className="px-3 py-2.5 text-xs font-medium text-slate-900">{fr.label}</td>
                  <td className="px-5 py-2 text-right">
                    <input
                      type="number"
                      step="50000"
                      className="!w-40 text-right mono ml-auto"
                      value={fr.unit_amount}
                      onChange={(e) => {
                        const next = [...feeRates];
                        next[idx] = { ...next[idx], unit_amount: Number(e.target.value) };
                        setFeeRates(next);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* TAB 4: USERS, EXPIRATION, SESSION REVOKE & AUTH EVENTS */}
      {tab === 'users' && (
        <div className="space-y-5">
          <Panel className="overflow-hidden">
            <form onSubmit={handleCreateUser} className="p-4 border-b border-slate-200 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
              <Field label="Email"><input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="ten@vnu.edu.vn" /></Field>
              <Field label="Họ tên"><input required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></Field>
              <Field label="Vai trò">
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="admin">Quản trị / CTSV</option>
                  <option value="supervisor">CBHD</option>
                </select>
              </Field>
              <Field label="Hồ sơ CBHD">
                <select value={newUser.scientist_id} onChange={(e) => setNewUser({ ...newUser, scientist_id: e.target.value })}>
                  <option value="">Không liên kết</option>
                  {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name}</option>)}
                </select>
              </Field>
              <Field label="Hạn truy cập (tùy chọn)">
                <input type="date" value={newUser.expires_at} onChange={(e) => setNewUser({ ...newUser, expires_at: e.target.value })} />
              </Field>
              <Button type="submit" variant="primary">Thêm</Button>
            </form>
            <div className="overflow-x-auto">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-5 py-2.5">Email</th>
                    <th className="px-3 py-2.5">Họ tên</th>
                    <th className="px-3 py-2.5">Vai trò</th>
                    <th className="px-3 py-2.5">Hết hạn</th>
                    <th className="px-3 py-2.5">Trạng thái</th>
                    <th className="px-5 py-2.5 text-right">Phiên</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-2.5 mono text-xs">{u.email}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{u.name}</td>
                      <td className="px-3 py-2.5"><Tag tone={u.role === 'admin' || u.role === 'staff' ? 'info' : 'neutral'}>{u.role === 'staff' ? 'CTSV (Admin)' : u.role}</Tag></td>
                      <td className="px-3 py-2.5 mono text-xs text-slate-500">{u.expires_at ? formatDateVN(u.expires_at) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => handleToggleUserActive(u)} className="cursor-pointer">
                          <StatusDot tone={u.active ? 'success' : 'error'}>{u.active ? 'Hoạt động' : 'Đã khóa'}</StatusDot>
                        </button>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Button size="sm" variant="ghost" leadingIcon={<LogOut size={12} />} onClick={() => handleRevokeSessions(u)} title="Thu hồi mọi phiên đăng nhập">
                          Thu hồi
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
              Nhật ký đăng nhập gần đây
            </div>
            <div className="overflow-x-auto max-h-[260px]">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-5 py-2">Thời điểm</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Sự kiện</th>
                    <th className="px-5 py-2">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {authEvents.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-xs text-slate-400">Chưa có bản ghi.</td></tr>
                  ) : (
                    authEvents.map((e) => (
                      <tr key={e.id}>
                        <td className="px-5 py-2 mono text-[11px] text-slate-400 whitespace-nowrap">{formatDateTimeVN(e.created_at)}</td>
                        <td className="px-3 py-2 mono text-xs text-slate-700">{e.email}</td>
                        <td className="px-3 py-2">
                          <Tag tone={e.event_type === 'login_success' ? 'success' : e.event_type === 'login_denied' ? 'error' : 'warning'}>
                            {e.event_type}
                          </Tag>
                        </td>
                        <td className="px-5 py-2 text-xs text-slate-600">{e.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 5: EMAIL TEMPLATES */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <Panel className="lg:col-span-4 divide-y divide-slate-100 overflow-hidden">
            {templates.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setSelectedTpl(t)}
                className={`w-full px-4 py-3 text-left text-xs cursor-pointer ${
                  selectedTpl?.code === t.code ? 'bg-[#eff5fc]/80' : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-slate-900">{t.name}</div>
                <div className="mono text-[11px] text-slate-400 mt-0.5">{t.code}</div>
              </button>
            ))}
          </Panel>

          <Panel className="lg:col-span-8 p-5 space-y-4">
            {selectedTpl ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-900">{selectedTpl.name}</h3>
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<Send size={12} />}
                    onClick={async () => {
                      const res = await apiFetch(`/api/settings/email-templates/${selectedTpl.code}/test`, { method: 'POST' });
                      toast.success(`Đã gửi bản thử tới ${res.sentTo}.`);
                    }}
                  >
                    Gửi thử cho tôi
                  </Button>
                </div>
                <Field label="Tiêu đề (biến: {{full_name}}, {{phd_code}}, {{deadline}}, {{days_label}})">
                  <input
                    value={selectedTpl.subject_template}
                    onChange={(e) => setSelectedTpl({ ...selectedTpl, subject_template: e.target.value })}
                  />
                </Field>
                <Field label="Nội dung">
                  <textarea
                    rows={5}
                    value={selectedTpl.body_template}
                    onChange={(e) => setSelectedTpl({ ...selectedTpl, body_template: e.target.value })}
                  />
                </Field>
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedTpl.active)}
                      onChange={(e) => setSelectedTpl({ ...selectedTpl, active: e.target.checked ? 1 : 0 })}
                    />
                    Kích hoạt mẫu này
                  </label>
                  <Button
                    variant="primary"
                    leadingIcon={<Save size={13} />}
                    onClick={async () => {
                      await apiFetch(`/api/settings/email-templates/${selectedTpl.code}`, {
                        method: 'PUT',
                        body: JSON.stringify(selectedTpl),
                      });
                      const d = await apiFetch<{ items: EmailTemplateItem[] }>('/api/settings/email-templates');
                      setTemplates(d.items || []);
                      toast.success('Đã lưu mẫu email.');
                    }}
                  >
                    Lưu mẫu
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400">Chọn một mẫu email bên trái.</div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 6: SYSTEM HEALTH, MAINTENANCE, BACKUP, AUDIT DIFF & SECRET LOGS */}
      {tab === 'system' && (
        <div className="space-y-5">
          {/* System Health KPIs */}
          {sysHealth && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
                <div className="text-xs text-slate-500">CSDL ({sysHealth.dbProvider.toUpperCase()})</div>
                <div className="mt-1.5 font-display text-xl font-semibold text-emerald-700 tabular">{sysHealth.dbLatencyMs} ms</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
                <div className="text-xs text-slate-500">Kho tệp ({sysHealth.r2Bucket})</div>
                <div className="mt-1.5 font-display text-xl font-semibold text-slate-900 tabular">
                  {sysHealth.counts.documents} tệp
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
                <div className="text-xs text-slate-500">Email hôm nay</div>
                <div className="mt-1.5 font-display text-xl font-semibold text-[#034ea1] tabular">
                  {sysHealth.emailSentToday} / {sysHealth.emailDailyCap}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5">
                <div className="text-xs text-slate-500">Bản sao lưu R2</div>
                <div className="mt-1.5 font-display text-xl font-semibold text-slate-900 tabular">{sysHealth.counts.backups} bản</div>
              </div>
            </div>
          )}

          {/* Maintenance Mode + Banner + Backups */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel className="p-5 space-y-3.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">Bảo trì & Thông báo toàn hệ thống</h2>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bannerForm.maintenanceMode}
                  onChange={(e) => setBannerForm({ ...bannerForm, maintenanceMode: e.target.checked })}
                />
                <ShieldAlert size={14} className="text-amber-700" />
                Bật chế độ Bảo trì (chỉ Quản trị viên truy cập)
              </label>
              <Field label="Thông báo khi bảo trì">
                <input value={bannerForm.maintenanceMessage} onChange={(e) => setBannerForm({ ...bannerForm, maintenanceMessage: e.target.value })} />
              </Field>
              <Field label="Banner ghim đầu trang (để trống để tắt)">
                <input value={bannerForm.bannerText} onChange={(e) => setBannerForm({ ...bannerForm, bannerText: e.target.value })} placeholder="VD: Hạn nộp báo cáo tiến độ HK1 là 30/12/2026" />
              </Field>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await apiFetch('/api/system/maintenance', { method: 'PUT', body: JSON.stringify(bannerForm) });
                  await onRefreshCatalogs();
                  toast.success('Đã cập nhật trạng thái hệ thống.');
                }}
              >
                Lưu trạng thái
              </Button>
            </Panel>

            <Panel className="p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-slate-900">Sao lưu D1 → R2 & Dọn tệp mồ côi</h2>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await apiFetch('/api/system/r2-orphans');
                      setOrphanScan(res);
                      toast.info(`Tìm thấy ${res.orphanCount} tệp mồ côi.`);
                    }}
                  >
                    Quét R2
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    leadingIcon={<Database size={13} />}
                    onClick={async () => {
                      const snap = await apiFetch('/api/system/backups', { method: 'POST' });
                      toast.success(`Đã sao lưu (${(snap.size / 1024).toFixed(1)} KB).`);
                      await loadSystemTab();
                    }}
                  >
                    Sao lưu ngay
                  </Button>
                </div>
              </div>

              {orphanScan && (
                <div className="px-3 py-2 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2">
                  <span>
                    Tổng {orphanScan.totalObjects} tệp · <strong>{orphanScan.orphanCount}</strong> tệp mồ côi ({(orphanScan.orphanBytes / 1024).toFixed(1)} KB)
                  </span>
                  {orphanScan.orphanCount > 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      leadingIcon={<Trash2 size={12} />}
                      onClick={async () => {
                        const res = await apiFetch('/api/system/r2-orphans/cleanup', {
                          method: 'POST',
                          body: JSON.stringify({ keys: orphanScan.orphans.map((o: any) => o.key) }),
                        });
                        toast.success(`Đã dọn ${res.deleted} tệp mồ côi.`);
                        setOrphanScan(null);
                      }}
                    >
                      Dọn sạch
                    </Button>
                  )}
                </div>
              )}

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-[180px] overflow-y-auto text-xs">
                {backups.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">Chưa có bản sao lưu nào.</div>
                ) : (
                  backups.map((b) => (
                    <div key={b.key} className="px-3.5 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mono text-[11px] font-medium text-slate-800 truncate">{b.key.replace('system-backups/', '')}</div>
                        <div className="text-[11px] text-slate-400">{(b.size / 1024).toFixed(1)} KB · {b.provider.toUpperCase()}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Download size={12} />}
                        onClick={() => downloadBlob(`/api/system/backups/download?key=${encodeURIComponent(b.key)}`, b.key.split('/').pop() || 'backup.json.gz')}
                      >
                        Tải
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>

          {/* Audit Logs with Search & Diff Drawer */}
          <Panel className="overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-900">Nhật ký Kiểm toán (bấm dòng xem Diff)</h2>
              <div className="flex items-center gap-2">
                <input
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Lọc email, hành động..."
                  className="!w-56 !h-8 !text-xs"
                />
                <Button size="sm" variant="secondary" leadingIcon={<RefreshCw size={12} />} onClick={loadSystemTab}>
                  Tải lại
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[320px]">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-5 py-2">Thời gian</th>
                    <th className="px-3 py-2">Tài khoản</th>
                    <th className="px-3 py-2">Hành động</th>
                    <th className="px-5 py-2">Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((l) => (
                    <tr key={l.id} onClick={() => setAuditDiff(l)} className="cursor-pointer">
                      <td className="px-5 py-2 mono text-[11px] text-slate-400 whitespace-nowrap">{formatDateTimeVN(l.created_at)}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{l.actor_email}</td>
                      <td className="px-3 py-2"><Tag>{l.action}</Tag></td>
                      <td className="px-5 py-2 text-xs text-slate-800">{l.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Secret Access Logs */}
          <Panel className="overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
              Nhật ký Truy cập Dữ liệu Mật (PBĐL & CCCD/MST/STK)
            </div>
            <div className="overflow-x-auto max-h-[240px]">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-5 py-2">Thời gian</th>
                    <th className="px-3 py-2">Người truy cập</th>
                    <th className="px-3 py-2">Loại dữ liệu</th>
                    <th className="px-5 py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {secretLogs.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-xs text-slate-400">Chưa có lượt truy cập dữ liệu mật nào.</td></tr>
                  ) : (
                    secretLogs.map((s) => (
                      <tr key={s.id}>
                        <td className="px-5 py-2 mono text-[11px] text-slate-400 whitespace-nowrap">{formatDateTimeVN(s.created_at)}</td>
                        <td className="px-3 py-2 text-xs text-slate-700">{s.actor_email}</td>
                        <td className="px-3 py-2"><Tag tone="warning">{s.resource_type}</Tag></td>
                        <td className="px-5 py-2 text-xs text-slate-800">{s.action}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* Audit Diff Slide-over Drawer */}
      <Drawer
        open={Boolean(auditDiff)}
        onOpenChange={(o) => !o && setAuditDiff(null)}
        title={`Chi tiết Audit #${auditDiff?.id || ''}`}
        subtitle={auditDiff ? `${auditDiff.actor_email} · ${formatDateTimeVN(auditDiff.created_at)}` : undefined}
      >
        {auditDiff && (
          <div className="space-y-4 text-xs">
            <div className="font-medium text-slate-900">{auditDiff.summary}</div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">Trước thay đổi (Before)</div>
              <pre className="p-3 rounded-md bg-slate-50 border border-slate-200 mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                {auditDiff.before_json ? JSON.stringify(JSON.parse(auditDiff.before_json), null, 2) : '—'}
              </pre>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">Sau thay đổi (After)</div>
              <pre className="p-3 rounded-md bg-[#eff5fc]/50 border border-[#d2e4f8] mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                {auditDiff.after_json ? JSON.stringify(JSON.parse(auditDiff.after_json), null, 2) : '—'}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
