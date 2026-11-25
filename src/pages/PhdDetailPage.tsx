import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Lock,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AUTHOR_ROLE_LABELS,
  calculatePublicationPoint,
  COMMITTEE_MEMBER_ROLE_LABELS,
  DEFAULT_REGULATION_3638_CONFIG,
  PUBLICATION_TYPE_LABELS,
  STUDY_STATUS_LABELS,
  SUPERVISION_ROLE_LABELS,
} from '../../shared/regulation3638';
import type {
  AuthUser,
  AuthorRole,
  CompletedCourseItem,
  DoctoralSeminarItem,
  PublicationType,
  StudyStatus,
  SupervisionRole,
  TrainingChangeItem,
} from '../../shared/types';
import type { AppCatalogs } from '../App';
import { apiFetch, getDocumentViewUrl } from '../shared/api';
import { computePhdLifecycleStage, copyValue, formatDateVN, PHD_LIFECYCLE_STAGES } from '../shared/format';
import {
  Button,
  ConfirmDialog,
  Field,
  Panel,
  StatusDot,
  Tag,
  UnderlineTabs,
  type StatusTone,
} from '../shared/ui';

type DetailTab =
  | 'general'
  | 'deadlines_courses'
  | 'topic_supervisors'
  | 'progress_pubs'
  | 'seminar_defense'
  | 'independent_review'
  | 'diploma_docs';

const DOC_CATEGORIES: Record<string, string> = {
  admission_decision: 'QĐ Công nhận NCS',
  topic_decision: 'QĐ Giao đề tài & CBHD',
  progress_report: 'Báo cáo tiến độ',
  publication_evidence: 'Minh chứng công bố (Bài báo/NCKH)',
  seminar_decision: 'Hồ sơ / QĐ Seminar tổng thể',
  ir_document: 'Tài liệu Phản biện độc lập (Mật)',
  defense_decision: 'QĐ & Hồ sơ HĐ Đánh giá LATS',
  dossier_evidence: 'Minh chứng hoàn thiện hồ sơ sau BV',
  diploma: 'QĐ Cấp bằng / Bằng Tiến sĩ',
  other: 'Minh chứng khác',
};

function deadlineTone(level?: string): StatusTone {
  if (level === 'overdue') return 'error';
  if (level === 'urgent') return 'warning';
  if (level === 'warning') return 'info';
  if (level === 'completed' || level === 'safe') return 'success';
  return 'neutral';
}

