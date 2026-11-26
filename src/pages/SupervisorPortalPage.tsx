import { ArrowUpRight, FileText, Save, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AUTHOR_ROLE_LABELS,
  calculatePublicationPoint,
  DEFAULT_REGULATION_3638_CONFIG,
  PUBLICATION_TYPE_LABELS,
  STUDY_STATUS_LABELS,
  SUPERVISION_ROLE_LABELS,
} from '../../shared/regulation3638';
import type { AuthUser, AuthorRole, PublicationType, StudyStatus, SupervisionRole } from '../../shared/types';
import type { AppCatalogs } from '../App';
import { apiFetch, downloadBlob } from '../shared/api';
import { Button, ConfirmDialog, Field, PageTop, Panel, StatusDot, Tag } from '../shared/ui';

export function SupervisorPortalPage({ user: _user, catalogs }: { user: AuthUser; catalogs: AppCatalogs }) {
  const navigate = useNavigate();
  const regConfig = catalogs.regulationConfig || DEFAULT_REGULATION_3638_CONFIG;
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState<any>(null);
  const [pubForm, setPubForm] = useState({
    title: '',
    venue: '',
    pub_year: String(new Date().getFullYear()),
    pub_type: 'wos_q1' as PublicationType,
    author_role: 'corresponding' as AuthorRole,
    hdgsnn_max_point: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/scientists/me');
      setMe(data);
      setProfileForm({
        specialization: data.specialization || '',
        work_unit: data.work_unit || '',
        phone: data.phone || '',
        bank_account: data.bank_account || '',
        bank_name: data.bank_name || '',
        cccd: data.cccd || '',
        tax_code: data.tax_code || '',
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiFetch(`/api/scientists/${me.id}`, {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      });
      setMe(updated);
      toast.success('Đã lưu hồ sơ.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddPub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiFetch(`/api/scientists/${me.id}/publications`, {
        method: 'POST',
        body: JSON.stringify({
          ...pubForm,
          pub_year: Number(pubForm.pub_year),
          hdgsnn_max_point: pubForm.hdgsnn_max_point === '' ? null : Number(pubForm.hdgsnn_max_point),
        }),
      });
      setMe(updated);
      setPubForm({ ...pubForm, title: '', venue: '', hdgsnn_max_point: '' });
      toast.success('Đã thêm công bố.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading || !me) {
    return <div className="py-12 text-center text-xs text-slate-400">Đang tải...</div>;
  }

  const q = me.quotaEvaluation;
  const r = me.researchEvaluation;
  const previewPt = calculatePublicationPoint(
    {
      pubType: pubForm.pub_type,
      authorRole: pubForm.author_role,
      hdgsnnMaxPoint: pubForm.hdgsnn_max_point === '' ? null : Number(pubForm.hdgsnn_max_point),
    },
    regConfig
  );

  return (
    <div className="space-y-6">
      <PageTop
        title={`${me.title_display} ${me.full_name}`}
        meta={me.work_unit || undefined}
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<FileText size={14} />}
              onClick={() => downloadBlob(`/api/forms/scientist/${me.id}/cv-5y`, `UET_LLKH_5Nam_${me.id}.docx`).then(() => toast.success('Đã xuất Lý lịch khoa học 5 năm (.docx).'))}
            >
              Lý lịch KH 5 năm (.docx)
            </Button>
            {q.eligibleForSpecialRequest && !q.isSpecialApproved && (
              <Button variant="primary" leadingIcon={<Sparkles size={14} />} onClick={() => navigate('/requests?new=special_quota')}>
                Đề nghị tăng định mức
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Quota hướng dẫn</div>
          <div className="mt-2 flex items-baseline gap-2 tabular">
            <span className="font-display text-2xl font-semibold text-slate-900">{q.equivalentLoad}</span>
            <span className="text-xs text-slate-400">/ {q.effectiveQuota} NCS</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Giờ chuẩn hướng dẫn</div>
          <div className="mt-2 font-display text-2xl font-semibold text-[#034ea1] tabular">{q.standardHours}g</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Điểm 3638 ({r.fromYear}–{r.toYear})</div>
          <div className="mt-2 flex items-baseline gap-2 tabular">
            <span className="font-display text-2xl font-semibold text-emerald-700">{r.totalPoints}đ</span>
            <span className="text-xs text-slate-400">{r.wosScopusInWindow} WoS</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Trạng thái định mức</div>
          <div className="mt-2.5 text-xs font-semibold text-slate-800">
            {q.isSpecialApproved
              ? `Tăng trần: ${q.effectiveQuota} NCS`
              : q.eligibleForSpecialRequest
                ? 'Đủ ĐK xin tăng trần'
                : 'Định mức chuẩn'}
          </div>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            NCS hướng dẫn ({me.supervisions?.length || 0})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="uet-table">
            <thead>
              <tr>
                <th className="px-5 py-2.5">Nghiên cứu sinh</th>
                <th className="px-3 py-2.5">Vai trò</th>
                <th className="px-3 py-2.5">Đề tài</th>
                <th className="px-3 py-2.5">Tình trạng</th>
                <th className="px-5 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {(me.supervisions || []).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-slate-400">Chưa có NCS.</td></tr>
              ) : (
                me.supervisions.map((s: any) => (
                  <tr key={s.id} onClick={() => navigate(`/ncs/${s.phd_student_id}`)} className="cursor-pointer">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{s.phd_name}</div>
                      <div className="mono text-[11px] text-[#034ea1]">{s.phd_code}</div>
                    </td>
                    <td className="px-3 py-3"><Tag tone="info">{SUPERVISION_ROLE_LABELS[s.role as SupervisionRole] || s.role}</Tag></td>
                    <td className="px-3 py-3 text-xs text-slate-700 max-w-[340px] truncate">{s.dissertation_title || '—'}</td>
                    <td className="px-3 py-3">
                      <StatusDot tone={s.study_status === 'graduated' ? 'success' : 'info'}>
                        {STUDY_STATUS_LABELS[s.study_status as StudyStatus] || s.study_status}
                      </StatusDot>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/ncs/${s.phd_student_id}`); }}>
                        <ArrowUpRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <Panel className="lg:col-span-7 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">Công bố cá nhân ({me.publications?.length || 0})</h2>
            <span className="mono text-xs font-semibold text-[#034ea1]">+{previewPt}đ</span>
          </div>
          <form onSubmit={handleAddPub} className="p-4 border-b border-slate-200 bg-slate-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input required className="sm:col-span-2" placeholder="Tên bài báo..." value={pubForm.title} onChange={(e) => setPubForm({ ...pubForm, title: e.target.value })} />
              <input required type="number" placeholder="Năm" value={pubForm.pub_year} onChange={(e) => setPubForm({ ...pubForm, pub_year: e.target.value })} />
              <select value={pubForm.pub_type} onChange={(e) => setPubForm({ ...pubForm, pub_type: e.target.value as PublicationType })}>
                {Object.entries(PUBLICATION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={pubForm.author_role} onChange={(e) => setPubForm({ ...pubForm, author_role: e.target.value as AuthorRole })}>
                {Object.entries(AUTHOR_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Button type="submit" size="sm" variant="primary">Thêm bài</Button>
            </div>
          </form>
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto text-xs">
            {(me.publications || []).map((p: any) => (
              <div key={p.id} className="px-5 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{p.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    <span className="mono">{p.pub_year}</span> · {p.venue || '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="mono font-semibold text-[#034ea1]">{p.calculated_point}đ</span>
                  <button type="button" onClick={() => setDeleteTarget({ id: p.id, title: p.title })} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="lg:col-span-5 p-5 space-y-3.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">Hồ sơ & Thanh toán</h2>
          {profileForm && (
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <Field label="Đơn vị công tác">
                <input value={profileForm.work_unit} onChange={(e) => setProfileForm({ ...profileForm, work_unit: e.target.value })} />
              </Field>
              <Field label="Chuyên ngành">
                <input value={profileForm.specialization} onChange={(e) => setProfileForm({ ...profileForm, specialization: e.target.value })} />
              </Field>
              <Field label="Điện thoại">
                <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Số CCCD"><input value={profileForm.cccd} onChange={(e) => setProfileForm({ ...profileForm, cccd: e.target.value })} /></Field>
                <Field label="Mã số thuế"><input value={profileForm.tax_code} onChange={(e) => setProfileForm({ ...profileForm, tax_code: e.target.value })} /></Field>
                <Field label="Số tài khoản"><input value={profileForm.bank_account} onChange={(e) => setProfileForm({ ...profileForm, bank_account: e.target.value })} /></Field>
                <Field label="Ngân hàng"><input value={profileForm.bank_name} onChange={(e) => setProfileForm({ ...profileForm, bank_name: e.target.value })} /></Field>
              </div>
              <Button type="submit" variant="primary" leadingIcon={<Save size={13} />} className="w-full">
                Lưu thông tin
              </Button>
            </form>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Xóa công bố"
        description={`Xóa "${deleteTarget?.title || ''}"?`}
        danger
        confirmLabel="Xóa"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const updated = await apiFetch(`/api/scientists/${me.id}/publications/${deleteTarget.id}`, { method: 'DELETE' });
          setMe(updated);
          toast.success('Đã xóa công bố.');
        }}
      />
    </div>
  );
}
