import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ChevronDown,
  Copy,
  Download,
  Edit3,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AUTHOR_ROLE_LABELS,
  calculatePublicationPoint,
  DEFAULT_REGULATION_3638_CONFIG,
  PUBLICATION_TYPE_LABELS,
} from '../../shared/regulation3638';
import type { AuthUser, AuthorRole, PublicationType } from '../../shared/types';
import type { AppCatalogs } from '../App';
import { apiFetch, downloadBlob } from '../shared/api';
import { copyValue } from '../shared/format';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  Field,
  FilterPopover,
  Modal,
  PageTop,
  StatusDot,
  UnderlineTabs,
} from '../shared/ui';

type ListTab = 'supervisor' | 'seminar' | 'independent_reviewer' | 'defense_council' | 'all';

const EMPTY_SCI_FORM = {
  full_name: '',
  academic_rank: 'PGS',
  academic_degree: 'TS',
  recognition_year: '',
  specialization: '',
  work_unit: '',
  is_internal: true,
  email: '',
  phone: '',
  bank_account: '',
  bank_name: '',
  cccd: '',
  tax_code: '',
  is_supervisor: true,
  is_seminar_member: false,
  is_independent_reviewer: false,
  is_defense_council_member: false,
  special_quota_approved: false,
  special_quota_limit: '',
  special_quota_reason: '',
  special_quota_decision: '',
  has_major_grant_scholarship: false,
  notes: '',
};

const QUOTA_LABELS: Record<string, string> = {
  ok: 'Quota hợp lệ',
  near_limit: 'Cận định mức',
  over_limit: 'Vượt định mức',
};