function SectionBlock({
  title,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-slate-900">{title}</h3>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function PhdDetailPage({ user, catalogs }: { user: AuthUser; catalogs: AppCatalogs }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isStaff = user.role === 'admin' || user.role === 'staff';
  const isOwnerPhd = user.role === 'phd_student' && Number(user.phd_student_id) === Number(id);
  const regConfig = catalogs.regulationConfig || DEFAULT_REGULATION_3638_CONFIG;

  const [tab, setTab] = useState<DetailTab>('general');
  const [phd, setPhd] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [scientists, setScientists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Confirm delete state (replaces browser confirm)
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  }>({ open: false, title: '', description: '', action: async () => {} });

  // Sub-forms
  const [newCourse, setNewCourse] = useState<CompletedCourseItem>({ code: '', name: '', credits: 3, grade: '', term: '' });
  const [newSeminar, setNewSeminar] = useState<DoctoralSeminarItem>({ title: '', kind: 'chuyen_de', credits: 2, completedDate: '', scoreOrResult: '' });
  const [newChange, setNewChange] = useState<TrainingChangeItem>({ date: new Date().toISOString().slice(0, 10), changeType: '', decisionNo: '', description: '' });

  const [supRows, setSupRows] = useState<Array<{ scientist_id: number; role: SupervisionRole; decision_no: string; assigned_date: string }>>([]);
  const [semMembers, setSemMembers] = useState<Array<{ scientist_id: number; member_role: string }>>([]);
  const [defMembers, setDefMembers] = useState<Array<{ scientist_id: number; member_role: string }>>([]);

  const [pubForm, setPubForm] = useState({
    title: '',
    authors: '',
    venue: '',
    pub_year: String(new Date().getFullYear()),
    item_kind: 'article',
    pub_type: 'wos_q1' as PublicationType,
    author_role: 'first' as AuthorRole,
    hdgsnn_max_point: '',
    doi_url: '',
  });

  const [reportForm, setReportForm] = useState({
    academic_term: 'HK1 2026-2027',
    report_date: new Date().toISOString().slice(0, 10),
    thesis_progress_percent: 50,
    summary: '',
    next_plan: '',
    evidence_url: '',
  });
  const [reviewCommentById, setReviewCommentById] = useState<Record<number, string>>({});

  const [docCategory, setDocCategory] = useState('dossier_evidence');
  const [docTitle, setDocTitle] = useState('');
  const [docConfidential, setDocConfidential] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const patchForm = (patch: Record<string, any>) => {
    setForm((prev: any) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const hydrateFromDetail = (detail: any) => {
    setPhd(detail);
    setForm({
      ...detail,
      faculty_id: detail.faculty_id ? String(detail.faculty_id) : '',
      major_id: detail.major_id ? String(detail.major_id) : '',
      graduation_year: detail.graduation_year ? String(detail.graduation_year) : '',
      ir1_scientist_id: detail.ir1_scientist_id ? String(detail.ir1_scientist_id) : '',
      ir2_scientist_id: detail.ir2_scientist_id ? String(detail.ir2_scientist_id) : '',
      ir3_scientist_id: detail.ir3_scientist_id ? String(detail.ir3_scientist_id) : '',
      completed_courses: detail.completed_courses || [],
      training_changes: detail.training_changes || [],
      doctoral_seminars: detail.doctoral_seminars || [],
    });
    setDirty(false);
    setSupRows(
      (detail.supervisions || []).map((s: any) => ({
        scientist_id: Number(s.scientist_id),
        role: s.role as SupervisionRole,
        decision_no: s.decision_no || '',
        assigned_date: s.assigned_date || '',
      }))
    );
    setSemMembers((detail.seminar_members || []).map((m: any) => ({ scientist_id: Number(m.scientist_id), member_role: m.member_role || 'member' })));
    setDefMembers((detail.defense_members || []).map((m: any) => ({ scientist_id: Number(m.scientist_id), member_role: m.member_role || 'member' })));
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await apiFetch(`/api/phd-students/${id}`);
      hydrateFromDetail(detail);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
    if (isStaff) {
      apiFetch<{ items: any[] }>('/api/scientists?listType=all')
        .then((d) => setScientists(d.items || []))
        .catch(() => {});
    }
  }, [loadData, isStaff]);

  const handleSaveProfile = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/api/phd-students/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, expectedRevision: phd.revision }),
      });
      hydrateFromDetail(updated);
      toast.success('Đã lưu toàn bộ thay đổi hồ sơ NCS.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSupervisions = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch(`/api/phd-students/${id}/supervisions`, {
        method: 'PUT',
        body: JSON.stringify({ supervisions: supRows.filter((r) => r.scientist_id > 0) }),
      });
      setPhd(updated);
      toast.success('Đã lưu phân công Cán bộ hướng dẫn.');
      if (updated.quotaWarnings?.length) {
        toast.warning(updated.quotaWarnings.join(' '));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCommittee = async (committeeType: 'seminar' | 'defense') => {
    setSaving(true);
    try {
      const members = (committeeType === 'seminar' ? semMembers : defMembers).filter((m) => m.scientist_id > 0);
      const updated = await apiFetch(`/api/phd-students/${id}/committees`, {
        method: 'PUT',
        body: JSON.stringify({
          committee_type: committeeType,
          members: members.map((m) => ({
            ...m,
            decision_no: committeeType === 'seminar' ? form.seminar_decision_no : form.defense_council_decision_no,
            event_date: committeeType === 'seminar' ? form.seminar_date : form.defense_date,
          })),
        }),
      });
      setPhd(updated);
      toast.success(`Đã lưu danh sách thành viên ${committeeType === 'seminar' ? 'HĐ Seminar' : 'HĐ Đánh giá LATS'}.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiFetch(`/api/phd-students/${id}/publications`, {
        method: 'POST',
        body: JSON.stringify({
          ...pubForm,
          pub_year: Number(pubForm.pub_year),
          hdgsnn_max_point: pubForm.hdgsnn_max_point === '' ? null : Number(pubForm.hdgsnn_max_point),
        }),
      });
      setPhd(updated);
      setPubForm({ ...pubForm, title: '', venue: '', doi_url: '', hdgsnn_max_point: '' });
      toast.success('Đã thêm công bố và cập nhật điểm Quy chế 3638.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleVerifyPub = async (pub: any) => {
    try {
      const updated = await apiFetch(`/api/phd-students/${id}/publications/${pub.id}`, {
        method: 'PUT',
        body: JSON.stringify({ verified: !pub.verified }),
      });
      setPhd(updated);
      toast.success(!pub.verified ? 'Đã xác minh công bố.' : 'Đã chuyển công bố về trạng thái chờ xác minh.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSubmitProgressReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiFetch(`/api/phd-students/${id}/progress-reports`, {
        method: 'POST',
        body: JSON.stringify(reportForm),
      });
      setPhd(updated);
      setForm((prev: any) => ({
        ...prev,
        thesis_progress_by_term: updated.thesis_progress_by_term,
        progress_report_summary: updated.progress_report_summary,
      }));
      setReportForm({ ...reportForm, summary: '', next_plan: '' });
      toast.success('Đã nộp báo cáo tiến độ và thông báo tới CBHD.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReviewProgressReport = async (reportId: number, status: 'approved' | 'needs_revision') => {
    try {
      const updated = await apiFetch(`/api/phd-students/${id}/progress-reports/${reportId}/review`, {
        method: 'PUT',
        body: JSON.stringify({
          supervisor_status: status,
          supervisor_comment: reviewCommentById[reportId] || '',
        }),
      });
      setPhd(updated);
      toast.success(status === 'approved' ? 'Đã duyệt báo cáo tiến độ.' : 'Đã gửi yêu cầu bổ sung báo cáo.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const params = new URLSearchParams({
        entityType: 'phd_student',
        entityId: String(id),
        category: docCategory,
        title: docTitle || file.name,
        confidential: docConfidential || docCategory === 'ir_document' ? '1' : '0',
      });
      await apiFetch(`/api/documents/upload?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      setDocTitle('');
      await loadData();
      toast.success(`Đã tải lên "${file.name}".`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleAddDriveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;
    setUploadingDoc(true);
    try {
      await apiFetch('/api/documents/link', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'phd_student',
          entity_id: Number(id),
          category: docCategory,
          title: docTitle || 'Minh chứng Google Drive',
          drive_url: driveUrl.trim(),
          is_confidential: docConfidential || docCategory === 'ir_document',
        }),
      });
      setDocTitle('');
      setDriveUrl('');
      await loadData();
      toast.success('Đã gắn liên kết minh chứng.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-xs text-slate-500">Đang tải hồ sơ nghiên cứu sinh...</div>;
  }
  if (!phd || !form) {
    return <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">Không tìm thấy hồ sơ NCS.</div>;
  }

  const isAssignedSupervisor = Boolean(
    user.scientist_id && (phd.supervisions || []).some((s: any) => Number(s.scientist_id) === Number(user.scientist_id))
  );
  const currentStage = computePhdLifecycleStage(phd);
  const previewPubPoint = calculatePublicationPoint(
    {
      pubType: pubForm.pub_type,
      authorRole: pubForm.author_role,
      hdgsnnMaxPoint: pubForm.hdgsnn_max_point === '' ? null : Number(pubForm.hdgsnn_max_point),
    },
    regConfig
  );

  const tabItems: Array<{ value: DetailTab; label: string; count?: number; icon?: React.ReactNode }> = [
    { value: 'general', label: 'Hồ sơ' },
    { value: 'deadlines_courses', label: 'Thời hạn & HP' },
    { value: 'topic_supervisors', label: 'Đề tài & CBHD', count: phd.supervisions?.length || 0 },
    { value: 'progress_pubs', label: 'Tiến độ & Công bố', count: phd.publications?.length || 0 },
    { value: 'seminar_defense', label: 'Seminar & HĐ' },
    ...(isStaff ? [{ value: 'independent_review' as DetailTab, label: 'PBĐL', icon: <Lock size={12} className="text-amber-700" /> }] : []),
    { value: 'diploma_docs', label: 'Cấp bằng & Tài liệu', count: phd.documents?.length || 0 },
  ];

  return (
    <div className="space-y-5">
      {/* Compact Single-Block Dossier Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {!isOwnerPhd && (
            <button
              type="button"
              onClick={() => navigate('/ncs')}
              className="w-8 h-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
              title="Quay lại danh sách"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-slate-900 tracking-tight truncate">{phd.full_name}</h1>
              <button
                type="button"
                onClick={() => copyValue(phd.phd_code, 'Mã NCS')}
                className="mono text-xs font-semibold text-[#034ea1] hover:underline inline-flex items-center gap-1 cursor-pointer"
                title="Sao chép mã NCS"
              >
                {phd.phd_code} <Copy size={11} />
              </button>
              <StatusDot
                tone={
                  phd.is_completed || phd.study_status === 'graduated'
                    ? 'success'
                    : phd.study_status === 'extended'
                      ? 'warning'
                      : 'info'
                }
              >
                {STUDY_STATUS_LABELS[phd.study_status as StudyStatus] || phd.study_status}
              </StatusDot>
            </div>
            <div className="text-xs text-slate-400 truncate mt-0.5">
              {[phd.faculty_name, phd.major_name, phd.cohort].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>

        {isStaff && (
          <div className="flex items-center gap-2.5 shrink-0">
            {dirty && <span className="text-xs text-amber-700 font-medium">Chưa lưu</span>}
            <Button variant="primary" leadingIcon={<Save size={14} />} disabled={saving} onClick={handleSaveProfile}>
              {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
            </Button>
          </div>
        )}
      </div>

      {/* Unified Light Progress & Key Deadlines Strip (Replaces 2 stacked heavy boxes) */}
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        <ol className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {PHD_LIFECYCLE_STAGES.map((label, idx) => {
            const done = idx < currentStage || Boolean(phd.is_completed);
            const active = idx === currentStage && !phd.is_completed;
            return (
              <li key={label} className="inline-flex items-center gap-1.5">
                <span
                  className={`w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0 tabular ${
                    done
                      ? 'bg-emerald-600 text-white'
                      : active
                        ? 'bg-[#034ea1] text-white'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <Check size={10} /> : idx + 1}
                </span>
                <span className={done ? 'text-slate-700' : active ? 'text-[#034ea1] font-semibold' : 'text-slate-400'}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="inline-flex items-center gap-2 tabular">
            <span className="text-slate-400">Hạn chuẩn</span>
            <span className="mono font-medium text-slate-800">{formatDateVN(phd.standard_deadline)}</span>
            <Tag tone={deadlineTone(phd.deadlines?.standard?.level)}>{phd.deadlines?.standard?.label || '—'}</Tag>
          </div>
          <div className="inline-flex items-center gap-2 tabular">
            <span className="text-slate-400">Hạn tối đa</span>
            <span className="mono font-medium text-slate-800">{formatDateVN(phd.max_deadline)}</span>
          </div>
          <div className="inline-flex items-center gap-2 tabular">
            <span className="text-slate-400">CĐR NN</span>
            <span className="mono font-medium text-slate-800">{formatDateVN(phd.output_fl_review_deadline)}</span>
            {phd.deadlines?.outputFlReview?.level && phd.deadlines.outputFlReview.level !== 'none' && (
              <Tag tone={deadlineTone(phd.deadlines?.outputFlReview?.level)}>{phd.deadlines?.outputFlReview?.label}</Tag>
            )}
          </div>
          <div className="inline-flex items-center gap-2 tabular">
            <span className="text-slate-400">3638</span>
            <span className="font-semibold text-slate-800">
              {phd.publicationEvaluation?.totalPoints ?? 0}đ · {phd.publicationEvaluation?.wosScopusCount ?? 0} WoS
            </span>
            <Tag tone={phd.publicationEvaluation?.status === 'met' ? 'success' : 'neutral'}>
              {phd.publicationEvaluation?.status === 'met' ? 'Đạt' : 'Chưa đạt'}
            </Tag>
          </div>
          {isStaff && phd.ir_due_date && (
            <div className="inline-flex items-center gap-1.5 tabular text-amber-900">
              <Lock size={11} className="text-amber-700" />
              <span>PBĐL</span>
              <span className="mono font-medium">{formatDateVN(phd.ir_due_date)}</span>
              <Tag tone={deadlineTone(phd.deadlines?.irDue?.level)}>{phd.deadlines?.irDue?.label}</Tag>
            </div>
          )}
        </div>
      </div>

      <UnderlineTabs<DetailTab> value={tab} onChange={setTab} items={tabItems} />

      {/* TAB 1: HỒ SƠ & TUYỂN SINH */}
      {tab === 'general' && (
        <Panel className="divide-y divide-slate-200">
          <SectionBlock title="Định danh & Đơn vị đào tạo" description="Thông tin hành chính cơ bản và phân loại Khoa/Viện, Ngành đào tạo tiến sĩ.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Mã NCS" required>
                <input disabled={!isStaff} value={form.phd_code || ''} onChange={(e) => patchForm({ phd_code: e.target.value })} />
              </Field>
              <Field label="Họ và tên" required>
                <input disabled={!isStaff} value={form.full_name || ''} onChange={(e) => patchForm({ full_name: e.target.value })} />
              </Field>
              <Field label="Ngày sinh">
                <input type="date" disabled={!isStaff} value={form.dob || ''} onChange={(e) => patchForm({ dob: e.target.value })} />
              </Field>
              <Field label="Email">
                <input disabled={!isStaff} value={form.email || ''} onChange={(e) => patchForm({ email: e.target.value })} />
              </Field>
              <Field label="Điện thoại">
                <input disabled={!isStaff} value={form.phone || ''} onChange={(e) => patchForm({ phone: e.target.value })} />
              </Field>
              <Field label="Khóa / Đợt tuyển sinh">
                <input disabled={!isStaff} value={form.cohort || ''} onChange={(e) => patchForm({ cohort: e.target.value })} />
              </Field>
              <Field label="Khoa / Viện">
                <select disabled={!isStaff} value={form.faculty_id} onChange={(e) => patchForm({ faculty_id: e.target.value })}>
                  <option value="">-- Chọn Khoa/Viện --</option>
                  {catalogs.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Field label="Ngành đào tạo">
                <select disabled={!isStaff} value={form.major_id} onChange={(e) => patchForm({ major_id: e.target.value })}>
                  <option value="">-- Chọn Ngành --</option>
                  {catalogs.majors.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
                </select>
              </Field>
              <Field label="Tình trạng học">
                <select disabled={!isStaff} value={form.study_status || 'studying'} onChange={(e) => patchForm({ study_status: e.target.value })}>
                  {Object.entries(STUDY_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          </SectionBlock>

          <SectionBlock title="Tuyển sinh, Văn bằng & Nhập học" description="Hồ sơ đầu vào, ngoại ngữ, xác minh văn bằng và Quyết định công nhận NCS.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Đơn vị công tác" className="sm:col-span-2">
                <input disabled={!isStaff} value={form.work_unit || ''} onChange={(e) => patchForm({ work_unit: e.target.value })} />
              </Field>
              <Field label="Đối tượng">
                <input disabled={!isStaff} value={form.admission_category || ''} onChange={(e) => patchForm({ admission_category: e.target.value })} />
              </Field>
              <Field label="Chuẩn đầu vào ngoại ngữ">
                <input disabled={!isStaff} value={form.entrance_foreign_language || ''} onChange={(e) => patchForm({ entrance_foreign_language: e.target.value })} />
              </Field>
              <Field label="Ngành tốt nghiệp ThS/ĐH (dự thi)">
                <input disabled={!isStaff} value={form.graduated_major_applied || ''} onChange={(e) => patchForm({ graduated_major_applied: e.target.value })} />
              </Field>
              <Field label="Học bổ sung">
                <input disabled={!isStaff} value={form.supplementary_courses || ''} onChange={(e) => patchForm({ supplementary_courses: e.target.value })} />
              </Field>
              <Field label="Xác minh văn bằng, CC">
                <select disabled={!isStaff} value={form.degree_verification_status || 'pending'} onChange={(e) => patchForm({ degree_verification_status: e.target.value })}>
                  <option value="pending">Chưa xác minh</option>
                  <option value="in_progress">Đang gửi công văn xác minh</option>
                  <option value="verified">Đã xác minh hợp lệ</option>
                  <option value="issue">Có vấn đề cần xử lý</option>
                </select>
              </Field>
              <Field label="Ghi chú xác minh văn bằng" className="sm:col-span-2">
                <input disabled={!isStaff} value={form.degree_verification_note || ''} onChange={(e) => patchForm({ degree_verification_note: e.target.value })} />
              </Field>
              <Field label="Ngày nhập học">
                <input type="date" disabled={!isStaff} value={form.enrollment_date || ''} onChange={(e) => patchForm({ enrollment_date: e.target.value })} />
              </Field>
              <Field label="QĐ Công nhận NCS">
                <input disabled={!isStaff} value={form.admission_decision_no || ''} onChange={(e) => patchForm({ admission_decision_no: e.target.value })} />
              </Field>
              <Field label="Ngày QĐ Công nhận">
                <input type="date" disabled={!isStaff} value={form.admission_decision_date || ''} onChange={(e) => patchForm({ admission_decision_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Ghi chú khác">
              <textarea rows={2} disabled={!isStaff} value={form.other_notes || ''} onChange={(e) => patchForm({ other_notes: e.target.value })} />
            </Field>
          </SectionBlock>
        </Panel>
      )}

      {/* TAB 2: THỜI HẠN, HỌC PHẦN, CHUYÊN ĐỀ & THAY ĐỔI */}
      {tab === 'deadlines_courses' && (
        <Panel className="divide-y divide-slate-200">
          <SectionBlock title="Mốc thời hạn & CĐR Ngoại ngữ" description="Hệ thống tự đếm ngược và gửi cảnh báo theo cấu hình Quy chế 3638.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Thời điểm bắt đầu tính TGĐT">
                <input type="date" disabled={!isStaff} value={form.training_start_date || ''} onChange={(e) => patchForm({ training_start_date: e.target.value })} />
              </Field>
              <Field label="Ngày hết hạn đào tạo chuẩn">
                <input type="date" disabled={!isStaff} value={form.standard_deadline || ''} onChange={(e) => patchForm({ standard_deadline: e.target.value })} />
              </Field>
              <Field label="Ngày hết hạn đào tạo tối đa">
                <input type="date" disabled={!isStaff} value={form.max_deadline || ''} onChange={(e) => patchForm({ max_deadline: e.target.value })} />
              </Field>
              <Field label="Chuẩn đầu ra ngoại ngữ">
                <input disabled={!isStaff} value={form.output_foreign_language || ''} onChange={(e) => patchForm({ output_foreign_language: e.target.value })} />
              </Field>
              <Field label="Thời hạn phải xét lại CĐR NN">
                <input type="date" disabled={!isStaff} value={form.output_fl_review_deadline || ''} onChange={(e) => patchForm({ output_fl_review_deadline: e.target.value })} />
              </Field>
              <Field label="Tổng số tín chỉ tích lũy">
                <input type="number" step="0.5" disabled={!isStaff} value={form.accumulated_credits ?? 0} onChange={(e) => patchForm({ accumulated_credits: Number(e.target.value) })} />
              </Field>
            </div>
          </SectionBlock>

          <SectionBlock title="Học phần đã tích lũy" description="Danh sách chi tiết học phần trình độ tiến sĩ / học bổ sung.">
            {isStaff && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end pb-2">
                <Field label="Mã HP"><input value={newCourse.code} onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })} placeholder="INT7001" /></Field>
                <Field label="Tên học phần" className="sm:col-span-2"><input value={newCourse.name} onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })} /></Field>
                <Field label="TC"><input type="number" value={newCourse.credits} onChange={(e) => setNewCourse({ ...newCourse, credits: Number(e.target.value) })} /></Field>
                <Field label="Điểm / Kỳ"><input value={newCourse.grade || ''} onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })} placeholder="A · HK1" /></Field>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!newCourse.code && !newCourse.name) return;
                    const next = [...(form.completed_courses || []), newCourse];
                    const total = next.reduce((s, c) => s + (Number(c.credits) || 0), 0);
                    patchForm({ completed_courses: next, accumulated_credits: Math.max(Number(form.accumulated_credits) || 0, total) });
                    setNewCourse({ code: '', name: '', credits: 3, grade: '', term: '' });
                  }}
                >
                  Thêm HP
                </Button>
              </div>
            )}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Mã HP</th>
                    <th className="px-3 py-2">Tên học phần</th>
                    <th className="px-3 py-2 text-right">TC</th>
                    <th className="px-3 py-2">Điểm / Kỳ</th>
                    {isStaff && <th className="px-3 py-2 text-right" />}
                  </tr>
                </thead>
                <tbody>
                  {(form.completed_courses || []).length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-400">Chưa nhập học phần chi tiết.</td></tr>
                  ) : (
                    form.completed_courses.map((c: CompletedCourseItem, idx: number) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 mono text-xs font-medium">{c.code}</td>
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2 text-right tabular font-medium">{c.credits}</td>
                        <td className="px-3 py-2 text-slate-600">{c.grade} {c.term ? `(${c.term})` : ''}</td>
                        {isStaff && (
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => patchForm({ completed_courses: form.completed_courses.filter((_: any, i: number) => i !== idx) })} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionBlock>

          <SectionBlock title="Chuyên đề tiến sĩ & TLTQ" description="Tiểu luận tổng quan và các chuyên đề nghiên cứu chuyên sâu.">
            {isStaff && (
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end pb-2">
                <Field label="Loại">
                  <select value={newSeminar.kind} onChange={(e) => setNewSeminar({ ...newSeminar, kind: e.target.value as any })}>
                    <option value="chuyen_de">Chuyên đề</option>
                    <option value="tltq">TLTQ</option>
                  </select>
                </Field>
                <Field label="Tên chuyên đề / TLTQ" className="sm:col-span-2">
                  <input value={newSeminar.title} onChange={(e) => setNewSeminar({ ...newSeminar, title: e.target.value })} />
                </Field>
                <Field label="Ngày hoàn thành"><input type="date" value={newSeminar.completedDate || ''} onChange={(e) => setNewSeminar({ ...newSeminar, completedDate: e.target.value })} /></Field>
                <Field label="Kết quả"><input value={newSeminar.scoreOrResult || ''} onChange={(e) => setNewSeminar({ ...newSeminar, scoreOrResult: e.target.value })} placeholder="9.0 - Đạt" /></Field>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!newSeminar.title) return;
                    patchForm({ doctoral_seminars: [...(form.doctoral_seminars || []), newSeminar] });
                    setNewSeminar({ title: '', kind: 'chuyen_de', credits: 2, completedDate: '', scoreOrResult: '' });
                  }}
                >
                  Thêm
                </Button>
              </div>
            )}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {(form.doctoral_seminars || []).length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center">Chưa ghi nhận chuyên đề / TLTQ.</div>
              ) : (
                form.doctoral_seminars.map((s: DoctoralSeminarItem, idx: number) => (
                  <div key={idx} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <Tag tone={s.kind === 'tltq' ? 'info' : 'neutral'} className="mr-2">{s.kind === 'tltq' ? 'TLTQ' : 'Chuyên đề'}</Tag>
                      <span className="font-medium text-slate-900">{s.title}</span>
                      <span className="text-slate-500 ml-2 mono">{formatDateVN(s.completedDate)}</span>
                      {s.scoreOrResult && <span className="text-slate-700 font-medium ml-2">· {s.scoreOrResult}</span>}
                    </div>
                    {isStaff && (
                      <button type="button" onClick={() => patchForm({ doctoral_seminars: form.doctoral_seminars.filter((_: any, i: number) => i !== idx) })} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </SectionBlock>

          <SectionBlock title="Thay đổi trong quá trình đào tạo" description="Lịch sử gia hạn, bảo lưu, chuyển đề tài, thay đổi CBHD kèm số QĐ.">
            {isStaff && (
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end pb-2">
                <Field label="Ngày"><input type="date" value={newChange.date} onChange={(e) => setNewChange({ ...newChange, date: e.target.value })} /></Field>
                <Field label="Loại biến động"><input value={newChange.changeType} onChange={(e) => setNewChange({ ...newChange, changeType: e.target.value })} placeholder="Gia hạn / Đổi CBHD" /></Field>
                <Field label="Số QĐ"><input value={newChange.decisionNo || ''} onChange={(e) => setNewChange({ ...newChange, decisionNo: e.target.value })} /></Field>
                <Field label="Nội dung" className="sm:col-span-2"><input value={newChange.description} onChange={(e) => setNewChange({ ...newChange, description: e.target.value })} /></Field>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!newChange.changeType && !newChange.description) return;
                    patchForm({ training_changes: [...(form.training_changes || []), newChange] });
                    setNewChange({ date: new Date().toISOString().slice(0, 10), changeType: '', decisionNo: '', description: '' });
                  }}
                >
                  Ghi nhận
                </Button>
              </div>
            )}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {(form.training_changes || []).length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center">Chưa có biến động đào tạo nào.</div>
              ) : (
                form.training_changes.map((ch: TrainingChangeItem, idx: number) => (
                  <div key={idx} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="mono text-slate-500 mr-2">{formatDateVN(ch.date)}</span>
                      <span className="font-semibold text-slate-900">{ch.changeType}</span>
                      {ch.decisionNo && <span className="mono text-[#034ea1] mx-2">({ch.decisionNo})</span>}
                      <span className="text-slate-600">{ch.description}</span>
                    </div>
                    {isStaff && (
                      <button type="button" onClick={() => patchForm({ training_changes: form.training_changes.filter((_: any, i: number) => i !== idx) })} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </SectionBlock>
        </Panel>
      )}

      {/* TAB 3: ĐỀ TÀI & CÁN BỘ HƯỚNG DẪN */}
      {tab === 'topic_supervisors' && (
        <Panel className="divide-y divide-slate-200">
          <SectionBlock title="Đề tài Luận án & Trợ giảng" description="Tên đề tài LATS được giao, số QĐ giao đề tài và hoạt động trợ giảng / sinh hoạt chuyên môn.">
            <Field label="Tên đề tài LATS">
              <textarea rows={2} disabled={!isStaff} value={form.dissertation_title || ''} onChange={(e) => patchForm({ dissertation_title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="QĐ giao đề tài và CBHD">
                <input disabled={!isStaff} value={form.topic_supervisor_decision_no || ''} onChange={(e) => patchForm({ topic_supervisor_decision_no: e.target.value })} />
              </Field>
              <Field label="Ngày QĐ giao đề tài">
                <input type="date" disabled={!isStaff} value={form.topic_supervisor_decision_date || ''} onChange={(e) => patchForm({ topic_supervisor_decision_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Công tác trợ giảng, sinh hoạt chuyên môn">
              <textarea rows={2} disabled={!isStaff} value={form.teaching_and_academic_activities || ''} onChange={(e) => patchForm({ teaching_and_academic_activities: e.target.value })} />
            </Field>
          </SectionBlock>

          <SectionBlock
            title="Phân công Cán bộ hướng dẫn"
            description={`Hệ số quy đổi Quota & Giờ chuẩn: Độc lập (${regConfig.weightIndependent}), Chính (${regConfig.weightPrimary}), Phụ (${regConfig.weightSecondary}), Đồng HD (${regConfig.weightCo}).`}
            actions={
              isStaff ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<Plus size={13} />}
                    onClick={() => setSupRows([...supRows, { scientist_id: 0, role: 'primary', decision_no: form.topic_supervisor_decision_no || '', assigned_date: form.topic_supervisor_decision_date || '' }])}
                  >
                    Thêm CBHD
                  </Button>
                  <Button size="sm" variant="primary" disabled={saving} onClick={handleSaveSupervisions}>
                    Lưu phân công
                  </Button>
                </>
              ) : null
            }
          >
            {isStaff ? (
              <div className="space-y-2">
                {supRows.length === 0 ? (
                  <p className="text-xs text-slate-400">Chưa có phân công CBHD nào.</p>
                ) : (
                  supRows.map((row, idx) => {
                    const matched = scientists.find((s) => Number(s.id) === Number(row.scientist_id));
                    return (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-md border border-slate-200 bg-slate-50/50">
                        <div className="sm:col-span-5">
                          <select
                            value={row.scientist_id}
                            onChange={(e) => {
                              const next = [...supRows];
                              next[idx].scientist_id = Number(e.target.value);
                              setSupRows(next);
                            }}
                          >
                            <option value={0}>-- Chọn Cán bộ hướng dẫn --</option>
                            {scientists.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title_display} {s.full_name} ({s.quotaEvaluation.equivalentLoad}/{s.quotaEvaluation.effectiveQuota} NCS)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <select
                            value={row.role}
                            onChange={(e) => {
                              const next = [...supRows];
                              next[idx].role = e.target.value as SupervisionRole;
                              setSupRows(next);
                            }}
                          >
                            <option value="independent">CBHD độc lập ({regConfig.weightIndependent})</option>
                            <option value="primary">CB hướng dẫn chính ({regConfig.weightPrimary})</option>
                            <option value="secondary">CB hướng dẫn phụ ({regConfig.weightSecondary})</option>
                            <option value="co">CB đồng hướng dẫn ({regConfig.weightCo})</option>
                          </select>
                        </div>
                        <div className="sm:col-span-3 text-xs tabular">
                          {matched ? (
                            <Tag tone={matched.quotaEvaluation.status === 'over_limit' ? 'error' : 'neutral'}>
                              Quota {matched.quotaEvaluation.equivalentLoad}/{matched.quotaEvaluation.effectiveQuota} · {matched.researchEvaluation.totalPoints}đ 3638
                            </Tag>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                        <div className="sm:col-span-1 text-right">
                          <button type="button" onClick={() => setSupRows(supRows.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {(phd.supervisions || []).map((s: any) => (
                  <div key={s.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{s.title_display} {s.full_name}</div>
                      <div className="text-slate-500">{s.work_unit} · {s.email}</div>
                    </div>
                    <Tag tone="info">{SUPERVISION_ROLE_LABELS[s.role as SupervisionRole] || s.role}</Tag>
                  </div>
                ))}
              </div>
            )}
          </SectionBlock>
        </Panel>
      )}

      {/* TAB 4: TIẾN ĐỘ & CÔNG BỐ 3638 */}
      {tab === 'progress_pubs' && (
        <Panel className="divide-y divide-slate-200">
          <SectionBlock
            title="Công bố khoa học (Quy chế 3638)"
            description={`Chuẩn đầu ra tối thiểu: ≥ ${regConfig.phdMinPoints} điểm tác giả chính và ≥ ${regConfig.phdMinWosScopus} bài WoS/Scopus. Hiện đạt ${phd.publicationEvaluation.mainAuthorPoints}đ (${phd.publicationEvaluation.wosScopusCount} WoS/Scopus).`}
          >
            {(isStaff || isOwnerPhd) && (
              <form onSubmit={handleAddPub} className="p-3.5 rounded-md border border-slate-200 bg-slate-50/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">Thêm bài báo / Đề tài NCKH</span>
                  <span className="mono font-semibold text-[#034ea1]">+{previewPubPoint} điểm 3638</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Tên công trình / Đề tài" required className="sm:col-span-2">
                    <input required value={pubForm.title} onChange={(e) => setPubForm({ ...pubForm, title: e.target.value })} />
                  </Field>
                  <Field label="Năm" required>
                    <input type="number" required value={pubForm.pub_year} onChange={(e) => setPubForm({ ...pubForm, pub_year: e.target.value })} />
                  </Field>
                  <Field label="Loại mục">
                    <select value={pubForm.item_kind} onChange={(e) => setPubForm({ ...pubForm, item_kind: e.target.value })}>
                      <option value="article">Bài báo tạp chí</option>
                      <option value="conference">Báo cáo hội nghị</option>
                      <option value="research_project">Đề tài NCKH</option>
                      <option value="patent">Sáng chế / GPHI</option>
                    </select>
                  </Field>
                  <Field label="Phân loại tính điểm">
                    <select value={pubForm.pub_type} onChange={(e) => setPubForm({ ...pubForm, pub_type: e.target.value as PublicationType })}>
                      {Object.entries(PUBLICATION_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v} ({regConfig.pubTypePoints[k as PublicationType]}đ)</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Vai trò tác giả">
                    <select value={pubForm.author_role} onChange={(e) => setPubForm({ ...pubForm, author_role: e.target.value as AuthorRole })}>
                      {Object.entries(AUTHOR_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Tạp chí / Hội nghị / Đơn vị">
                    <input value={pubForm.venue} onChange={(e) => setPubForm({ ...pubForm, venue: e.target.value })} />
                  </Field>
                  <Field label="DOI / Link minh chứng">
                    <input value={pubForm.doi_url} onChange={(e) => setPubForm({ ...pubForm, doi_url: e.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <Button type="submit" variant="primary" className="w-full">Thêm công bố</Button>
                  </div>
                </div>
              </form>
            )}

            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Năm</th>
                    <th className="px-3 py-2">Tên công trình / Tạp chí</th>
                    <th className="px-3 py-2">Phân loại & Vai trò</th>
                    <th className="px-3 py-2 text-right">Điểm</th>
                    <th className="px-3 py-2">Xác minh</th>
                    {(isStaff || isOwnerPhd) && <th className="px-3 py-2 text-right" />}
                  </tr>
                </thead>
                <tbody>
                  {(phd.publications || []).length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">Chưa có công bố nào.</td></tr>
                  ) : (
                    phd.publications.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 mono font-semibold">{p.pub_year}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{p.title}</div>
                          <div className="text-[11px] text-slate-500">{p.venue || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div>{PUBLICATION_TYPE_LABELS[p.pub_type as PublicationType] || p.pub_type}</div>
                          <div className="text-[11px] text-slate-500">{AUTHOR_ROLE_LABELS[p.author_role as AuthorRole] || p.author_role}</div>
                        </td>
                        <td className="px-3 py-2 text-right mono font-semibold text-[#034ea1]">{p.calculated_point}đ</td>
                        <td className="px-3 py-2">
                          {isStaff ? (
                            <button type="button" onClick={() => handleToggleVerifyPub(p)} className="cursor-pointer">
                              <StatusDot tone={p.verified ? 'success' : 'warning'}>{p.verified ? 'Đã xác minh' : 'Chờ xác minh'}</StatusDot>
                            </button>
                          ) : (
                            <StatusDot tone={p.verified ? 'success' : 'warning'}>{p.verified ? 'Đã xác minh' : 'Chờ xác minh'}</StatusDot>
                          )}
                        </td>
                        {(isStaff || isOwnerPhd) && (
                          <td className="px-3 py-2 text-right">
                            {(!p.verified || isStaff) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({
                                    open: true,
                                    title: 'Xóa công bố khoa học',
                                    description: `Bạn có chắc muốn xóa công trình "${p.title}" khỏi hồ sơ NCS?`,
                                    action: async () => {
                                      const updated = await apiFetch(`/api/phd-students/${id}/publications/${p.id}`, { method: 'DELETE' });
                                      setPhd(updated);
                                      toast.success('Đã xóa công bố.');
                                    },
                                  })
                                }
                                className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionBlock>

          <SectionBlock title="Báo cáo tiến độ theo kỳ" description="Cập nhật phần trăm hoàn thành luận án định kỳ và nhận xét duyệt từ CBHD.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tiến độ luận án cập nhật theo kỳ">
                <input disabled={!isStaff} value={form.thesis_progress_by_term || ''} onChange={(e) => patchForm({ thesis_progress_by_term: e.target.value })} />
              </Field>
              <Field label="Tóm tắt báo cáo tiến độ">
                <input disabled={!isStaff} value={form.progress_report_summary || ''} onChange={(e) => patchForm({ progress_report_summary: e.target.value })} />
              </Field>
            </div>

            {(isStaff || isOwnerPhd) && (
              <form onSubmit={handleSubmitProgressReport} className="p-3.5 rounded-md border border-slate-200 bg-slate-50/60 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">Nộp báo cáo tiến độ kỳ mới</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Kỳ báo cáo" required>
                    <input required value={reportForm.academic_term} onChange={(e) => setReportForm({ ...reportForm, academic_term: e.target.value })} />
                  </Field>
                  <Field label="Ngày báo cáo">
                    <input type="date" value={reportForm.report_date} onChange={(e) => setReportForm({ ...reportForm, report_date: e.target.value })} />
                  </Field>
                  <Field label={`Tiến độ ước lượng (${reportForm.thesis_progress_percent}%)`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={reportForm.thesis_progress_percent}
                      onChange={(e) => setReportForm({ ...reportForm, thesis_progress_percent: Number(e.target.value) })}
                      className="mt-2"
                    />
                  </Field>
                </div>
                <Field label="Kết quả nghiên cứu trong kỳ" required>
                  <textarea rows={2} required value={reportForm.summary} onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Kế hoạch kỳ tới">
                    <input value={reportForm.next_plan} onChange={(e) => setReportForm({ ...reportForm, next_plan: e.target.value })} />
                  </Field>
                  <Field label="Link báo cáo / Minh chứng">
                    <input value={reportForm.evidence_url} onChange={(e) => setReportForm({ ...reportForm, evidence_url: e.target.value })} placeholder="https://drive.google.com/..." />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" variant="primary">Gửi báo cáo</Button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {(phd.progress_reports || []).map((r: any) => (
                <div key={r.id} className="p-3.5 rounded-md border border-slate-200 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{r.academic_term}</span>
                      <span className="mono text-slate-400">{formatDateVN(r.report_date)}</span>
                      <Tag tone="info">{r.thesis_progress_percent}%</Tag>
                    </div>
                    <StatusDot tone={r.supervisor_status === 'approved' ? 'success' : r.supervisor_status === 'needs_revision' ? 'warning' : 'neutral'}>
                      {r.supervisor_status === 'approved' ? 'CBHD đã duyệt' : r.supervisor_status === 'needs_revision' ? 'Cần bổ sung' : 'Chờ CBHD nhận xét'}
                    </StatusDot>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{r.summary}</p>
                  {r.next_plan && <p className="text-slate-500">Kế hoạch tiếp theo: {r.next_plan}</p>}
                  {r.supervisor_comment && (
                    <div className="px-3 py-2 rounded bg-emerald-50/70 border border-emerald-200/80 text-emerald-900">
                      <strong>Nhận xét CBHD:</strong> {r.supervisor_comment}
                    </div>
                  )}
                  {(isStaff || isAssignedSupervisor) && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
                      <input
                        className="flex-1"
                        placeholder="Nhập nhận xét duyệt báo cáo..."
                        value={reviewCommentById[r.id] ?? r.supervisor_comment ?? ''}
                        onChange={(e) => setReviewCommentById({ ...reviewCommentById, [r.id]: e.target.value })}
                      />
                      <Button size="sm" variant="tinted-success" leadingIcon={<CheckCircle2 size={13} />} onClick={() => handleReviewProgressReport(r.id, 'approved')}>
                        Duyệt
                      </Button>
                      <Button size="sm" variant="tinted-warning" onClick={() => handleReviewProgressReport(r.id, 'needs_revision')}>
                        Yêu cầu sửa
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionBlock>
        </Panel>
      )}

      {/* TAB 5: SEMINAR, HỘI ĐỒNG LATS & THẨM ĐỊNH */}
      {tab === 'seminar_defense' && (
        <Panel className="divide-y divide-slate-200">
          <SectionBlock
            title="Seminar tổng thể & Điều chỉnh đề tài"
            description="Đánh giá tổng thể luận án ở đơn vị chuyên môn (bảo vệ cấp cơ sở) và QĐ điều chỉnh tên đề tài nếu có."
            actions={
              isStaff ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setSemMembers([...semMembers, { scientist_id: 0, member_role: 'member' }])}>
                    + Thành viên HĐ
                  </Button>
                  <Button size="sm" variant="tinted" onClick={() => handleSaveCommittee('seminar')}>
                    Lưu HĐ Seminar
                  </Button>
                </>
              ) : null
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Số QĐ HĐ Seminar tổng thể/cấp cơ sở">
                <input disabled={!isStaff} value={form.seminar_decision_no || ''} onChange={(e) => patchForm({ seminar_decision_no: e.target.value })} />
              </Field>
              <Field label="Ngày Seminar tổng thể/BV cấp cơ sở">
                <input type="date" disabled={!isStaff} value={form.seminar_date || ''} onChange={(e) => patchForm({ seminar_date: e.target.value })} />
              </Field>
              <Field label="Kết quả đánh giá tổng thể">
                <input disabled={!isStaff} value={form.seminar_result || ''} onChange={(e) => patchForm({ seminar_result: e.target.value })} />
              </Field>
              <Field label="Số QĐ Điều chỉnh tên đề tài">
                <input disabled={!isStaff} value={form.title_change_decision_no || ''} onChange={(e) => patchForm({ title_change_decision_no: e.target.value })} />
              </Field>
              <Field label="Tên đề tài mới" className="sm:col-span-2">
                <input disabled={!isStaff} value={form.adjusted_dissertation_title || ''} onChange={(e) => patchForm({ adjusted_dissertation_title: e.target.value })} />
              </Field>
            </div>

            {isStaff ? (
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-medium text-slate-600">Thành viên Hội đồng Seminar ({semMembers.length})</div>
                {semMembers.map((m, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center">
                    <select
                      className="flex-1 min-w-[220px]"
                      value={m.scientist_id}
                      onChange={(e) => {
                        const next = [...semMembers];
                        next[idx].scientist_id = Number(e.target.value);
                        setSemMembers(next);
                      }}
                    >
                      <option value={0}>-- Chọn cán bộ --</option>
                      {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name} ({s.work_unit})</option>)}
                    </select>
                    <select
                      className="!w-40"
                      value={m.member_role}
                      onChange={(e) => {
                        const next = [...semMembers];
                        next[idx].member_role = e.target.value;
                        setSemMembers(next);
                      }}
                    >
                      {Object.entries(COMMITTEE_MEMBER_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button type="button" onClick={() => setSemMembers(semMembers.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(phd.seminar_members || []).map((m: any) => (
                  <Tag key={m.id}>{COMMITTEE_MEMBER_ROLE_LABELS[m.member_role] || m.member_role}: {m.title_display} {m.full_name}</Tag>
                ))}
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            title="Hội đồng Đánh giá LATS & Thẩm định"
            description="Quyết định thành lập HĐ cấp ĐHQGHN/Trường, ngày bảo vệ, hoàn thiện hồ sơ và kết quả thẩm định."
            actions={
              isStaff ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setDefMembers([...defMembers, { scientist_id: 0, member_role: 'member' }])}>
                    + Thành viên HĐ
                  </Button>
                  <Button size="sm" variant="tinted" onClick={() => handleSaveCommittee('defense')}>
                    Lưu HĐ LATS
                  </Button>
                </>
              ) : null
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Số QĐ hội đồng đánh giá LATS">
                <input disabled={!isStaff} value={form.defense_council_decision_no || ''} onChange={(e) => patchForm({ defense_council_decision_no: e.target.value })} />
              </Field>
              <Field label="Ngày QĐ thành lập HĐ">
                <input type="date" disabled={!isStaff} value={form.defense_council_decision_date || ''} onChange={(e) => patchForm({ defense_council_decision_date: e.target.value })} />
              </Field>
              <Field label="Ngày bảo vệ">
                <input type="date" disabled={!isStaff} value={form.defense_date || ''} onChange={(e) => patchForm({ defense_date: e.target.value })} />
              </Field>
              <Field label="Ngày nộp lại theo quyết nghị HĐ">
                <input type="date" disabled={!isStaff} value={form.post_defense_resubmit_date || ''} onChange={(e) => patchForm({ post_defense_resubmit_date: e.target.value })} />
              </Field>
              <Field label="Ngày nộp hồ sơ cuối cùng">
                <input type="date" disabled={!isStaff} value={form.final_dossier_submit_date || ''} onChange={(e) => patchForm({ final_dossier_submit_date: e.target.value })} />
              </Field>
              <Field label="Thẩm định">
                <input disabled={!isStaff} value={form.appraisal_status || ''} onChange={(e) => patchForm({ appraisal_status: e.target.value })} />
              </Field>
              <Field label="Các minh chứng hoàn thiện hồ sơ" className="sm:col-span-2">
                <input disabled={!isStaff} value={form.dossier_completion_evidences || ''} onChange={(e) => patchForm({ dossier_completion_evidences: e.target.value })} />
              </Field>
              <Field label="Kết quả thẩm định">
                <input disabled={!isStaff} value={form.appraisal_result || ''} onChange={(e) => patchForm({ appraisal_result: e.target.value })} />
              </Field>
            </div>

            {isStaff ? (
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-medium text-slate-600">Thành viên HĐ Đánh giá LATS ({defMembers.length})</div>
                {defMembers.map((m, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center">
                    <select
                      className="flex-1 min-w-[220px]"
                      value={m.scientist_id}
                      onChange={(e) => {
                        const next = [...defMembers];
                        next[idx].scientist_id = Number(e.target.value);
                        setDefMembers(next);
                      }}
                    >
                      <option value={0}>-- Chọn cán bộ --</option>
                      {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name} — {s.researchEvaluation.totalPoints}đ 3638</option>)}
                    </select>
                    <select
                      className="!w-40"
                      value={m.member_role}
                      onChange={(e) => {
                        const next = [...defMembers];
                        next[idx].member_role = e.target.value;
                        setDefMembers(next);
                      }}
                    >
                      {Object.entries(COMMITTEE_MEMBER_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button type="button" onClick={() => setDefMembers(defMembers.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(phd.defense_members || []).map((m: any) => (
                  <Tag key={m.id} tone="info">{COMMITTEE_MEMBER_ROLE_LABELS[m.member_role] || m.member_role}: {m.title_display} {m.full_name}</Tag>
                ))}
              </div>
            )}
          </SectionBlock>
        </Panel>
      )}

      {/* TAB 6: PHẢN BIỆN ĐỘC LẬP (MẬT — CHỈ ADMIN & STAFF) */}
      {tab === 'independent_review' && isStaff && (
        <Panel className="border-l-[3px] border-l-amber-500 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-200/80 flex items-center justify-between gap-3 text-xs text-amber-950">
            <span className="inline-flex items-center gap-2 font-medium">
              <Lock size={14} className="text-amber-700 shrink-0" />
              <span>Khu vực MẬT nội bộ Phòng CTSV — ẩn hoàn toàn với NCS và CBHD.</span>
            </span>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Field label="Chọn PBĐL 1 (từ kho Cán bộ)">
              <select
                value={form.ir1_scientist_id}
                onChange={(e) => {
                  const sid = e.target.value;
                  const sc = scientists.find((x) => String(x.id) === sid);
                  patchForm({ ir1_scientist_id: sid, ir1_info: sc ? `${sc.title_display} ${sc.full_name} (${sc.work_unit})` : form.ir1_info });
                }}
              >
                <option value="">-- Chọn hoặc nhập tự do --</option>
                {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name} ({s.researchEvaluation.totalPoints}đ)</option>)}
              </select>
            </Field>
            <Field label="Thông tin phản biện độc lập 1">
              <input value={form.ir1_info || ''} onChange={(e) => patchForm({ ir1_info: e.target.value })} />
            </Field>
            <Field label="Ngày gửi PBĐL 1">
              <input type="date" value={form.ir1_sent_date || ''} onChange={(e) => patchForm({ ir1_sent_date: e.target.value })} />
            </Field>

            <Field label="Chọn PBĐL 2 (từ kho Cán bộ)">
              <select
                value={form.ir2_scientist_id}
                onChange={(e) => {
                  const sid = e.target.value;
                  const sc = scientists.find((x) => String(x.id) === sid);
                  patchForm({ ir2_scientist_id: sid, ir2_info: sc ? `${sc.title_display} ${sc.full_name} (${sc.work_unit})` : form.ir2_info });
                }}
              >
                <option value="">-- Chọn hoặc nhập tự do --</option>
                {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name} ({s.researchEvaluation.totalPoints}đ)</option>)}
              </select>
            </Field>
            <Field label="Thông tin phản biện độc lập 2">
              <input value={form.ir2_info || ''} onChange={(e) => patchForm({ ir2_info: e.target.value })} />
            </Field>
            <Field label="Ngày gửi PBĐL 2">
              <input type="date" value={form.ir2_sent_date || ''} onChange={(e) => patchForm({ ir2_sent_date: e.target.value })} />
            </Field>

            <Field label="Hạn nộp nhận xét PBĐL">
              <input type="date" value={form.ir_due_date || ''} onChange={(e) => patchForm({ ir_due_date: e.target.value })} />
            </Field>
            <Field label="Thông tin phản biện độc lập từ chối" className="sm:col-span-2">
              <input value={form.ir_declined_info || ''} onChange={(e) => patchForm({ ir_declined_info: e.target.value })} />
            </Field>

            <Field label="Chọn PBĐL 3 (nếu cần)">
              <select
                value={form.ir3_scientist_id}
                onChange={(e) => {
                  const sid = e.target.value;
                  const sc = scientists.find((x) => String(x.id) === sid);
                  patchForm({ ir3_scientist_id: sid, ir3_info: sc ? `${sc.title_display} ${sc.full_name} (${sc.work_unit})` : form.ir3_info });
                }}
              >
                <option value="">-- Chọn PBĐL 3 --</option>
                {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name}</option>)}
              </select>
            </Field>
            <Field label="Thông tin phản biện độc lập 3">
              <input value={form.ir3_info || ''} onChange={(e) => patchForm({ ir3_info: e.target.value })} />
            </Field>
            <Field label="Ngày gửi PBĐL 3">
              <input type="date" value={form.ir3_sent_date || ''} onChange={(e) => patchForm({ ir3_sent_date: e.target.value })} />
            </Field>

            <Field label="Kết quả phản biện ĐL">
              <input value={form.ir_result || ''} onChange={(e) => patchForm({ ir_result: e.target.value })} />
            </Field>
            <Field label="Ghi chú nội bộ PBĐL" className="sm:col-span-2">
              <input value={form.ir_notes || ''} onChange={(e) => patchForm({ ir_notes: e.target.value })} />
            </Field>
          </div>
        </Panel>
      )}

      {/* TAB 7: CẤP BẰNG & KHO TÀI LIỆU MINH CHỨNG */}
      {tab === 'diploma_docs' && (
        <Panel className="divide-y divide-slate-200">
          <SectionBlock title="Công nhận học vị & Cấp bằng" description="Số hiệu bằng, số vào sổ, QĐ cấp bằng và đánh dấu hoàn tất hồ sơ (tự giải phóng Quota CBHD).">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Số hiệu bằng">
                <input disabled={!isStaff} value={form.diploma_serial_no || ''} onChange={(e) => patchForm({ diploma_serial_no: e.target.value })} />
              </Field>
              <Field label="Số vào sổ">
                <input disabled={!isStaff} value={form.diploma_registry_no || ''} onChange={(e) => patchForm({ diploma_registry_no: e.target.value })} />
              </Field>
              <Field label="Số QĐ Công nhận học vị & cấp bằng">
                <input disabled={!isStaff} value={form.degree_award_decision_no || ''} onChange={(e) => patchForm({ degree_award_decision_no: e.target.value })} />
              </Field>
              <Field label="Ngày ký cấp bằng">
                <input type="date" disabled={!isStaff} value={form.diploma_signed_date || ''} onChange={(e) => patchForm({ diploma_signed_date: e.target.value })} />
              </Field>
              <Field label="Năm tốt nghiệp">
                <input type="number" disabled={!isStaff} value={form.graduation_year || ''} onChange={(e) => patchForm({ graduation_year: e.target.value })} />
              </Field>
              <Field label="Ngày nhận bằng (NCS nhận bằng)">
                <input type="date" disabled={!isStaff} value={form.diploma_received_date || ''} onChange={(e) => patchForm({ diploma_received_date: e.target.value })} />
              </Field>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 pt-1 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isStaff}
                checked={Boolean(form.is_completed)}
                onChange={(e) => patchForm({ is_completed: e.target.checked ? 1 : 0 })}
              />
              Đánh dấu KẾT THÚC quản lý hồ sơ NCS này
            </label>
          </SectionBlock>

          <SectionBlock title="Kho tệp minh chứng" description="Lưu trữ trực tiếp PDF/Word/Ảnh (Cloudflare R2 / local) hoặc liên kết Google Drive.">
            {(isStaff || isOwnerPhd) && (
              <div className="p-3.5 rounded-md border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Phân loại tài liệu">
                    <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                      {Object.entries(DOC_CATEGORIES)
                        .filter(([k]) => isStaff || k !== 'ir_document')
                        .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Tiêu đề hiển thị" className="sm:col-span-2">
                    <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="VD: QĐ công nhận NCS 1820/QĐ-ĐHCN" />
                  </Field>
                </div>
                {isStaff && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-amber-900 font-medium cursor-pointer">
                    <input type="checkbox" checked={docConfidential || docCategory === 'ir_document'} onChange={(e) => setDocConfidential(e.target.checked)} />
                    Tài liệu MẬT (chỉ Phòng CTSV được truy cập)
                  </label>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white border border-dashed border-slate-300 space-y-1.5">
                    <div className="text-xs font-medium text-slate-700 inline-flex items-center gap-1.5">
                      <Upload size={13} className="text-[#034ea1]" /> Tải tệp từ máy (≤ 15 MB)
                    </div>
                    <input type="file" disabled={uploadingDoc} onChange={handleUploadFile} className="text-xs w-full" />
                  </div>
                  <form onSubmit={handleAddDriveLink} className="p-3 rounded bg-white border border-slate-200 space-y-1.5">
                    <div className="text-xs font-medium text-slate-700 inline-flex items-center gap-1.5">
                      <LinkIcon size={13} className="text-[#034ea1]" /> Hoặc dán link Google Drive
                    </div>
                    <div className="flex gap-2">
                      <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/..." />
                      <Button type="submit" size="sm" variant="secondary" disabled={uploadingDoc}>Gắn</Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {(phd.documents || []).length === 0 ? (
                <div className="p-5 text-center text-xs text-slate-400">Chưa có tài liệu minh chứng nào.</div>
              ) : (
                phd.documents.map((d: any) => (
                  <div key={d.id} className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{d.title}</span>
                        <Tag tone={d.is_confidential ? 'warning' : 'neutral'}>{DOC_CATEGORIES[d.category] || d.category}</Tag>
                        {d.is_confidential ? <Tag tone="error">MẬT</Tag> : null}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 mono">
                        {d.storage_provider === 'drive_link' ? d.drive_url : `${d.filename} · ${(Number(d.size_bytes || 0) / 1024).toFixed(1)} KB`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={d.storage_provider === 'drive_link' ? d.drive_url : getDocumentViewUrl(d.id, false)}
                        target="_blank"
                        rel="noreferrer"
                        className="h-7 px-2.5 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> Mở
                      </a>
                      {(isStaff || isOwnerPhd) && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: 'Xóa tài liệu minh chứng',
                              description: `Bạn có chắc muốn xóa "${d.title}" khỏi hồ sơ?`,
                              action: async () => {
                                await apiFetch(`/api/documents/${d.id}`, { method: 'DELETE' });
                                await loadData();
                                toast.success('Đã xóa tài liệu minh chứng.');
                              },
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionBlock>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => setConfirmState((prev) => ({ ...prev, open: o }))}
        title={confirmState.title}
        description={confirmState.description}
        danger
        confirmLabel="Xóa"
        onConfirm={confirmState.action}
      />
    </div>
  );
}
