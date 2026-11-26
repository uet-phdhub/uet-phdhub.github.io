import { Bell, CheckCircle2, Plus, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { AuthUser, ChangeRequestType } from '../../shared/types';
import { apiFetch } from '../shared/api';
import { formatDateTimeVN, formatDateVN } from '../shared/format';
import { Button, Drawer, Field, Modal, PageTop, Panel, StatusDot, Tag, UnderlineTabs, type StatusTone } from '../shared/ui';

type MainTab = 'requests' | 'cycles';

const TYPE_OPTIONS: Array<{ value: ChangeRequestType; label: string }> = [
  { value: 'extension', label: 'Gia hạn thời gian đào tạo' },
  { value: 'deferral', label: 'Bảo lưu / Tạm dừng đào tạo' },
  { value: 'topic_change', label: 'Điều chỉnh tên đề tài LATS' },
  { value: 'supervisor_change', label: 'Thay đổi Cán bộ hướng dẫn' },
  { value: 'special_quota', label: 'Đề nghị tăng định mức CBHD (Quota)' },
];

function reqStatusTone(st: string): StatusTone {
  if (st === 'approved') return 'success';
  if (st === 'rejected') return 'error';
  if (st === 'needs_revision') return 'warning';
  return 'info';
}

export function RequestsPage({ user, onChanged }: { user: AuthUser; onChanged: () => Promise<void> }) {
  const [searchParams] = useSearchParams();
  const isStaff = user.role === 'admin' || user.role === 'staff';
  const [tab, setTab] = useState<MainTab>('requests');

  // Electronic Requests State
  const [requests, setRequests] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  const [phds, setPhds] = useState<any[]>([]);
  const [scientists, setScientists] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(Boolean(searchParams.get('new')));
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    request_type: ((searchParams.get('new') as ChangeRequestType) ||
      (user.role === 'supervisor' ? 'special_quota' : 'extension')) as ChangeRequestType,
    phd_student_id: user.phd_student_id ? String(user.phd_student_id) : '',
    scientist_id: user.scientist_id ? String(user.scientist_id) : '',
    reason: '',
    evidence_url: '',
    new_standard_deadline: '',
    new_dissertation_title: '',
    requested_quota_limit: '9',
  });

  // Decision / review form inside drawer
  const [reviewComment, setReviewComment] = useState('');
  const [decisionNo, setDecisionNo] = useState('');
  const [decisionDate, setDecisionDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Reporting Cycles State (Admin)
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [cycleSummary, setCycleSummary] = useState<any | null>(null);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    term_code: 'HK1-2026-2027',
    title: 'Báo cáo tiến độ HK1 năm học 2026–2027',
    open_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    notes: '',
  });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const data = await apiFetch<{ items: any[] }>(`/api/requests${qs}`);
      setRequests(data.items || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadCycles = useCallback(async () => {
    if (!isStaff) return;
    try {
      const data = await apiFetch<{ items: any[] }>('/api/reporting-cycles');
      const list = data.items || [];
      setCycles(list);
      if (list.length > 0 && !selectedCycleId) {
        setSelectedCycleId(Number(list[0].id));
      }
    } catch {}
  }, [isStaff, selectedCycleId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (tab === 'cycles' && isStaff) {
      loadCycles();
    }
  }, [tab, isStaff, loadCycles]);

  useEffect(() => {
    if (!selectedCycleId || !isStaff) return;
    apiFetch(`/api/reporting-cycles/${selectedCycleId}/summary`)
      .then(setCycleSummary)
      .catch(() => {});
  }, [selectedCycleId, isStaff]);

  useEffect(() => {
    if (!showCreate) return;
    if (isStaff || user.role === 'supervisor') {
      apiFetch<{ items: any[] }>('/api/phd-students').then((d) => setPhds(d.items || [])).catch(() => {});
    }
    if (isStaff) {
      apiFetch<{ items: any[] }>('/api/scientists?listType=supervisor').then((d) => setScientists(d.items || [])).catch(() => {});
    }
  }, [showCreate, isStaff, user.role]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload: Record<string, any> = {};
      if (createForm.request_type === 'extension' || createForm.request_type === 'deferral') {
        payload.new_standard_deadline = createForm.new_standard_deadline;
      } else if (createForm.request_type === 'topic_change') {
        payload.new_dissertation_title = createForm.new_dissertation_title;
      } else if (createForm.request_type === 'special_quota') {
        payload.requested_quota_limit = Number(createForm.requested_quota_limit) || 7;
      }

      await apiFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          request_type: createForm.request_type,
          phd_student_id: createForm.phd_student_id ? Number(createForm.phd_student_id) : null,
          scientist_id: createForm.scientist_id ? Number(createForm.scientist_id) : null,
          reason: createForm.reason,
          evidence_url: createForm.evidence_url,
          payload,
        }),
      });
      toast.success('Đã gửi yêu cầu phê duyệt.');
      setShowCreate(false);
      setCreateForm((prev) => ({ ...prev, reason: '', evidence_url: '', new_dissertation_title: '' }));
      await loadRequests();
      await onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSupervisorReview = async (action: 'supervisor_approved' | 'needs_revision') => {
    if (!selectedReq) return;
    setSubmittingDecision(true);
    try {
      await apiFetch(`/api/requests/${selectedReq.id}/supervisor-review`, {
        method: 'PUT',
        body: JSON.stringify({ action, comment: reviewComment }),
      });
      toast.success(action === 'supervisor_approved' ? 'Đã xác nhận và chuyển Phòng CTSV.' : 'Đã gửi yêu cầu bổ sung.');
      setSelectedReq(null);
      setReviewComment('');
      await loadRequests();
      await onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleAdminDecision = async (decision: 'approved' | 'rejected' | 'needs_revision') => {
    if (!selectedReq) return;
    setSubmittingDecision(true);
    try {
      const res = await apiFetch(`/api/requests/${selectedReq.id}/decision`, {
        method: 'PUT',
        body: JSON.stringify({
          decision,
          admin_comment: reviewComment,
          decision_no: decisionNo,
          decision_date: decisionDate,
        }),
      });
      toast.success(
        decision === 'approved'
          ? `Đã phê duyệt. ${res.appliedSummary || ''}`
          : decision === 'rejected'
            ? 'Đã từ chối yêu cầu.'
            : 'Đã gửi yêu cầu bổ sung.'
      );
      setSelectedReq(null);
      setReviewComment('');
      setDecisionNo('');
      await loadRequests();
      await onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiFetch('/api/reporting-cycles', {
        method: 'POST',
        body: JSON.stringify(cycleForm),
      });
      toast.success(`Đã mở đợt ${created.term_code}.`);
      setShowNewCycle(false);
      await loadCycles();
      setSelectedCycleId(Number(created.id));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemindMissing = async () => {
    if (!selectedCycleId) return;
    try {
      const res = await apiFetch(`/api/reporting-cycles/${selectedCycleId}/remind`, { method: 'POST' });
      toast.success(`Đã gửi nhắc nộp tới ${res.reminded} NCS chưa báo cáo.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <PageTop
        title={isStaff ? 'Phê duyệt & Đợt báo cáo' : 'Yêu cầu điện tử'}
        actions={
          tab === 'requests' ? (
            <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              Tạo yêu cầu
            </Button>
          ) : isStaff ? (
            <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setShowNewCycle(true)}>
              Mở đợt báo cáo
            </Button>
          ) : null
        }
      />

      {isStaff && (
        <UnderlineTabs<MainTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'requests', label: 'Yêu cầu phê duyệt', count: requests.filter((r) => r.status === 'submitted' || r.status === 'supervisor_approved').length },
            { value: 'cycles', label: 'Đợt báo cáo tiến độ', count: cycles.filter((c) => c.status === 'open').length },
          ]}
        />
      )}

      {tab === 'requests' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'submitted', label: 'Chờ CBHD' },
              { id: 'supervisor_approved', label: 'Chờ CTSV duyệt' },
              { id: 'approved', label: 'Đã duyệt' },
              { id: 'rejected', label: 'Từ chối' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`h-8 px-3 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  statusFilter === f.id ? 'bg-[#eff5fc] text-[#034ea1]' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="uet-table">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">Loại yêu cầu</th>
                  <th className="px-3 py-2.5">Đối tượng</th>
                  <th className="px-3 py-2.5">Lý do</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-4 py-2.5 text-right">Ngày gửi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400">Đang tải...</td></tr>
                ) : requests.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400">Chưa có yêu cầu nào.</td></tr>
                ) : (
                  requests.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => {
                        setSelectedReq(r);
                        setReviewComment('');
                        setDecisionNo(r.decision_no || '');
                      }}
                      className="cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{r.typeLabel}</td>
                      <td className="px-3 py-3 text-xs">
                        {r.phd_code ? (
                          <div>
                            <div className="font-medium text-slate-800">{r.phd_name}</div>
                            <div className="mono text-[11px] text-[#034ea1]">{r.phd_code}</div>
                          </div>
                        ) : (
                          <div className="font-medium text-slate-800">
                            {r.scientist_title} {r.scientist_name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 max-w-[280px] truncate">{r.reason}</td>
                      <td className="px-3 py-3">
                        <StatusDot tone={reqStatusTone(r.status)}>{r.statusLabel}</StatusDot>
                      </td>
                      <td className="px-4 py-3 text-right mono text-[11px] text-slate-400 whitespace-nowrap">
                        {formatDateTimeVN(r.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === 'cycles' && isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <Panel className="lg:col-span-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
              Danh sách đợt báo cáo
            </div>
            <div className="divide-y divide-slate-100">
              {cycles.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Chưa mở đợt báo cáo nào.</div>
              ) : (
                cycles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCycleId(Number(c.id))}
                    className={`w-full px-4 py-3 text-left text-xs cursor-pointer transition-colors ${
                      Number(c.id) === selectedCycleId ? 'bg-[#eff5fc]/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{c.term_code}</span>
                      <Tag tone={c.status === 'open' ? 'info' : 'neutral'}>{c.status === 'open' ? 'Đang mở' : 'Đã đóng'}</Tag>
                    </div>
                    <div className="text-slate-600 mt-0.5 truncate">{c.title}</div>
                    <div className="mono text-[11px] text-slate-400 mt-1">Hạn: {formatDateVN(c.due_date)}</div>
                  </button>
                ))
              )}
            </div>
          </Panel>

          <div className="lg:col-span-8 space-y-4">
            {cycleSummary ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] text-slate-500">NCS đang học</div>
                    <div className="mt-1 font-display text-xl font-semibold text-slate-900 tabular">{cycleSummary.stats.totalActive}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] text-slate-500">Đã nộp</div>
                    <div className="mt-1 font-display text-xl font-semibold text-[#034ea1] tabular">{cycleSummary.stats.submittedCount}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] text-slate-500">Chưa nộp</div>
                    <div className="mt-1 font-display text-xl font-semibold text-rose-700 tabular">{cycleSummary.stats.missingCount}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] text-slate-500">CBHD đã duyệt</div>
                    <div className="mt-1 font-display text-xl font-semibold text-emerald-700 tabular">{cycleSummary.stats.approvedCount}</div>
                  </div>
                </div>

                <Panel className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      NCS chưa nộp ({cycleSummary.missing.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      {cycleSummary.missing.length > 0 && (
                        <Button size="sm" variant="primary" leadingIcon={<Bell size={13} />} onClick={handleRemindMissing}>
                          Nhắc nộp ({cycleSummary.missing.length})
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const next = cycleSummary.cycle.status === 'open' ? 'closed' : 'open';
                          await apiFetch(`/api/reporting-cycles/${cycleSummary.cycle.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ status: next }),
                          });
                          toast.success(next === 'closed' ? 'Đã chốt đóng đợt báo cáo.' : 'Đã mở lại đợt báo cáo.');
                          await loadCycles();
                          setCycleSummary(await apiFetch(`/api/reporting-cycles/${cycleSummary.cycle.id}/summary`));
                        }}
                      >
                        {cycleSummary.cycle.status === 'open' ? 'Đóng đợt' : 'Mở lại'}
                      </Button>
                    </div>
                  </div>
                  <table className="uet-table">
                    <thead>
                      <tr>
                        <th className="px-4 py-2">Mã NCS</th>
                        <th className="px-3 py-2">Họ và tên</th>
                        <th className="px-3 py-2">Khoa</th>
                        <th className="px-4 py-2">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleSummary.missing.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-emerald-700">100% NCS đang học đã nộp báo cáo.</td></tr>
                      ) : (
                        cycleSummary.missing.map((m: any) => (
                          <tr key={m.phd_id}>
                            <td className="px-4 py-2.5 mono text-xs font-semibold text-[#034ea1]">{m.phd_code}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-900">{m.full_name}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-500">{m.faculty_short_name || '—'}</td>
                            <td className="px-4 py-2.5 mono text-[11px] text-slate-500">{m.email || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Panel>
              </>
            ) : (
              <Panel className="p-8 text-center text-xs text-slate-400">Chọn một đợt báo cáo bên trái để xem tiến độ.</Panel>
            )}
          </div>
        </div>
      )}

      {/* Request Detail & Approval Slide-over Drawer */}
      <Drawer
        open={Boolean(selectedReq)}
        onOpenChange={(o) => !o && setSelectedReq(null)}
        title={selectedReq?.typeLabel}
        subtitle={
          selectedReq
            ? selectedReq.phd_code
              ? `${selectedReq.phd_code} · ${selectedReq.phd_name}`
              : `${selectedReq.scientist_title || ''} ${selectedReq.scientist_name || ''}`
            : undefined
        }
      >
        {selectedReq && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <StatusDot tone={reqStatusTone(selectedReq.status)}>{selectedReq.statusLabel}</StatusDot>
              <span className="mono text-[11px] text-slate-400">{formatDateTimeVN(selectedReq.created_at)}</span>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              <div className="px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">Người gửi</div>
                <div className="font-medium text-slate-800 mt-0.5">{selectedReq.created_by_name} ({selectedReq.created_by_email})</div>
              </div>
              <div className="px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">Lý do & Nội dung đề xuất</div>
                <div className="text-slate-800 mt-0.5 leading-relaxed">{selectedReq.reason}</div>
              </div>
              {selectedReq.payload?.new_standard_deadline && (
                <div className="px-3.5 py-2.5 flex justify-between">
                  <span className="text-slate-500">Hạn chuẩn đề xuất mới</span>
                  <span className="mono font-semibold text-[#034ea1]">{formatDateVN(selectedReq.payload.new_standard_deadline)}</span>
                </div>
              )}
              {selectedReq.payload?.new_dissertation_title && (
                <div className="px-3.5 py-2.5">
                  <div className="text-[11px] text-slate-400">Tên đề tài mới đề xuất</div>
                  <div className="font-medium text-slate-900 mt-0.5">{selectedReq.payload.new_dissertation_title}</div>
                </div>
              )}
              {selectedReq.payload?.requested_quota_limit && (
                <div className="px-3.5 py-2.5 flex justify-between">
                  <span className="text-slate-500">Định mức trần đề nghị</span>
                  <span className="font-semibold text-[#034ea1]">{selectedReq.payload.requested_quota_limit} NCS</span>
                </div>
              )}
              {selectedReq.decision_no && (
                <div className="px-3.5 py-2.5 flex justify-between bg-emerald-50/50">
                  <span className="text-emerald-900">Số QĐ phê duyệt</span>
                  <span className="mono font-semibold text-emerald-900">{selectedReq.decision_no}</span>
                </div>
              )}
            </div>

            {selectedReq.supervisor_comment && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-400">Nhận xét CBHD</div>
                <div className="text-slate-800 mt-0.5">{selectedReq.supervisor_comment}</div>
              </div>
            )}

            {selectedReq.admin_comment && (
              <div className="p-3 rounded-lg bg-[#eff5fc] border border-[#d2e4f8]">
                <div className="text-[11px] text-[#034ea1]">Phản hồi Phòng CTSV</div>
                <div className="text-slate-800 mt-0.5">{selectedReq.admin_comment}</div>
              </div>
            )}

            {/* Action box for Supervisor (when status === submitted) */}
            {!isStaff && user.role === 'supervisor' && selectedReq.status === 'submitted' && (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <Field label="Nhận xét xác nhận của CBHD">
                  <textarea rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Đồng ý đề xuất..." />
                </Field>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" disabled={submittingDecision} leadingIcon={<CheckCircle2 size={13} />} onClick={() => handleSupervisorReview('supervisor_approved')}>
                    Xác nhận chuyển CTSV
                  </Button>
                  <Button variant="tinted-warning" size="sm" disabled={submittingDecision} onClick={() => handleSupervisorReview('needs_revision')}>
                    Yêu cầu sửa
                  </Button>
                </div>
              </div>
            )}

            {/* Action box for Admin / CTSV */}
            {isStaff && selectedReq.status !== 'approved' && selectedReq.status !== 'rejected' && (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Số Quyết định">
                    <input value={decisionNo} onChange={(e) => setDecisionNo(e.target.value)} placeholder="VD: 890/QĐ-ĐHCN" />
                  </Field>
                  <Field label="Ngày QĐ">
                    <input type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} />
                  </Field>
                </div>
                <Field label="Ghi chú phê duyệt / Lý do từ chối">
                  <textarea rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" disabled={submittingDecision} leadingIcon={<CheckCircle2 size={13} />} onClick={() => handleAdminDecision('approved')}>
                    Phê duyệt & Tự cập nhật hồ sơ
                  </Button>
                  <Button variant="tinted-warning" size="sm" disabled={submittingDecision} onClick={() => handleAdminDecision('needs_revision')}>
                    Yêu cầu sửa
                  </Button>
                  <Button variant="danger" size="sm" disabled={submittingDecision} leadingIcon={<XCircle size={13} />} onClick={() => handleAdminDecision('rejected')}>
                    Từ chối
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Create Request Modal */}
      <Modal
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Tạo yêu cầu phê duyệt điện tử"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button type="submit" form="create-req-form" variant="primary" disabled={creating}>
              {creating ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </Button>
          </>
        }
      >
        <form id="create-req-form" onSubmit={handleCreateRequest} className="space-y-3.5">
          <Field label="Loại yêu cầu" required>
            <select
              value={createForm.request_type}
              onChange={(e) => setCreateForm({ ...createForm, request_type: e.target.value as ChangeRequestType })}
            >
              {TYPE_OPTIONS.filter((o) => (user.role === 'phd_student' ? o.value !== 'special_quota' : true)).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {createForm.request_type === 'special_quota' ? (
            <>
              {isStaff && (
                <Field label="Cán bộ hướng dẫn" required>
                  <select required value={createForm.scientist_id} onChange={(e) => setCreateForm({ ...createForm, scientist_id: e.target.value })}>
                    <option value="">Chọn CBHD</option>
                    {scientists.map((s) => <option key={s.id} value={s.id}>{s.title_display} {s.full_name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Định mức trần mới đề nghị (NCS)">
                <input type="number" value={createForm.requested_quota_limit} onChange={(e) => setCreateForm({ ...createForm, requested_quota_limit: e.target.value })} />
              </Field>
            </>
          ) : (
            <>
              {user.role !== 'phd_student' && (
                <Field label="Nghiên cứu sinh" required>
                  <select required value={createForm.phd_student_id} onChange={(e) => setCreateForm({ ...createForm, phd_student_id: e.target.value })}>
                    <option value="">Chọn NCS</option>
                    {phds.map((p) => <option key={p.id} value={p.id}>{p.phd_code} · {p.full_name}</option>)}
                  </select>
                </Field>
              )}
              {(createForm.request_type === 'extension' || createForm.request_type === 'deferral') && (
                <Field label="Ngày hạn chuẩn mới đề xuất">
                  <input type="date" value={createForm.new_standard_deadline} onChange={(e) => setCreateForm({ ...createForm, new_standard_deadline: e.target.value })} />
                </Field>
              )}
              {createForm.request_type === 'topic_change' && (
                <Field label="Tên đề tài LATS mới đề xuất" required>
                  <textarea rows={2} required value={createForm.new_dissertation_title} onChange={(e) => setCreateForm({ ...createForm, new_dissertation_title: e.target.value })} />
                </Field>
              )}
            </>
          )}

          <Field label="Lý do đề xuất" required>
            <textarea rows={3} required value={createForm.reason} onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })} placeholder="Nêu rõ lý do, căn cứ..." />
          </Field>
          <Field label="Link minh chứng (nếu có)">
            <input value={createForm.evidence_url} onChange={(e) => setCreateForm({ ...createForm, evidence_url: e.target.value })} placeholder="https://drive.google.com/..." />
          </Field>
        </form>
      </Modal>

      {/* Create Reporting Cycle Modal */}
      <Modal
        open={showNewCycle}
        onOpenChange={setShowNewCycle}
        title="Mở đợt báo cáo tiến độ mới"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewCycle(false)}>Hủy</Button>
            <Button type="submit" form="create-cycle-form" variant="primary">Mở đợt</Button>
          </>
        }
      >
        <form id="create-cycle-form" onSubmit={handleCreateCycle} className="space-y-3">
          <Field label="Mã kỳ" required>
            <input required value={cycleForm.term_code} onChange={(e) => setCycleForm({ ...cycleForm, term_code: e.target.value })} />
          </Field>
          <Field label="Tiêu đề đợt báo cáo" required>
            <input required value={cycleForm.title} onChange={(e) => setCycleForm({ ...cycleForm, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày mở" required>
              <input type="date" required value={cycleForm.open_date} onChange={(e) => setCycleForm({ ...cycleForm, open_date: e.target.value })} />
            </Field>
            <Field label="Hạn nộp" required>
              <input type="date" required value={cycleForm.due_date} onChange={(e) => setCycleForm({ ...cycleForm, due_date: e.target.value })} />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
