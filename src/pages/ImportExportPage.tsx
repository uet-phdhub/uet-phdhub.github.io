import { AlertTriangle, Calculator, Check, Download, Lock, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AuthUser, FeeActivityType, PaymentItemRow } from '../../shared/types';
import { apiFetch, downloadBlob } from '../shared/api';
import { Button, Field, PageTop, Panel, StatusDot, Tag, UnderlineTabs } from '../shared/ui';

type PageTab = 'payments' | 'excel';

function fmtVnd(val: number | string | undefined): string {
  return `${Math.round(Number(val) || 0).toLocaleString('vi-VN')}đ`;
}

export function ImportExportPage({ user: _user }: { user: AuthUser }) {
  const [tab, setTab] = useState<PageTab>('payments');

  // Excel import state
  const [mode, setMode] = useState<'phd_students' | 'scientists'>('phd_students');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Payments & Tax state
  const [batches, setBatches] = useState<any[]>([]);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [hideIrIdentity, setHideIrIdentity] = useState(true);
  const [actSeminar, setActSeminar] = useState(true);
  const [actIr, setActIr] = useState(true);
  const [actDefense, setActDefense] = useState(true);
  const [payPreview, setPayPreview] = useState<{ items: PaymentItemRow[]; summary: any } | null>(null);
  const [batchTitle, setBatchTitle] = useState(`Đợt thanh toán thù lao ${new Date().toISOString().slice(0, 7)}`);
  const [savingBatch, setSavingBatch] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: any[] }>('/api/payments/batches');
      setBatches(data.items || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'payments') loadBatches();
  }, [tab, loadBatches]);

  const handlePreviewPayments = async () => {
    const activities: FeeActivityType[] = [];
    if (actSeminar) activities.push('seminar');
    if (actIr) activities.push('independent_review');
    if (actDefense) activities.push('defense_council');
    if (activities.length === 0) {
      toast.error('Chọn ít nhất 1 loại hoạt động.');
      return;
    }
    try {
      const res = await apiFetch<{ items: PaymentItemRow[]; summary: any }>('/api/payments/batches/preview', {
        method: 'POST',
        body: JSON.stringify({ periodFrom, periodTo, activities, hideIrPhdIdentity: hideIrIdentity }),
      });
      setPayPreview(res);
      if (res.items.length === 0) {
        toast.info('Không có lượt hội đồng/PBĐL mới chưa thanh toán trong khoảng thời gian này.');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleItemExempt = (idx: number) => {
    if (!payPreview) return;
    const rate = Number(payPreview.summary.pitRate ?? 0.1);
    const threshold = Number(payPreview.summary.pitThreshold ?? 2000000);
    const nextItems = payPreview.items.map((it, i) => {
      if (i !== idx) return it;
      const exempt = it.tax_exempt_declared ? 0 : 1;
      const tax =
        exempt || Number(it.is_internal) === 1 || it.gross_amount < threshold
          ? 0
          : Math.round(it.gross_amount * rate);
      return { ...it, tax_exempt_declared: exempt, tax_amount: tax, net_amount: Math.round(it.gross_amount - tax) };
    });
    setPayPreview({
      items: nextItems,
      summary: {
        ...payPreview.summary,
        totalGross: nextItems.reduce((s, x) => s + x.gross_amount, 0),
        totalTax: nextItems.reduce((s, x) => s + x.tax_amount, 0),
        totalNet: nextItems.reduce((s, x) => s + x.net_amount, 0),
      },
    });
  };

  const handleSavePaymentBatch = async (status: 'draft' | 'confirmed') => {
    if (!payPreview || payPreview.items.length === 0) return;
    setSavingBatch(true);
    try {
      const created = await apiFetch('/api/payments/batches', {
        method: 'POST',
        body: JSON.stringify({
          title: batchTitle,
          period_from: periodFrom,
          period_to: periodTo,
          hide_ir_phd_identity: hideIrIdentity,
          status,
          items: payPreview.items,
        }),
      });
      toast.success(`Đã lập đợt ${created.batch_code}.`);
      setPayPreview(null);
      await loadBatches();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingBatch(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setPreview(null);
    try {
      const endpoint =
        mode === 'phd_students'
          ? '/api/excel/import/phd-students/preview'
          : '/api/excel/import/scientists/preview';
      const data = await apiFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      setPreview(data);
      toast.success(`Đã đọc ${data.summary.total} dòng từ ${file.name}.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleCommit = async () => {
    if (!preview?.previewId) return;
    setCommitting(true);
    try {
      const endpoint =
        mode === 'phd_students'
          ? `/api/excel/import/phd-students/${preview.previewId}/commit`
          : `/api/excel/import/scientists/${preview.previewId}/commit`;
      const res = await apiFetch(endpoint, { method: 'POST' });
      toast.success(`Đã nhập: +${res.created ?? 0} mới, ${res.updated ?? 0} cập nhật.`);
      setPreview(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCommitting(false);
    }
  };

  const runDownload = async (path: string, name: string) => {
    try {
      await downloadBlob(path, name);
      toast.success(`Đã tải ${name}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <PageTop title="Thù lao & Excel" />

      <UnderlineTabs<PageTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'payments', label: 'Tính thù lao & Thuế TNCN', count: batches.length },
          { value: 'excel', label: 'Import / Export Excel' },
        ]}
      />

      {tab === 'payments' && (
        <div className="space-y-5">
          {/* Payment Calculator Controls */}
          <Panel className="p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Từ ngày" className="w-40">
                <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
              </Field>
              <Field label="Đến ngày" className="w-40">
                <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
              </Field>
              <div className="flex flex-wrap items-center gap-4 h-9 text-xs text-slate-700">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={actSeminar} onChange={(e) => setActSeminar(e.target.checked)} />
                  HĐ Seminar
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={actIr} onChange={(e) => setActIr(e.target.checked)} />
                  PBĐL
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={actDefense} onChange={(e) => setActDefense(e.target.checked)} />
                  HĐ LATS
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-amber-900 font-medium">
                  <input type="checkbox" checked={hideIrIdentity} onChange={(e) => setHideIrIdentity(e.target.checked)} />
                  <Lock size={11} /> Ẩn tên NCS dòng PBĐL
                </label>
              </div>
              <div className="ml-auto">
                <Button variant="primary" leadingIcon={<Calculator size={14} />} onClick={handlePreviewPayments}>
                  Tổng hợp thử
                </Button>
              </div>
            </div>

            {payPreview && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-5 text-xs tabular">
                    <span>Tổng chi: <strong className="text-slate-900">{fmtVnd(payPreview.summary.totalGross)}</strong></span>
                    <span>Thuế TNCN: <strong className="text-amber-800">{fmtVnd(payPreview.summary.totalTax)}</strong></span>
                    <span>Thực nhận: <strong className="text-[#034ea1]">{fmtVnd(payPreview.summary.totalNet)}</strong></span>
                    {payPreview.summary.warningMissingCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                        <AlertTriangle size={12} /> {payPreview.summary.warningMissingCount} dòng thiếu CCCD/MST/STK
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={batchTitle}
                      onChange={(e) => setBatchTitle(e.target.value)}
                      className="!w-64"
                      placeholder="Tên đợt thanh toán..."
                    />
                    <Button size="sm" variant="secondary" disabled={savingBatch || !payPreview.items.length} onClick={() => handleSavePaymentBatch('draft')}>
                      Lưu nháp
                    </Button>
                    <Button size="sm" variant="primary" disabled={savingBatch || !payPreview.items.length} onClick={() => handleSavePaymentBatch('confirmed')}>
                      Chốt đợt (chống chi trùng)
                    </Button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-md overflow-x-auto max-h-[380px]">
                  <table className="uet-table">
                    <thead>
                      <tr>
                        <th className="px-3.5 py-2">Cán bộ</th>
                        <th className="px-3 py-2">Nội dung chi</th>
                        <th className="px-3 py-2 text-right">Thành tiền</th>
                        <th className="px-3 py-2 text-right">Thuế 10%</th>
                        <th className="px-3 py-2 text-right">Thực nhận</th>
                        <th className="px-3 py-2">Miễn 08/CK</th>
                        <th className="px-3.5 py-2">Kiểm tra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payPreview.items.map((it, idx) => (
                        <tr key={`${it.source_type}-${it.source_id}`}>
                          <td className="px-3.5 py-2.5 text-xs">
                            <div className="font-medium text-slate-900">{it.title_display} {it.scientist_name}</div>
                            <div className="text-[11px] text-slate-400">{it.is_internal ? 'Trong UET' : 'Ngoài Trường'}</div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-700">{it.description}</td>
                          <td className="px-3 py-2.5 text-right mono text-xs">{fmtVnd(it.gross_amount)}</td>
                          <td className="px-3 py-2.5 text-right mono text-xs text-amber-800">{fmtVnd(it.tax_amount)}</td>
                          <td className="px-3 py-2.5 text-right mono text-xs font-semibold text-[#034ea1]">{fmtVnd(it.net_amount)}</td>
                          <td className="px-3 py-2.5 text-center">
                            {it.is_internal === 0 && (
                              <input type="checkbox" checked={Boolean(it.tax_exempt_declared)} onChange={() => toggleItemExempt(idx)} />
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-[11px]">
                            {it.missing_payment_fields?.length ? (
                              <span className="text-rose-700">Thiếu {it.missing_payment_fields.join(', ')}</span>
                            ) : (
                              <span className="text-emerald-700">Đủ thông tin</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Panel>

          {/* Saved Payment Batches */}
          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">Đợt thanh toán đã lập</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="uet-table">
                <thead>
                  <tr>
                    <th className="px-5 py-2.5">Mã đợt</th>
                    <th className="px-3 py-2.5">Tiêu đề</th>
                    <th className="px-3 py-2.5 text-right">Dòng</th>
                    <th className="px-3 py-2.5 text-right">Tổng thực nhận</th>
                    <th className="px-3 py-2.5">Trạng thái</th>
                    <th className="px-5 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-400">Chưa có đợt thanh toán nào.</td></tr>
                  ) : (
                    batches.map((b) => (
                      <tr key={b.id}>
                        <td className="px-5 py-3 mono text-xs font-semibold text-[#034ea1]">{b.batch_code}</td>
                        <td className="px-3 py-3 font-medium text-slate-900 text-xs">{b.title}</td>
                        <td className="px-3 py-3 text-right tabular text-xs">{b.item_count ?? 0}</td>
                        <td className="px-3 py-3 text-right mono text-xs font-semibold text-slate-900">{fmtVnd(b.total_net)}</td>
                        <td className="px-3 py-3">
                          <Tag tone={b.status === 'paid' ? 'success' : b.status === 'confirmed' ? 'info' : 'neutral'}>
                            {b.status === 'paid' ? 'Đã chi' : b.status === 'confirmed' ? 'Đã chốt' : 'Nháp'}
                          </Tag>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {b.status === 'draft' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await apiFetch(`/api/payments/batches/${b.id}`, { method: 'PUT', body: JSON.stringify({ status: 'confirmed' }) });
                                  toast.success('Đã chốt đợt thanh toán.');
                                  await loadBatches();
                                }}
                              >
                                <Check size={13} /> Chốt
                              </Button>
                            )}
                            {b.status === 'confirmed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await apiFetch(`/api/payments/batches/${b.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) });
                                  toast.success('Đã đánh dấu đã chi trả.');
                                  await loadBatches();
                                }}
                              >
                                Đã chi
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              leadingIcon={<Download size={12} />}
                              onClick={() => runDownload(`/api/payments/batches/${b.id}/export`, `UET_BangKe_ThuLao_${b.batch_code}.xlsx`)}
                            >
                              Excel
                            </Button>
                            {b.status === 'draft' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/payments/batches/${b.id}`, { method: 'DELETE' });
                                  toast.success('Đã xóa bản nháp.');
                                  await loadBatches();
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'excel' && (
        <div className="space-y-5">
          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">Xuất báo cáo (.xlsx)</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { title: 'Danh sách Nghiên cứu sinh (Chuẩn)', path: '/api/excel/export/phd-students', filename: 'UET_DanhSach_NCS.xlsx', confidential: false },
                { title: 'Danh sách Nghiên cứu sinh kèm PBĐL (Mật)', path: '/api/excel/export/phd-students?includeConfidential=true', filename: 'UET_DanhSach_NCS_Mat_PBDL.xlsx', confidential: true },
                { title: 'Tổng hợp Quota & Giờ hướng dẫn CBHD', path: '/api/excel/export/supervisor-quota', filename: 'UET_Quota_GioHuongDan_CBHD.xlsx', confidential: false },
                { title: 'Bảng kê Cán bộ & Thanh toán thù lao (CCCD, MST, STK)', path: '/api/excel/export/scientists?listType=all', filename: 'UET_CanBo_ThanhToan.xlsx', confidential: false },
              ].map((item) => (
                <div key={item.filename} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2 min-w-0">
                    {item.confidential && <Lock size={13} className="text-amber-700 shrink-0" />}
                    <span className="truncate">{item.title}</span>
                  </div>
                  <Button
                    size="sm"
                    variant={item.confidential ? 'tinted-warning' : 'secondary'}
                    leadingIcon={<Download size={13} />}
                    onClick={() => runDownload(item.path, item.filename)}
                  >
                    Tải .xlsx
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-5 pt-3 flex flex-wrap items-center justify-between gap-3">
              <UnderlineTabs
                value={mode}
                onChange={(v) => {
                  setMode(v);
                  setPreview(null);
                }}
                items={[
                  { value: 'phd_students', label: 'Import NCS' },
                  { value: 'scientists', label: 'Import Cán bộ' },
                ]}
              />
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<Download size={13} />}
                onClick={() =>
                  runDownload(
                    mode === 'phd_students' ? '/api/excel/templates/phd-students' : '/api/excel/templates/scientists',
                    mode === 'phd_students' ? 'UET_Mau_Import_NCS.xlsx' : 'UET_Mau_Import_CanBo.xlsx'
                  )
                }
              >
                Tải file mẫu
              </Button>
            </div>

            <div className="p-5 space-y-4">
              <label className="block p-7 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 text-center cursor-pointer transition-colors">
                <Upload size={18} className="mx-auto text-slate-400 mb-2" />
                <div className="text-xs font-medium text-slate-700">
                  {loading ? 'Đang đối soát dữ liệu...' : 'Chọn tệp .xlsx để xem trước trước khi nhập'}
                </div>
                <input type="file" accept=".xlsx,.xls" disabled={loading} onChange={handleFileSelect} className="sr-only" />
              </label>

              {preview && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-md border border-slate-200 bg-slate-50/80 text-xs">
                    <div className="flex flex-wrap items-center gap-3 tabular">
                      <span className="font-semibold text-slate-900">{preview.filename}</span>
                      <StatusDot tone="success">Mới: {preview.summary.create}</StatusDot>
                      <StatusDot tone="info">Cập nhật: {preview.summary.update}</StatusDot>
                      <StatusDot tone="error">Lỗi: {preview.summary.error}</StatusDot>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={committing || preview.summary.create + preview.summary.update === 0}
                      onClick={handleCommit}
                    >
                      {committing ? 'Đang nhập...' : `Xác nhận (${preview.summary.create + preview.summary.update})`}
                    </Button>
                  </div>

                  <div className="border border-slate-200 rounded-md overflow-x-auto max-h-[380px]">
                    <table className="uet-table">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">Dòng</th>
                          <th className="px-3 py-2">Thao tác</th>
                          <th className="px-3 py-2">{mode === 'phd_students' ? 'Mã & Họ tên' : 'Họ tên'}</th>
                          <th className="px-3 py-2">Email / Đơn vị</th>
                          <th className="px-3 py-2">Kết quả</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r: any) => (
                          <tr key={r.rowNumber}>
                            <td className="px-3 py-2 mono text-xs text-slate-500">{r.rowNumber}</td>
                            <td className="px-3 py-2">
                              <Tag tone={r.action === 'create' ? 'success' : r.action === 'update' ? 'info' : 'error'}>
                                {r.action === 'create' ? 'Tạo mới' : r.action === 'update' ? 'Cập nhật' : 'Lỗi'}
                              </Tag>
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {mode === 'phd_students'
                                ? `${r.data.phd_code || '—'} · ${r.data.full_name || '—'}`
                                : `${r.data.title_display || ''} ${r.data.full_name || '—'}`}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {r.data.email || '—'} · {r.data.work_unit || r.data.faculty_name || '—'}
                            </td>
                            <td className="px-3 py-2 text-xs text-rose-700">{(r.errors || []).join('; ') || 'Hợp lệ'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
