import { ArrowUpRight, Download, Lock, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { AuthUser } from '../../shared/types';
import { apiFetch, downloadBlob } from '../shared/api';
import { formatDateVN } from '../shared/format';
import { Button, PageTop, Panel, Tag, UnderlineTabs } from '../shared/ui';

type AlertFilter = 'all' | 'urgent' | 'ir_due';

export function DashboardPage({ user: _user }: { user: AuthUser }) {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alertTab, setAlertTab] = useState<AlertFilter>('all');
  const [showAllFaculties, setShowAllFaculties] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/dashboard/summary')
      .then(setData)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-xs text-slate-400">Đang tải...</div>;
  }
  if (!data) {
    return <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">Không tải được tổng quan.</div>;
  }

  const k = data.kpis;
  const allFaculties = (data.byFaculty || []) as any[];
  const nonEmptyFaculties = allFaculties.filter((f) => f.total > 0);
  const visibleFaculties = showAllFaculties || nonEmptyFaculties.length === 0 ? allFaculties : nonEmptyFaculties;
  const maxFac = Math.max(1, ...allFaculties.map((f) => f.total));

  const allAlerts = (data.deadlineAlerts || []) as any[];
  const urgentAlerts = allAlerts.filter((a) => a.level === 'overdue' || a.level === 'urgent');
  const irAlerts = allAlerts.filter((a) => a.kind === 'ir_due');
  const filteredAlerts = alertTab === 'urgent' ? urgentAlerts : alertTab === 'ir_due' ? irAlerts : allAlerts;

  return (
    <div className="space-y-6">
      <PageTop
        title="Tổng quan"
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Download size={14} />}
              onClick={async () => {
                try {
                  await downloadBlob('/api/excel/export/supervisor-quota', 'UET_Quota_CBHD.xlsx');
                  toast.success('Đã xuất bảng Quota CBHD.');
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Xuất Quota
            </Button>
            <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => navigate('/ncs?create=1')}>
              Thêm NCS
            </Button>
          </>
        }
      />

      {/* 4 Clean Stat Cards — Large Figure + Concise Label */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => navigate('/ncs')}
          className="bg-white border border-slate-200 rounded-lg px-5 py-4 text-left hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">NCS đang học</div>
          <div className="mt-2 flex items-baseline gap-2 tabular">
            <span className="font-display text-2xl font-semibold text-slate-900">{k.activePhds}</span>
            <span className="text-xs text-slate-400">/ {k.totalPhds}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/ncs?pubStatus=met')}
          className="bg-white border border-slate-200 rounded-lg px-5 py-4 text-left hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">Đạt công bố 3638</div>
          <div className="mt-2 flex items-baseline gap-2 tabular">
            <span className="font-display text-2xl font-semibold text-emerald-700">{k.pubMetCount}</span>
            <span className="text-xs text-slate-400">hồ sơ</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/ncs?deadlineAlert=urgent')}
          className="bg-white border border-slate-200 rounded-lg px-5 py-4 text-left hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">Sắp / Quá hạn</div>
          <div className="mt-2 flex items-baseline gap-2 tabular">
            <span className={`font-display text-2xl font-semibold ${k.urgentDeadlineCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {k.urgentDeadlineCount}
            </span>
            <span className="text-xs text-slate-400">≤ 30 ngày</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/scientists?tab=supervisor')}
          className="bg-white border border-slate-200 rounded-lg px-5 py-4 text-left hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">Giờ chuẩn CBHD</div>
          <div className="mt-2 flex items-baseline gap-2 tabular">
            <span className="font-display text-2xl font-semibold text-[#034ea1]">{k.totalStandardHours}</span>
            <span className="text-xs text-slate-400">{k.totalSupervisors} CBHD</span>
          </div>
        </button>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left 8 Cols: Actionable Deadlines */}
        <Panel className="lg:col-span-8 overflow-hidden">
          <div className="px-5 pt-4 flex items-center justify-between gap-2">
            <h2 className="font-display text-[15px] font-semibold text-slate-900">Theo dõi thời hạn</h2>
            <Link to="/notifications" className="text-xs font-medium text-[#034ea1] hover:underline inline-flex items-center gap-1">
              Nhắc hạn <ArrowUpRight size={13} />
            </Link>
          </div>

          <div className="px-5 mt-2">
            <UnderlineTabs<AlertFilter>
              value={alertTab}
              onChange={setAlertTab}
              items={[
                { value: 'all', label: 'Tất cả', count: allAlerts.length },
                { value: 'urgent', label: 'Khẩn cấp', count: urgentAlerts.length },
                { value: 'ir_due', label: 'PBĐL', count: irAlerts.length, icon: <Lock size={12} className="text-amber-700" /> },
              ]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="uet-table">
              <thead>
                <tr>
                  <th className="px-5 py-2.5">Nghiên cứu sinh</th>
                  <th className="px-3 py-2.5">Mốc hạn</th>
                  <th className="px-3 py-2.5">Ngày hạn</th>
                  <th className="px-5 py-2.5 text-right">Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-xs text-slate-400">
                      Không có hồ sơ cần xử lý.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((a, i) => (
                    <tr
                      key={`${a.phdId}-${a.kind}-${i}`}
                      onClick={() => navigate(`/ncs/${a.phdId}`)}
                      className="cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{a.fullName}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          <span className="mono">{a.phdCode}</span>
                          {a.facultyName ? ` · ${a.facultyName}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {a.kind === 'ir_due' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                            <Lock size={11} /> {a.kindLabel}
                          </span>
                        ) : (
                          <span className="text-slate-600">{a.kindLabel}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 mono text-xs text-slate-600">{formatDateVN(a.date)}</td>
                      <td className="px-5 py-3 text-right">
                        <Tag tone={a.level === 'overdue' ? 'error' : a.level === 'urgent' ? 'warning' : 'info'}>
                          {a.label}
                        </Tag>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Right 4 Cols: Faculty Breakdown + Quota Alerts */}
        <div className="lg:col-span-4 space-y-4">
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-[15px] font-semibold text-slate-900">Theo Khoa / Viện</h2>
              {allFaculties.length > nonEmptyFaculties.length && nonEmptyFaculties.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllFaculties((v) => !v)}
                  className="text-[11px] font-medium text-[#034ea1] hover:underline cursor-pointer"
                >
                  {showAllFaculties ? 'Thu gọn' : `Tất cả (${allFaculties.length})`}
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {visibleFaculties.map((f) => (
                <button
                  key={f.facultyId}
                  type="button"
                  onClick={() => navigate(`/ncs?facultyId=${f.facultyId}`)}
                  className="w-full py-2.5 text-left hover:bg-slate-50/70 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-slate-700 group-hover:text-[#034ea1] font-medium truncate">{f.name}</span>
                    <span className="tabular shrink-0 font-semibold text-slate-900">{f.total}</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#034ea1]/80 rounded-full"
                      style={{ width: `${f.total > 0 ? Math.max(8, Math.round((f.total / maxFac) * 100)) : 0}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          {(data.quotaAlerts || []).length > 0 && (
            <Panel className="p-5">
              <h2 className="font-display text-[15px] font-semibold text-slate-900 mb-3">Cảnh báo Quota CBHD</h2>
              <div className="divide-y divide-slate-100">
                {data.quotaAlerts.map((q: any) => (
                  <div key={q.scientistId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {q.titleDisplay} {q.fullName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{q.workUnit}</div>
                    </div>
                    <Tag tone={q.status === 'over_limit' ? 'error' : 'warning'}>
                      {q.equivalentLoad} / {q.effectiveQuota}
                    </Tag>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
