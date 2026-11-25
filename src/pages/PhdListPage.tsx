import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { STUDY_STATUS_LABELS, SUPERVISION_ROLE_LABELS } from '../../shared/regulation3638';
import type { AuthUser, StudyStatus, SupervisionRole } from '../../shared/types';
import type { AppCatalogs } from '../App';
import { apiFetch, downloadBlob } from '../shared/api';
import { computePhdLifecycleStage, copyValue, formatDateVN, PHD_LIFECYCLE_STAGES } from '../shared/format';
import {
  Button,
  DataTable,
  Drawer,
  Field,
  FilterPopover,
  Modal,
  PageTop,
  StatusDot,
  Tag,
  type StatusTone,
} from '../shared/ui';

function deadlineTone(level?: string): StatusTone {
  if (level === 'overdue') return 'error';
  if (level === 'urgent') return 'warning';
  if (level === 'warning') return 'info';
  if (level === 'completed') return 'success';
  return 'neutral';
}

function statusTone(status: string): StatusTone {
  if (status === 'graduated' || status === 'defended') return 'success';
  if (status === 'ready_defense') return 'info';
  if (status === 'extended' || status === 'deferred') return 'warning';
  if (status === 'withdrawn') return 'error';
  return 'neutral';
}

const PUB_STATUS_LABELS: Record<string, string> = {
  met: 'Đạt 3638',
  in_progress: 'Đang tích lũy',
  not_met: 'Chưa có công bố',
};

const DEADLINE_ALERT_LABELS: Record<string, string> = {
  overdue: 'Quá hạn',
  urgent: '≤ 30 ngày',
  warning: '≤ 90 ngày',
};