export function ScientistsPage({ user: _user, catalogs }: { user: AuthUser; catalogs: AppCatalogs }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as ListTab) || 'supervisor';
  const [tab, setTab] = useState<ListTab>(initialTab);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [isInternal, setIsInternal] = useState('');
  const [quotaStatus, setQuotaStatus] = useState('all');
  const [meets3638, setMeets3638] = useState('all');

  const [selectedSci, setSelectedSci] = useState<any | null>(null);
  const [editingSci, setEditingSci] = useState<any | null>(null);
  const [form, setForm] = useState<any>(EMPTY_SCI_FORM);
  const [saving, setSaving] = useState(false);

  const [pubForm, setPubForm] = useState({
    title: '',
    venue: '',
    pub_year: String(new Date().getFullYear()),
    pub_type: 'wos_q1' as PublicationType,
    author_role: 'corresponding' as AuthorRole,
    hdgsnn_max_point: '',
    doi_url: '',
  });
  const [savingPub, setSavingPub] = useState(false);
  const [deletePubTarget, setDeletePubTarget] = useState<{ id: number; title: string } | null>(null);

  const regConfig = catalogs.regulationConfig || DEFAULT_REGULATION_3638_CONFIG;

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ listType: tab });
    if (search.trim()) params.set('search', search.trim());
    if (isInternal) params.set('isInternal', isInternal);
    if (tab === 'supervisor' && quotaStatus !== 'all') params.set('quotaStatus', quotaStatus);
    if (meets3638 !== 'all') params.set('meets3638', meets3638);
    try {
      const data = await apiFetch<{ items: any[] }>(`/api/scientists?${params.toString()}`);
      setItems(data.items || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, search, isInternal, quotaStatus, meets3638]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const switchTab = (next: ListTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const popoverFilterCount =
    (isInternal ? 1 : 0) +
    (tab === 'supervisor' && quotaStatus !== 'all' ? 1 : 0) +
    (meets3638 !== 'all' ? 1 : 0);

  const resetPopoverFilters = () => {
    setIsInternal('');
    setQuotaStatus('all');
    setMeets3638('all');
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (isInternal) chips.push({ key: 'int', label: isInternal === '1' ? 'Trong UET' : 'Ngoài Trường', onClear: () => setIsInternal('') });
    if (tab === 'supervisor' && quotaStatus !== 'all') {
      chips.push({ key: 'q', label: QUOTA_LABELS[quotaStatus] || quotaStatus, onClear: () => setQuotaStatus('all') });
    }
    if (meets3638 !== 'all') {
      chips.push({ key: 'm', label: meets3638 === 'yes' ? 'Đạt 3638' : 'Chưa đạt 3638', onClear: () => setMeets3638('all') });
    }
    return chips;
  }, [isInternal, quotaStatus, meets3638, tab]);

  const openCreateModal = () => {
    setEditingSci({ isNew: true });
    setForm({
      ...EMPTY_SCI_FORM,
      is_supervisor: tab === 'supervisor' || tab === 'all',
      is_seminar_member: tab === 'seminar',
      is_independent_reviewer: tab === 'independent_reviewer',
      is_defense_council_member: tab === 'defense_council',
    });
  };

  const openEditModal = (s: any) => {
    setEditingSci(s);
    setForm({
      full_name: s.full_name || '',
      academic_rank: s.academic_rank || '',
      academic_degree: s.academic_degree || '',
      recognition_year: s.recognition_year ? String(s.recognition_year) : '',
      specialization: s.specialization || '',
      work_unit: s.work_unit || '',
      is_internal: Boolean(s.is_internal),
      email: s.email || '',
      phone: s.phone || '',
      bank_account: s.bank_account || '',
      bank_name: s.bank_name || '',
      cccd: s.cccd || '',
      tax_code: s.tax_code || '',
      is_supervisor: Boolean(s.is_supervisor),
      is_seminar_member: Boolean(s.is_seminar_member),
      is_independent_reviewer: Boolean(s.is_independent_reviewer),
      is_defense_council_member: Boolean(s.is_defense_council_member),
      special_quota_approved: Boolean(s.special_quota_approved),
      special_quota_limit: s.special_quota_limit ? String(s.special_quota_limit) : '',
      special_quota_reason: s.special_quota_reason || '',
      special_quota_decision: s.special_quota_decision || '',
      has_major_grant_scholarship: Boolean(s.has_major_grant_scholarship),
      notes: s.notes || '',
    });
  };

  const handleSaveScientist = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let saved: any;
      if (editingSci?.isNew) {
        saved = await apiFetch('/api/scientists', { method: 'POST', body: JSON.stringify(form) });
        toast.success(`Đã thêm ${saved.title_display} ${saved.full_name}.`);
      } else {
        saved = await apiFetch(`/api/scientists/${editingSci.id}`, { method: 'PUT', body: JSON.stringify(form) });
        toast.success('Đã cập nhật hồ sơ cán bộ.');
        if (selectedSci?.id === saved.id) setSelectedSci(saved);
      }
      setEditingSci(null);
      await loadList();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSci) return;
    setSavingPub(true);
    try {
      const updated = await apiFetch(`/api/scientists/${selectedSci.id}/publications`, {
        method: 'POST',
        body: JSON.stringify({
          ...pubForm,
          pub_year: Number(pubForm.pub_year),
          hdgsnn_max_point: pubForm.hdgsnn_max_point === '' ? null : Number(pubForm.hdgsnn_max_point),
        }),
      });
      setSelectedSci(updated);
      setPubForm({ ...pubForm, title: '', venue: '', doi_url: '', hdgsnn_max_point: '' });
      toast.success('Đã thêm công bố.');
      await loadList();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingPub(false);
    }
  };

  const previewPoint = calculatePublicationPoint(
    {
      pubType: pubForm.pub_type,
      authorRole: pubForm.author_role,
      hdgsnnMaxPoint: pubForm.hdgsnn_max_point === '' ? null : Number(pubForm.hdgsnn_max_point),
    },
    regConfig
  );

  const columns = useMemo<ColumnDef<any>[]>(() => {
    const base: ColumnDef<any>[] = [
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: 'Họ và tên',
        meta: { label: 'Họ và tên' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="leading-tight min-w-[180px]">
              <div className="font-semibold text-slate-900">
                <span className="text-slate-500 font-normal mr-1">{s.title_display}</span>
                {s.full_name}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {s.is_internal ? 'Trong UET' : 'Ngoài Trường'}
              </div>
            </div>
          );
        },
      },
      {
        id: 'work_unit',
        accessorKey: 'work_unit',
        header: 'Chuyên ngành & Đơn vị',
        meta: { label: 'Đơn vị công tác' },
        cell: ({ row }) => (
          <div className="max-w-[260px] leading-snug">
            <div className="text-slate-800 truncate">{row.original.specialization || '—'}</div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{row.original.work_unit || '—'}</div>
          </div>
        ),
      },
      {
        id: 'contact',
        accessorKey: 'email',
        header: 'Liên hệ',
        meta: { label: 'Liên hệ' },
        cell: ({ row }) => (
          <div className="leading-tight text-xs">
            <div className="text-slate-700">{row.original.email || '—'}</div>
            <div className="mono text-[11px] text-slate-400 mt-0.5">{row.original.phone || '—'}</div>
          </div>
        ),
      },
      {
        id: 'payment',
        accessorKey: 'bank_account',
        header: 'Thanh toán',
        meta: { label: 'CCCD / MST / STK' },
        cell: ({ row }) => (
          <div className="leading-tight mono text-[11px] text-slate-600">
            <div>{row.original.bank_account || '—'} {row.original.bank_name ? `· ${row.original.bank_name}` : ''}</div>
            <div className="text-slate-400 mt-0.5">{row.original.cccd || '—'} · {row.original.tax_code || '—'}</div>
          </div>
        ),
      },
    ];

    if (tab === 'supervisor' || tab === 'all') {
      base.push({
        id: 'quota',
        accessorFn: (r) => r.quotaEvaluation?.equivalentLoad ?? 0,
        header: 'Quota & Giờ',
        meta: { label: 'Quota & Giờ chuẩn' },
        cell: ({ row }) => {
          const q = row.original.quotaEvaluation;
          const pct = q.effectiveQuota > 0 ? Math.min(100, Math.round((q.equivalentLoad / q.effectiveQuota) * 100)) : 0;
          const barColor = q.status === 'over_limit' ? 'bg-rose-600' : q.status === 'near_limit' ? 'bg-amber-500' : 'bg-[#034ea1]';
          return (
            <div className="min-w-[125px] tabular">
              <div className="flex items-center justify-between text-xs">
                <span className={q.status === 'over_limit' ? 'font-semibold text-rose-700' : 'font-semibold text-slate-900'}>
                  {q.equivalentLoad} / {q.effectiveQuota}
                </span>
                <span className="text-[#034ea1] font-medium">{q.standardHours}g</span>
              </div>
              <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        },
      });
    }

    base.push(
      {
        id: 'points_3638',
        accessorFn: (r) => r.researchEvaluation?.totalPoints ?? 0,
        header: `Điểm 3638 (${regConfig.scientistWindowYears}n)`,
        meta: { label: 'Điểm NCKH 3638', align: 'right' },
        cell: ({ row }) => {
          const r = row.original.researchEvaluation;
          const meets =
            tab === 'seminar'
              ? r.meetsSeminar
              : tab === 'independent_reviewer'
                ? r.meetsReviewer
                : tab === 'defense_council'
                  ? r.meetsCouncil
                  : r.meetsSupervisor;
          return (
            <div className="text-right tabular">
              <span className={meets ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-amber-800'}>
                {r.totalPoints}đ
              </span>
              <span className="text-[11px] text-slate-400 ml-1.5">{r.wosScopusInWindow} WoS</span>
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
              openEditModal(row.original);
            }}
            title="Sửa hồ sơ"
          >
            <Edit3 size={13} />
          </Button>
        ),
      }
    );

    return base;
  }, [tab, regConfig.scientistWindowYears]);

  return (
    <div className="space-y-5">
      <PageTop
        title="Cán bộ & Hội đồng"
        count={items.length}
        actions={
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="secondary" leadingIcon={<Download size={14} />}>
                  Xuất Excel
                  <ChevronDown size={13} className="text-slate-400" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[230px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg text-xs">
                  <DropdownMenu.Item
                    onSelect={() => downloadBlob('/api/excel/export/supervisor-quota', 'UET_Quota_GioHuongDan_CBHD.xlsx').then(() => toast.success('Đã xuất bảng Quota.'))}
                    className="flex items-center gap-2 px-2.5 py-2 rounded hover:bg-slate-100 text-slate-800 cursor-pointer outline-none"
                  >
                    <Download size={13} className="text-[#034ea1]" />
                    <span>Quota & Giờ hướng dẫn</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => downloadBlob(`/api/excel/export/scientists?listType=${tab}`, `UET_CanBo_ThanhToan_${tab}.xlsx`).then(() => toast.success('Đã xuất bảng kê thanh toán.'))}
                    className="flex items-center gap-2 px-2.5 py-2 rounded hover:bg-slate-100 text-slate-800 cursor-pointer outline-none"
                  >
                    <Download size={13} className="text-slate-500" />
                    <span>Bảng kê thanh toán (STK, MST)</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={openCreateModal}>
              Thêm Cán bộ
            </Button>
          </>
        }
      />

      <UnderlineTabs<ListTab>
        value={tab}
        onChange={switchTab}
        items={[
          { value: 'supervisor', label: 'CBHD' },
          { value: 'seminar', label: 'HĐ Seminar' },
          { value: 'independent_reviewer', label: 'Phản biện ĐL', icon: <Lock size={12} className="text-amber-700" /> },
          { value: 'defense_council', label: 'HĐ Đánh giá LATS' },
          { value: 'all', label: 'Tất cả' },
        ]}
      />

      <DataTable
        data={items}
        columns={columns}
        loading={loading}
        initialColumnVisibility={{ payment: false }}
        onRowClick={(s) => setSelectedSci(s)}
        emptyTitle="Không có cán bộ phù hợp"
        emptyAction={
          search || popoverFilterCount > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<RotateCcw size={12} />}
              onClick={() => {
                setSearch('');
                resetPopoverFilters();
              }}
            >
              Đặt lại bộ lọc
            </Button>
          ) : null
        }
        toolbarLeft={
          <>
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm họ tên, chuyên ngành, đơn vị..." className="!pl-8" />
            </div>

            <FilterPopover activeCount={popoverFilterCount} onReset={resetPopoverFilters} widthClass="w-[min(300px,90vw)]">
              <Field label="Phân loại">
                <select value={isInternal} onChange={(e) => setIsInternal(e.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="1">Cán bộ UET</option>
                  <option value="0">Ngoài Trường</option>
                </select>
              </Field>
              {tab === 'supervisor' && (
                <Field label="Trạng thái Quota">
                  <select value={quotaStatus} onChange={(e) => setQuotaStatus(e.target.value)}>
                    <option value="all">Tất cả</option>
                    <option value="ok">Hợp lệ</option>
                    <option value="near_limit">Cận định mức</option>
                    <option value="over_limit">Vượt định mức</option>
                  </select>
                </Field>
              )}
              <Field label="Chuẩn NCKH 3638">
                <select value={meets3638} onChange={(e) => setMeets3638(e.target.value)}>
                  <option value="all">Tất cả</option>
                  <option value="yes">Đạt chuẩn</option>
                  <option value="no">Chưa đạt</option>
                </select>
              </Field>
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

            {tab === 'independent_reviewer' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 ml-1">
                <Lock size={11} /> Nội bộ CTSV
              </span>
            )}
          </>
        }
      />

      {/* Slide-over Scientist Detail Drawer */}
      <Drawer
        open={Boolean(selectedSci)}
        onOpenChange={(o) => !o && setSelectedSci(null)}
        title={selectedSci ? `${selectedSci.title_display} ${selectedSci.full_name}` : ''}
        subtitle={selectedSci?.work_unit || selectedSci?.specialization}
        headerActions={
          selectedSci ? (
            <Button size="sm" variant="secondary" leadingIcon={<Edit3 size={12} />} onClick={() => openEditModal(selectedSci)}>
              Sửa
            </Button>
          ) : null
        }
      >
        {selectedSci && (
          <div className="space-y-5 text-xs">
            {/* Payment & Contact with 1-Click Copy */}
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {[
                { label: 'Email', value: selectedSci.email },
                { label: 'Điện thoại', value: selectedSci.phone },
                { label: 'Số tài khoản', value: selectedSci.bank_account, extra: selectedSci.bank_name },
                { label: 'Số CCCD', value: selectedSci.cccd },
                { label: 'Mã số thuế', value: selectedSci.tax_code },
              ].map((row) => (
                <div key={row.label} className="px-3.5 py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-500">{row.label}</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="mono font-medium text-slate-900 truncate">
                      {row.value || '—'} {row.extra ? `(${row.extra})` : ''}
                    </span>
                    {row.value && (
                      <button
                        type="button"
                        onClick={() => copyValue(row.value, row.label)}
                        className="p-1 text-slate-400 hover:text-[#034ea1] cursor-pointer"
                        title={`Chép ${row.label}`}
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quota & 3638 Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500">Quota & Giờ chuẩn</div>
                <div className="mt-1 font-display text-lg font-semibold text-slate-900 tabular">
                  {selectedSci.quotaEvaluation.equivalentLoad} / {selectedSci.quotaEvaluation.effectiveQuota}
                  <span className="text-xs font-medium text-[#034ea1] ml-1.5">{selectedSci.quotaEvaluation.standardHours}g</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 tabular">
                  ĐL {selectedSci.quotaEvaluation.countsByRole.independent} · C {selectedSci.quotaEvaluation.countsByRole.primary} · P {selectedSci.quotaEvaluation.countsByRole.secondary} · Đ {selectedSci.quotaEvaluation.countsByRole.co}
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500">
                  Điểm 3638 ({selectedSci.researchEvaluation.fromYear}–{selectedSci.researchEvaluation.toYear})
                </div>
                <div className="mt-1 font-display text-lg font-semibold text-[#034ea1] tabular">
                  {selectedSci.researchEvaluation.totalPoints}đ
                </div>
                <div className="text-[11px] text-slate-400 mt-1 tabular">
                  {selectedSci.researchEvaluation.wosScopusInWindow} WoS/Scopus
                  {selectedSci.researchEvaluation.excellentByPublications ? ' · Xuất sắc 3 năm' : ''}
                </div>
              </div>
            </div>

            {/* Role Eligibility */}
            <div className="grid grid-cols-2 gap-2">
              <StatusDot tone={selectedSci.researchEvaluation.meetsSupervisor ? 'success' : 'warning'}>CBHD (≥ {regConfig.supervisorMinPoints}đ)</StatusDot>
              <StatusDot tone={selectedSci.researchEvaluation.meetsSeminar ? 'success' : 'warning'}>Seminar (≥ {regConfig.seminarMinPoints}đ)</StatusDot>
              <StatusDot tone={selectedSci.researchEvaluation.meetsReviewer ? 'success' : 'warning'}>PBĐL (≥ {regConfig.reviewerMinPoints}đ)</StatusDot>
              <StatusDot tone={selectedSci.researchEvaluation.meetsCouncil ? 'success' : 'warning'}>HĐ LATS (≥ {regConfig.councilMinPoints}đ)</StatusDot>
            </div>

            {/* Inline Add Publication */}
            <form onSubmit={handleAddPub} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Thêm bài báo</span>
                <span className="mono font-semibold text-[#034ea1]">+{previewPoint}đ</span>
              </div>
              <input required placeholder="Tên bài báo..." value={pubForm.title} onChange={(e) => setPubForm({ ...pubForm, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select value={pubForm.pub_type} onChange={(e) => setPubForm({ ...pubForm, pub_type: e.target.value as PublicationType })}>
                  {Object.entries(PUBLICATION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={pubForm.author_role} onChange={(e) => setPubForm({ ...pubForm, author_role: e.target.value as AuthorRole })}>
                  {Object.entries(AUTHOR_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="number" required placeholder="Năm" value={pubForm.pub_year} onChange={(e) => setPubForm({ ...pubForm, pub_year: e.target.value })} />
                <input placeholder="Tạp chí / Hội nghị" value={pubForm.venue} onChange={(e) => setPubForm({ ...pubForm, venue: e.target.value })} />
              </div>
              <Button type="submit" size="sm" variant="primary" disabled={savingPub} className="w-full">
                {savingPub ? 'Đang thêm...' : 'Thêm công bố'}
              </Button>
            </form>

            {/* Publications List */}
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-2">
                Công bố ({selectedSci.publications?.length || 0})
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {(selectedSci.publications || []).length === 0 ? (
                  <div className="p-4 text-center text-slate-400">Chưa có công bố.</div>
                ) : (
                  selectedSci.publications.map((p: any) => (
                    <div key={p.id} className="px-3.5 py-2.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 leading-snug">{p.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          <span className="mono">{p.pub_year}</span> · {p.venue || '—'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="mono font-semibold text-[#034ea1]">{p.calculated_point}đ</span>
                        <button
                          type="button"
                          onClick={() => setDeletePubTarget({ id: p.id, title: p.title })}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal Create / Edit Scientist */}
      <Modal
        open={Boolean(editingSci)}
        onOpenChange={(o) => !o && setEditingSci(null)}
        title={editingSci?.isNew ? 'Thêm Cán bộ / Nhà khoa học' : `Sửa: ${editingSci?.full_name || ''}`}
        widthClass="w-[min(720px,95vw)]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingSci(null)}>Hủy</Button>
            <Button type="submit" form="scientist-form" variant="primary" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </>
        }
      >
        <form id="scientist-form" onSubmit={handleSaveScientist} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Họ và Tên" required className="sm:col-span-2">
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Năm công nhận">
              <input type="number" value={form.recognition_year} onChange={(e) => setForm({ ...form, recognition_year: e.target.value })} placeholder="2020" />
            </Field>
            <Field label="Học hàm">
              <select value={form.academic_rank} onChange={(e) => setForm({ ...form, academic_rank: e.target.value })}>
                <option value="">Không có</option>
                <option value="GS">Giáo sư (7 NCS)</option>
                <option value="PGS">Phó Giáo sư (5 NCS)</option>
              </select>
            </Field>
            <Field label="Học vị">
              <select value={form.academic_degree} onChange={(e) => setForm({ ...form, academic_degree: e.target.value })}>
                <option value="TS">Tiến sĩ (3 NCS)</option>
                <option value="TSKH">Tiến sĩ khoa học (5 NCS)</option>
                <option value="ThS">Thạc sĩ</option>
                <option value="">Khác</option>
              </select>
            </Field>
            <Field label="Phân loại">
              <select value={form.is_internal ? '1' : '0'} onChange={(e) => setForm({ ...form, is_internal: e.target.value === '1' })}>
                <option value="1">Trong UET</option>
                <option value="0">Ngoài Trường</option>
              </select>
            </Field>
            <Field label="Chuyên ngành" className="sm:col-span-3">
              <input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            </Field>
            <Field label="Đơn vị công tác" className="sm:col-span-3">
              <input value={form.work_unit} onChange={(e) => setForm({ ...form, work_unit: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Điện thoại">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Số CCCD">
              <input value={form.cccd} onChange={(e) => setForm({ ...form, cccd: e.target.value })} />
            </Field>
            <Field label="Mã số thuế TNCN">
              <input value={form.tax_code} onChange={(e) => setForm({ ...form, tax_code: e.target.value })} />
            </Field>
            <Field label="Số tài khoản">
              <input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
            </Field>
            <Field label="Ngân hàng">
              <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </Field>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-4 text-xs">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.is_supervisor} onChange={(e) => setForm({ ...form, is_supervisor: e.target.checked })} />
              CBHD
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.is_seminar_member} onChange={(e) => setForm({ ...form, is_seminar_member: e.target.checked })} />
              HĐ Seminar
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.is_independent_reviewer} onChange={(e) => setForm({ ...form, is_independent_reviewer: e.target.checked })} />
              Phản biện ĐL
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.is_defense_council_member} onChange={(e) => setForm({ ...form, is_defense_council_member: e.target.checked })} />
              HĐ Đánh giá LATS
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-2.5 text-xs">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.has_major_grant_scholarship} onChange={(e) => setForm({ ...form, has_major_grant_scholarship: e.target.checked })} />
                Chủ trì đề tài cấp học bổng NCS
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-[#034ea1]">
                <input type="checkbox" checked={form.special_quota_approved} onChange={(e) => setForm({ ...form, special_quota_approved: e.target.checked })} />
                Đã duyệt tăng định mức (GĐ ĐHQGHN)
              </label>
            </div>
            {form.special_quota_approved && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <Field label="Trần mới (NCS)">
                  <input type="number" step="0.5" value={form.special_quota_limit} onChange={(e) => setForm({ ...form, special_quota_limit: e.target.value })} />
                </Field>
                <Field label="Số QĐ phê duyệt">
                  <input value={form.special_quota_decision} onChange={(e) => setForm({ ...form, special_quota_decision: e.target.value })} />
                </Field>
                <Field label="Lý do">
                  <input value={form.special_quota_reason} onChange={(e) => setForm({ ...form, special_quota_reason: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletePubTarget)}
        onOpenChange={(o) => !o && setDeletePubTarget(null)}
        title="Xóa công bố"
        description={`Xóa "${deletePubTarget?.title || ''}" khỏi danh mục?`}
        danger
        confirmLabel="Xóa"
        onConfirm={async () => {
          if (!selectedSci || !deletePubTarget) return;
          const updated = await apiFetch(`/api/scientists/${selectedSci.id}/publications/${deletePubTarget.id}`, { method: 'DELETE' });
          setSelectedSci(updated);
          toast.success('Đã xóa công bố.');
          await loadList();
        }}
      />
    </div>
  );
}
