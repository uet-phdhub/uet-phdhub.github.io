import { CheckCheck, Clock, RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AuthUser } from '../../shared/types';
import { apiFetch } from '../shared/api';
import { formatDateTimeVN } from '../shared/format';
import { Button, Field, PageTop, Panel, StatusDot, Tag } from '../shared/ui';

export function NotificationsPage({ user, onUnreadChanged }: { user: AuthUser; onUnreadChanged: () => Promise<void> }) {
  const isStaff = user.role === 'admin' || user.role === 'staff';
  const [myItems, setMyItems] = useState<any[]>([]);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [compose, setCompose] = useState({
    targetGroup: 'all_active_phds',
    customEmails: '',
    subject: '',
    body: '',
    delivery_mode: 'website_and_email',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [myRes, admRes] = await Promise.all([
        apiFetch<{ items: any[] }>('/api/notifications/my'),
        isStaff ? apiFetch('/api/notifications/admin') : Promise.resolve(null),
      ]);
      setMyItems(myRes.items || []);
      setAdminData(admRes);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const markRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    await loadAll();
    await onUnreadChanged();
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadAll();
    await onUnreadChanged();
    toast.success('Đã đánh dấu đã đọc.');
  };

  const handleScanDeadlines = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/notifications/scan-deadlines', { method: 'POST' });
      toast.success(`Đã quét ${res.scannedPhds} hồ sơ: +${res.notificationsCreated} nhắc hạn.`);
      await loadAll();
      await onUnreadChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDrainQueue = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/notifications/process-queue', { method: 'POST' });
      toast.info(res.message || `Gửi ${res.sent}, lỗi ${res.failed}.`);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const emails = compose.customEmails
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiFetch('/api/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          targetGroup: compose.targetGroup,
          emails,
          subject: compose.subject,
          body: compose.body,
          delivery_mode: compose.delivery_mode,
        }),
      });
      toast.success(`Đã gửi ${res.created} thông báo.`);
      setCompose({ ...compose, subject: '', body: '', customEmails: '' });
      await loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTop
        title="Thông báo & Nhắc hạn"
        actions={
          <>
            <Button size="sm" variant="secondary" leadingIcon={<CheckCheck size={13} />} onClick={markAllRead}>
              Đã đọc tất cả
            </Button>
            {isStaff && (
              <>
                <Button size="sm" variant="secondary" leadingIcon={<Clock size={13} />} disabled={busy} onClick={handleScanDeadlines}>
                  Quét nhắc hạn
                </Button>
                {adminData?.stats?.failed > 0 && (
                  <Button
                    size="sm"
                    variant="tinted-warning"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await apiFetch('/api/notifications/retry-failed', { method: 'POST' });
                        toast.success(`Đã đưa ${res.requeued} email lỗi về hàng đợi.`);
                        await loadAll();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Thử gửi lại lỗi ({adminData.stats.failed})
                  </Button>
                )}
                <Button size="sm" variant="primary" leadingIcon={<RefreshCw size={13} />} disabled={busy} onClick={handleDrainQueue}>
                  Gửi hàng đợi
                </Button>
              </>
            )}
          </>
        }
      />

      {isStaff && adminData && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-white border border-slate-200 rounded-lg text-xs">
            <span>
              <span className="text-slate-400 mr-1.5">Provider</span>
              <strong className="mono uppercase text-slate-800">{adminData.stats.provider}</strong>
            </span>
            <span className="tabular">
              <span className="text-slate-400 mr-1.5">Hôm nay</span>
              <strong className="text-[#034ea1]">{adminData.stats.sentToday} / {adminData.stats.dailyCap}</strong>
            </span>
            <span className="tabular">
              <span className="text-slate-400 mr-1.5">Chờ gửi</span>
              <strong className="text-amber-700">{adminData.stats.queued}</strong>
            </span>
            <span className="tabular">
              <span className="text-slate-400 mr-1.5">Đã gửi</span>
              <strong className="text-emerald-700">{adminData.stats.sent}</strong>
            </span>
            {adminData.stats.failed > 0 && (
              <span className="tabular">
                <span className="text-slate-400 mr-1.5">Lỗi</span>
                <strong className="text-rose-700">{adminData.stats.failed}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <Panel className="lg:col-span-5 p-5 space-y-3.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">Gửi thông báo</h2>
              <form onSubmit={handleSend} className="space-y-3">
                <Field label="Người nhận">
                  <select value={compose.targetGroup} onChange={(e) => setCompose({ ...compose, targetGroup: e.target.value })}>
                    <option value="all_active_phds">Toàn bộ NCS đang học</option>
                    <option value="all_supervisors">Toàn bộ CBHD</option>
                    <option value="all_staff">Phòng CTSV</option>
                    <option value="custom">Email thủ công</option>
                  </select>
                </Field>
                {compose.targetGroup === 'custom' && (
                  <Field label="Danh sách Email">
                    <textarea rows={2} value={compose.customEmails} onChange={(e) => setCompose({ ...compose, customEmails: e.target.value })} />
                  </Field>
                )}
                <Field label="Kênh gửi">
                  <select value={compose.delivery_mode} onChange={(e) => setCompose({ ...compose, delivery_mode: e.target.value })}>
                    <option value="website_and_email">Website + Email</option>
                    <option value="website_only">Chỉ Website</option>
                  </select>
                </Field>
                <Field label="Tiêu đề" required>
                  <input required value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
                </Field>
                <Field label="Nội dung" required>
                  <textarea rows={3} required value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
                </Field>
                <Button type="submit" variant="primary" leadingIcon={<Send size={13} />} disabled={busy} className="w-full">
                  Gửi thông báo
                </Button>
              </form>
            </Panel>

            <Panel className="lg:col-span-7 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="font-display text-sm font-semibold text-slate-900">Hàng đợi gần đây</h2>
              </div>
              <div className="overflow-x-auto max-h-[380px]">
                <table className="uet-table">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5">Người nhận</th>
                      <th className="px-3 py-2.5">Tiêu đề</th>
                      <th className="px-3 py-2.5">Trạng thái</th>
                      <th className="px-4 py-2.5 text-right">Thời điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adminData.items || []).length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">Chưa có bản ghi.</td></tr>
                    ) : (
                      adminData.items.map((n: any) => (
                        <tr key={n.id}>
                          <td className="px-4 py-2.5 mono text-[11px] text-slate-600">{n.recipient_email}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-900 max-w-[240px] truncate" title={n.subject}>{n.subject}</td>
                          <td className="px-3 py-2.5">
                            <StatusDot tone={n.status === 'sent' ? 'success' : n.status === 'failed' ? 'error' : n.status === 'queued' ? 'warning' : 'neutral'}>
                              {n.status}
                            </StatusDot>
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-[11px] text-slate-400">{formatDateTimeVN(n.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      )}

      <Panel className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900">Hộp thư của bạn</h2>
          <span className="mono text-xs text-slate-400">{user.email}</span>
        </div>
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">Đang tải...</div>
        ) : myItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">Chưa có thông báo.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {myItems.map((n) => (
              <div
                key={n.id}
                className={`px-5 py-3.5 flex items-start justify-between gap-4 text-xs ${n.is_read ? 'bg-white' : 'bg-[#eff5fc]/50'}`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.is_read && <Tag tone="info">Mới</Tag>}
                    <span className="font-semibold text-slate-900">{n.subject}</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{n.body}</p>
                  <div className="mono text-[11px] text-slate-400">{formatDateTimeVN(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                    Đã đọc
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