export function PhdListPage({ user, catalogs }: { user: AuthUser; catalogs: AppCatalogs }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStaff = user.role === 'admin' || user.role === 'staff';
  const supervisorView = user.role === 'supervisor' || searchParams.get('view') === 'supervisor';

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhd, setSelectedPhd] = useState<any | null>(null);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [facultyId, setFacultyId] = useState(searchParams.get('facultyId') || '');
  const [majorId, setMajorId] = useState(searchParams.get('majorId') || '');
  const [studyStatus, setStudyStatus] = useState(searchParams.get('studyStatus') || 'all');
  const [pubStatus, setPubStatus] = useState(searchParams.get('pubStatus') || 'all');
  const [deadlineAlert, setDeadlineAlert] = useState(searchParams.get('deadlineAlert') || 'all');
  const [includeCompleted, setIncludeCompleted] = useState(true);

  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    phd_code: '',
    full_name: '',
    email: '',
    phone: '',
    faculty_id: '',
    major_id: '',
    cohort: 'QH-2026-Đợt 1',
    work_unit: '',
    admission_category: 'Từ Thạc sĩ',
    training_start_date: new Date().toISOString().slice(0, 10),
    standard_deadline: '',
    max_deadline: '',
    dissertation_title: '',
  });

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (facultyId) params.set('facultyId', facultyId);
    if (majorId) params.set('majorId', majorId);
    if (studyStatus !== 'all') params.set('studyStatus', studyStatus);
    if (pubStatus !== 'all') params.set('pubStatus', pubStatus);
    if (deadlineAlert !== 'all') params.set('deadlineAlert', deadlineAlert);
    if (!includeCompleted) params.set('includeCompleted', 'false');
    if (supervisorView) params.set('view', 'supervisor');

    try {
      const data = await apiFetch<{ items: any[] }>(`/api/phd-students?${params.toString()}`);
      setItems(data.items || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, facultyId, majorId, studyStatus, pubStatus, deadlineAlert, includeCompleted, supervisorView]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const popoverFilterCount =
    (facultyId ? 1 : 0) +
    (majorId ? 1 : 0) +
    (studyStatus !== 'all' ? 1 : 0) +
    (pubStatus !== 'all' ? 1 : 0) +
    (deadlineAlert !== 'all' ? 1 : 0) +
    (!includeCompleted ? 1 : 0);

  const hasAnyFilter = Boolean(search.trim()) || popoverFilterCount > 0;

  const resetFilters = () => {
    setSearch('');
    setFacultyId('');
    setMajorId('');
    setStudyStatus('all');
    setPubStatus('all');
    setDeadlineAlert('all');
    setIncludeCompleted(true);
  };

  const resetPopoverFilters = () => {
    setFacultyId('');
    setMajorId('');
    setStudyStatus('all');
    setPubStatus('all');
    setDeadlineAlert('all');
    setIncludeCompleted(true);
  };

  const filteredMajors = facultyId
    ? catalogs.majors.filter((m) => String(m.faculty_id) === String(facultyId))
    : catalogs.majors;

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (facultyId) {
      const f = catalogs.faculties.find((x) => String(x.id) === String(facultyId));
      chips.push({ key: 'fac', label: f?.short_name || f?.name || 'Khoa', onClear: () => { setFacultyId(''); setMajorId(''); } });
    }
    if (majorId) {
      const m = catalogs.majors.find((x) => String(x.id) === String(majorId));
      chips.push({ key: 'maj', label: m?.name || 'Ngành', onClear: () => setMajorId('') });
    }
    if (studyStatus !== 'all') {
      chips.push({ key: 'st', label: STUDY_STATUS_LABELS[studyStatus as StudyStatus] || studyStatus, onClear: () => setStudyStatus('all') });
    }
    if (pubStatus !== 'all') {
      chips.push({ key: 'pub', label: PUB_STATUS_LABELS[pubStatus] || pubStatus, onClear: () => setPubStatus('all') });
    }
    if (deadlineAlert !== 'all') {
      chips.push({ key: 'dl', label: DEADLINE_ALERT_LABELS[deadlineAlert] || deadlineAlert, onClear: () => setDeadlineAlert('all') });
    }
    if (!includeCompleted) {
      chips.push({ key: 'comp', label: 'Ẩn đã kết thúc', onClear: () => setIncludeCompleted(true) });
    }
    return chips;
  }, [facultyId, majorId, studyStatus, pubStatus, deadlineAlert, includeCompleted, catalogs.faculties, catalogs.majors]);

  const buildExportQuery = (withConfidential: boolean) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (facultyId) params.set('facultyId', facultyId);
    if (majorId) params.set('majorId', majorId);
    if (studyStatus !== 'all') params.set('studyStatus', studyStatus);
    if (pubStatus !== 'all') params.set('pubStatus', pubStatus);
    if (deadlineAlert !== 'all') params.set('deadlineAlert', deadlineAlert);
    if (withConfidential) params.set('includeConfidential', 'true');
    return `/api/excel/export/phd-students?${params.toString()}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiFetch('/api/phd-students', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      toast.success(`Đã tạo hồ sơ ${created.full_name}.`);
      setShowCreate(false);
      if (searchParams.get('create')) {
        searchParams.delete('create');
        setSearchParams(searchParams, { replace: true });
      }
      navigate(`/ncs/${created.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'phd_code',
        accessorKey: 'phd_code',
        header: 'Mã NCS',
        meta: { label: 'Mã NCS' },
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="mono text-xs font-semibold text-[#034ea1]">{row.original.phd_code}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{row.original.cohort || '—'}</div>
          </div>
        ),
      },
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: 'Nghiên cứu sinh',
        meta: { label: 'Họ và tên' },
        cell: ({ row }) => (
          <div className="min-w-[155px] leading-tight">
            <div className="font-semibold text-slate-900">{row.original.full_name}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[190px]">
              {row.original.faculty_short_name || row.original.faculty_name || '—'}
            </div>
          </div>
        ),
      },
      {
        id: 'dissertation_title',
        accessorKey: 'dissertation_title',
        header: 'Đề tài & CBHD',
        meta: { label: 'Đề tài & CBHD' },
        cell: ({ row }) => {
          const p = row.original;
          const sups = (p.supervisions || [])
            .map((s: any) => `${s.title_display} ${s.full_name}`.trim())
            .join(', ');
          return (
            <div className="max-w-[300px] leading-snug">
              <div className="text-slate-800 line-clamp-1" title={p.adjusted_dissertation_title || p.dissertation_title}>
                {p.adjusted_dissertation_title || p.dissertation_title || <span className="text-slate-400">Chưa giao đề tài</span>}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate" title={sups}>
                {sups || 'Chưa phân công CBHD'}
              </div>
            </div>
          );
        },
      },
      {
        id: 'study_status',
        accessorKey: 'study_status',
        header: 'Tình trạng',
        meta: { label: 'Tình trạng' },
        cell: ({ row }) => (
          <StatusDot tone={statusTone(row.original.study_status)}>
            {STUDY_STATUS_LABELS[row.original.study_status as StudyStatus] || row.original.study_status}
          </StatusDot>
        ),
      },
      {
        id: 'standard_deadline',
        accessorFn: (r) => r.deadlines?.standard?.daysLeft ?? 99999,
        header: 'Hạn chuẩn',
        meta: { label: 'Hạn chuẩn' },
        cell: ({ row }) => {
          const dl = row.original.deadlines?.standard;
          const urgent = dl?.level === 'overdue' || dl?.level === 'urgent';
          return (
            <div className="leading-tight tabular">
              <div className="mono text-xs text-slate-700">{formatDateVN(row.original.standard_deadline)}</div>
              <div className="mt-0.5">
                {urgent ? (
                  <Tag tone={deadlineTone(dl?.level)}>{dl?.label}</Tag>
                ) : (
                  <span className="text-[11px] text-slate-400">{dl?.label || '—'}</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'max_deadline',
        accessorKey: 'max_deadline',
        header: 'Hạn tối đa',
        meta: { label: 'Hạn tối đa' },
        cell: ({ row }) => <span className="mono text-xs text-slate-600">{formatDateVN(row.original.max_deadline)}</span>,
      },
      {
        id: 'accumulated_credits',
        accessorKey: 'accumulated_credits',
        header: 'Tín chỉ',
        meta: { label: 'Tín chỉ', align: 'right' },
        cell: ({ row }) => <span className="tabular font-medium text-slate-700">{row.original.accumulated_credits ?? 0}</span>,
      },
      {
        id: 'pub_points',
        accessorFn: (r) => r.publicationEvaluation?.totalPoints ?? 0,
        header: 'Công bố 3638',
        meta: { label: 'Công bố 3638', align: 'right' },
        cell: ({ row }) => {
          const ev = row.original.publicationEvaluation;
          const met = ev?.status === 'met';
          return (
            <div className="text-right tabular">
              <span className={met ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-medium text-slate-700'}>
                {ev?.totalPoints ?? 0}đ
              </span>
              <span className="text-[11px] text-slate-400 ml-1.5">{ev?.wosScopusCount ?? 0} WoS</span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/ncs/${row.original.id}`);
            }}
            title="Mở hồ sơ"
          >
            <ArrowUpRight size={14} />
          </Button>
        ),
      },
    ],
    [navigate]
  );

  const drawerStage = computePhdLifecycleStage(selectedPhd);

  return (
    <div className="space-y-5">
      <PageTop
        title={supervisorView ? 'NCS đang hướng dẫn' : 'Nghiên cứu sinh'}
        count={items.length}
        actions={
          isStaff && !supervisorView ? (
            <>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="secondary" leadingIcon={<Download size={14} />}>
                    Excel
                    <ChevronDown size={13} className="text-slate-400" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[230px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg text-xs">
                    <DropdownMenu.Item
                      onSelect={() => downloadBlob(buildExportQuery(false), 'UET_DanhSach_NCS.xlsx').then(() => toast.success('Đã xuất danh sách NCS.'))}
                      className="flex items-center gap-2 px-2.5 py-2 rounded hover:bg-slate-100 text-slate-800 cursor-pointer outline-none"
                    >
                      <Download size={13} className="text-slate-500" />
                      <span>Xuất danh sách chuẩn</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => downloadBlob(buildExportQuery(true), 'UET_DanhSach_NCS_Mat_PBDL.xlsx').then(() => toast.success('Đã xuất file kèm PBĐL.'))}
                      className="flex items-center gap-2 px-2.5 py-2 rounded hover:bg-amber-50 text-amber-900 cursor-pointer outline-none"
                    >
                      <Lock size={13} className="text-amber-700" />
                      <span>Xuất kèm PBĐL (Mật)</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                    <DropdownMenu.Item
                      onSelect={() => navigate('/import')}
                      className="flex items-center gap-2 px-2.5 py-2 rounded hover:bg-slate-100 text-[#034ea1] font-medium cursor-pointer outline-none"
                    >
                      <Upload size={13} />
                      <span>Import từ Excel...</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
                Thêm NCS
              </Button>
            </>
          ) : null
        }
      />

      <DataTable
        data={items}
        columns={columns}
        loading={loading}
        initialColumnVisibility={{ max_deadline: false, accumulated_credits: false }}
        onRowClick={(row) => setSelectedPhd(row)}
        emptyTitle="Không tìm thấy hồ sơ NCS phù hợp"
        emptyAction={
          hasAnyFilter ? (
            <Button size="sm" variant="secondary" leadingIcon={<RotateCcw size={13} />} onClick={resetFilters}>
              Đặt lại bộ lọc
            </Button>
          ) : null
        }
        toolbarLeft={
          <>
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã NCS, họ tên, đề tài..."
                className="!pl-8"
              />
            </div>

            <FilterPopover activeCount={popoverFilterCount} onReset={resetPopoverFilters}>
              <Field label="Khoa / Viện">
                <select value={facultyId} onChange={(e) => { setFacultyId(e.target.value); setMajorId(''); }}>
                  <option value="">Tất cả</option>
                  {catalogs.faculties.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ngành đào tạo">
                <select value={majorId} onChange={(e) => setMajorId(e.target.value)}>
                  <option value="">Tất cả</option>
                  {filteredMajors.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Tình trạng">
                  <select value={studyStatus} onChange={(e) => setStudyStatus(e.target.value)}>
                    <option value="all">Tất cả</option>
                    {Object.entries(STUDY_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Công bố 3638">
                  <select value={pubStatus} onChange={(e) => setPubStatus(e.target.value)}>
                    <option value="all">Tất cả</option>
                    <option value="met">Đã đạt</option>
                    <option value="in_progress">Đang tích lũy</option>
                    <option value="not_met">Chưa có</option>
                  </select>
                </Field>
              </div>
              <Field label="Mốc thời hạn">
                <select value={deadlineAlert} onChange={(e) => setDeadlineAlert(e.target.value)}>
                  <option value="all">Tất cả</option>
                  <option value="overdue">Quá hạn</option>
                  <option value="urgent">Khẩn cấp (≤ 30 ngày)</option>
                  <option value="warning">Sắp hết hạn (≤ 90 ngày)</option>
                </select>
              </Field>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 pt-1 cursor-pointer">
                <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
                Gồm hồ sơ đã kết thúc
              </label>
            </FilterPopover>

            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-slate-100 text-slate-700 text-xs"
              >
                <span>{chip.label}</span>
                <button type="button" onClick={chip.onClear} className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X size={12} />
                </button>
              </span>
            ))}
          </>
        }
      />

      {/* Clean Quick Preview Drawer */}
      <Drawer
        open={Boolean(selectedPhd)}
        onOpenChange={(o) => !o && setSelectedPhd(null)}
        title={selectedPhd?.full_name}
        subtitle={
          selectedPhd
            ? `${selectedPhd.phd_code} · ${selectedPhd.faculty_short_name || selectedPhd.faculty_name || ''} · ${selectedPhd.cohort || ''}`
            : undefined
        }
        headerActions={
          selectedPhd ? (
            <Button size="sm" variant="primary" leadingIcon={<ArrowUpRight size={13} />} onClick={() => navigate(`/ncs/${selectedPhd.id}`)}>
              Mở hồ sơ
            </Button>
          ) : null
        }
        footer={
          selectedPhd ? (
            <>
              <button
                type="button"
                onClick={() => copyValue(selectedPhd.phd_code, 'Mã NCS')}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <Copy size={13} /> Chép mã
              </button>
              <Button variant="primary" size="sm" onClick={() => navigate(`/ncs/${selectedPhd.id}`)}>
                Mở chi tiết
              </Button>
            </>
          ) : null
        }
      >
        {selectedPhd && (
          <div className="space-y-5 text-xs">
            {/* Slim 6-Stage Progress Dots */}
            <ol className="grid grid-cols-3 gap-y-2.5 gap-x-2 pb-4 border-b border-slate-100">
              {PHD_LIFECYCLE_STAGES.map((label, idx) => {
                const done = idx < drawerStage || selectedPhd.is_completed;
                const current = idx === drawerStage && !selectedPhd.is_completed;
                return (
                  <li key={label} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0 ${
                        done
                          ? 'bg-emerald-600 text-white'
                          : current
                            ? 'bg-[#034ea1] text-white'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {done ? <Check size={10} /> : idx + 1}
                    </span>
                    <span className={`truncate ${done ? 'text-slate-700' : current ? 'text-[#034ea1] font-semibold' : 'text-slate-400'}`}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* Deadlines */}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Hạn chuẩn</span>
                <span className="inline-flex items-center gap-2 tabular">
                  <span className="mono text-slate-700">{formatDateVN(selectedPhd.standard_deadline)}</span>
                  <Tag tone={deadlineTone(selectedPhd.deadlines?.standard?.level)}>{selectedPhd.deadlines?.standard?.label}</Tag>
                </span>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Hạn tối đa</span>
                <span className="mono text-slate-700">{formatDateVN(selectedPhd.max_deadline)}</span>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Xét lại CĐR NN</span>
                <span className="inline-flex items-center gap-2 tabular">
                  <span className="mono text-slate-700">{formatDateVN(selectedPhd.output_fl_review_deadline)}</span>
                  <Tag tone={deadlineTone(selectedPhd.deadlines?.outputFlReview?.level)}>{selectedPhd.deadlines?.outputFlReview?.label}</Tag>
                </span>
              </div>
              {isStaff && selectedPhd.deadlines?.irDue?.date && (
                <div className="px-3.5 py-2.5 flex items-center justify-between bg-amber-50/40">
                  <span className="text-amber-900 font-medium inline-flex items-center gap-1">
                    <Lock size={11} /> Hạn PBĐL
                  </span>
                  <span className="inline-flex items-center gap-2 tabular">
                    <span className="mono text-amber-900">{formatDateVN(selectedPhd.ir_due_date)}</span>
                    <Tag tone={deadlineTone(selectedPhd.deadlines.irDue.level)}>{selectedPhd.deadlines.irDue.label}</Tag>
                  </span>
                </div>
              )}
            </div>

            {/* Dissertation & Supervisors */}
            <div className="space-y-2">
              <div className="text-[11px] font-medium text-slate-400">Đề tài & CBHD</div>
              <div className="text-slate-900 font-medium leading-relaxed">
                {selectedPhd.adjusted_dissertation_title || selectedPhd.dissertation_title || 'Chưa giao đề tài.'}
              </div>
              <div className="divide-y divide-slate-100">
                {(selectedPhd.supervisions || []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-1.5">
                    <span className="text-slate-800">{s.title_display} {s.full_name}</span>
                    <span className="text-slate-400">{SUPERVISION_ROLE_LABELS[s.role as SupervisionRole] || s.role}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Facts */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-slate-100">
              <div>
                <dt className="text-[11px] text-slate-400">Công bố 3638</dt>
                <dd className="font-semibold text-slate-900 tabular mt-0.5">
                  {selectedPhd.publicationEvaluation?.totalPoints ?? 0}đ · {selectedPhd.publicationEvaluation?.wosScopusCount ?? 0} WoS
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Tín chỉ</dt>
                <dd className="font-semibold text-slate-900 tabular mt-0.5">{selectedPhd.accumulated_credits ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">QĐ Công nhận</dt>
                <dd className="mono text-slate-700 mt-0.5">{selectedPhd.admission_decision_no || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Đơn vị</dt>
                <dd className="text-slate-700 mt-0.5">{selectedPhd.work_unit || '—'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Drawer>

      {/* Create NCS Modal */}
      <Modal
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Thêm Nghiên cứu sinh"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button type="submit" form="create-phd-form" variant="primary" disabled={creating}>
              {creating ? 'Đang tạo...' : 'Tạo hồ sơ'}
            </Button>
          </>
        }
      >
        <form id="create-phd-form" onSubmit={handleCreate} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mã NCS" required>
              <input required value={createForm.phd_code} onChange={(e) => setCreateForm({ ...createForm, phd_code: e.target.value })} placeholder="NCS260101" />
            </Field>
            <Field label="Họ và tên" required>
              <input required value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </Field>
            <Field label="Điện thoại">
              <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
            </Field>
            <Field label="Khoa / Viện">
              <select value={createForm.faculty_id} onChange={(e) => setCreateForm({ ...createForm, faculty_id: e.target.value, major_id: '' })}>
                <option value="">Chọn Khoa / Viện</option>
                {catalogs.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Ngành đào tạo">
              <select value={createForm.major_id} onChange={(e) => setCreateForm({ ...createForm, major_id: e.target.value })}>
                <option value="">Chọn Ngành</option>
                {catalogs.majors
                  .filter((m) => !createForm.faculty_id || String(m.faculty_id) === String(createForm.faculty_id))
                  .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Khóa / Đợt">
              <input value={createForm.cohort} onChange={(e) => setCreateForm({ ...createForm, cohort: e.target.value })} />
            </Field>
            <Field label="Đối tượng">
              <input value={createForm.admission_category} onChange={(e) => setCreateForm({ ...createForm, admission_category: e.target.value })} />
            </Field>
            <Field label="Bắt đầu đào tạo">
              <input type="date" value={createForm.training_start_date} onChange={(e) => setCreateForm({ ...createForm, training_start_date: e.target.value })} />
            </Field>
            <Field label="Hạn đào tạo chuẩn">
              <input type="date" value={createForm.standard_deadline} onChange={(e) => setCreateForm({ ...createForm, standard_deadline: e.target.value })} />
            </Field>
          </div>
          <Field label="Tên đề tài dự kiến">
            <textarea rows={2} value={createForm.dissertation_title} onChange={(e) => setCreateForm({ ...createForm, dissertation_title: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
