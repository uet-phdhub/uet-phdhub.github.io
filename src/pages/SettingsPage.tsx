import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_REGULATION_3638_CONFIG, PUBLICATION_TYPE_LABELS } from '../../shared/regulation3638';
import type { PublicationType, Regulation3638Config } from '../../shared/types';
import type { AppCatalogs } from '../App';
import { apiFetch } from '../shared/api';
import { formatDateTimeVN } from '../shared/format';
import { Button, Field, PageTop, Panel, StatusDot, Tag, UnderlineTabs } from '../shared/ui';

type SettingsTab = 'regulation' | 'catalogs' | 'users' | 'audit';

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

  const [newFac, setNewFac] = useState({ code: '', name: '', short_name: '' });
  const [newMajor, setNewMajor] = useState({ code: '', name: '', faculty_id: '' });

  const [users, setUsers] = useState<any[]>([]);
  const [scientists, setScientists] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'staff', scientist_id: '' });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    if (catalogs.regulationConfig) setCfg(catalogs.regulationConfig);
  }, [catalogs.regulationConfig]);

  useEffect(() => {
    if (tab === 'users') {
      apiFetch<{ items: any[] }>('/api/settings/users').then((d) => setUsers(d.items || [])).catch(() => {});
      apiFetch<{ items: any[] }>('/api/scientists?listType=all').then((d) => setScientists(d.items || [])).catch(() => {});
    } else if (tab === 'audit') {
      apiFetch<{ items: any[] }>('/api/settings/audit-logs').then((d) => setAuditLogs(d.items || [])).catch(() => {});
    }
  }, [tab]);

  const handleSaveRegulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/settings/regulation-3638', { method: 'PUT', body: JSON.stringify(cfg) });
      await onRefreshCatalogs();
      toast.success('Đã lưu cấu hình Quy chế 3638.');
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
        body: JSON.stringify({ ...newUser, scientist_id: newUser.scientist_id ? Number(newUser.scientist_id) : null }),
      });
      setNewUser({ email: '', name: '', role: 'staff', scientist_id: '' });
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

  return (
    <div className="space-y-5">
      <PageTop
        title="Cài đặt Quy chế 3638"
        actions={
          tab === 'regulation' ? (
            <Button type="submit" form="reg-3638-form" variant="primary" leadingIcon={<Save size={14} />} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
          ) : null
        }
      />

      <UnderlineTabs<SettingsTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'regulation', label: 'Điểm 3638 & Quota' },
          { value: 'catalogs', label: 'Khoa & Ngành' },
          { value: 'users', label: 'Tài khoản' },
          { value: 'audit', label: 'Nhật ký' },
        ]}
      />

      {tab === 'regulation' && (
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
      )}

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
                <div key={f.id} className="px-5 py-2.5 flex items-center justify-between">
                  <div>
                    <span className="mono font-semibold text-[#034ea1] mr-2">{f.code}</span>
                    <span className="text-slate-800">{f.name}</span>
                  </div>
                  <span className="text-slate-400">{f.short_name || f.code}</span>
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
                <div key={m.id} className="px-5 py-2.5 flex items-center justify-between">
                  <div>
                    <span className="mono text-slate-500 mr-2">{m.code}</span>
                    <span className="text-slate-800 font-medium">{m.name}</span>
                  </div>
                  <Tag tone="info">{m.faculty_code}</Tag>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'users' && (
        <Panel className="overflow-hidden">
          <form onSubmit={handleCreateUser} className="p-4 border-b border-slate-200 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
            <Field label="Email"><input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="ten@vnu.edu.vn" /></Field>
            <Field label="Họ tên"><input required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></Field>
            <Field label="Vai trò">
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="staff">Chuyên viên CTSV</option>
                <option value="admin">Admin CTSV</option>
                <option value="supervisor">CBHD</option>
              </select>
            </Field>
            <Field label="Hồ sơ CBHD">
              <select value={newUser.scientist_id} onChange={(e) => setNewUser({ ...newUser, scientist_id: e.target.value })}>
                <option value="">Không liên kết</option>
                {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name}</option>)}
              </select>
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
                  <th className="px-3 py-2.5">Liên kết</th>
                  <th className="px-5 py-2.5 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-2.5 mono text-xs">{u.email}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{u.name}</td>
                    <td className="px-3 py-2.5"><Tag tone={u.role === 'admin' ? 'error' : u.role === 'staff' ? 'info' : 'neutral'}>{u.role}</Tag></td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{u.scientist_name || u.phd_code || '—'}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button type="button" onClick={() => handleToggleUserActive(u)} className="cursor-pointer">
                        <StatusDot tone={u.active ? 'success' : 'error'}>{u.active ? 'Hoạt động' : 'Đã khóa'}</StatusDot>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === 'audit' && (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="uet-table">
              <thead>
                <tr>
                  <th className="px-5 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5">Tài khoản</th>
                  <th className="px-3 py-2.5">Hành động</th>
                  <th className="px-5 py-2.5">Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2.5 mono text-[11px] text-slate-500 whitespace-nowrap">{formatDateTimeVN(l.created_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">{l.actor_email}</td>
                    <td className="px-3 py-2.5"><Tag>{l.action}</Tag></td>
                    <td className="px-5 py-2.5 text-xs text-slate-800">{l.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
