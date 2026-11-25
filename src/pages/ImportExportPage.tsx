import { Download, Lock, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AuthUser } from '../../shared/types';
import { apiFetch, downloadBlob } from '../shared/api';
import { Button, PageTop, Panel, StatusDot, Tag, UnderlineTabs } from '../shared/ui';

export function ImportExportPage({ user: _user }: { user: AuthUser }) {
  const [mode, setMode] = useState<'phd_students' | 'scientists'>('phd_students');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

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
    <div className="space-y-6">
      <PageTop title="Import / Export Excel" />

      <Panel className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">Xuất báo cáo (.xlsx)</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            {
              title: 'Danh sách Nghiên cứu sinh (Chuẩn)',
              path: '/api/excel/export/phd-students',
              filename: 'UET_DanhSach_NCS.xlsx',
              confidential: false,
            },
            {
              title: 'Danh sách Nghiên cứu sinh kèm PBĐL (Mật)',
              path: '/api/excel/export/phd-students?includeConfidential=true',
              filename: 'UET_DanhSach_NCS_Mat_PBDL.xlsx',
              confidential: true,
            },
            {
              title: 'Tổng hợp Quota & Giờ hướng dẫn CBHD',
              path: '/api/excel/export/supervisor-quota',
              filename: 'UET_Quota_GioHuongDan_CBHD.xlsx',
              confidential: false,
            },
            {
              title: 'Bảng kê Cán bộ & Thanh toán thù lao (CCCD, MST, STK)',
              path: '/api/excel/export/scientists?listType=all',
              filename: 'UET_CanBo_ThanhToan.xlsx',
              confidential: false,
            },
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
  );
}
