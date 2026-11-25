import { Command } from 'cmdk';
import { Bell, FileSpreadsheet, GraduationCap, LayoutDashboard, Search, Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '../../shared/types';
import { apiFetch } from '../shared/api';

export function CommandPalette({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
}) {
  const navigate = useNavigate();
  const isStaff = user.role === 'admin' || user.role === 'staff';
  const [phds, setPhds] = useState<any[]>([]);
  const [scientists, setScientists] = useState<any[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ items: any[] }>('/api/phd-students')
      .then((d) => setPhds(d.items || []))
      .catch(() => {});
    if (isStaff) {
      apiFetch<{ items: any[] }>('/api/scientists?listType=all')
        .then((d) => setScientists(d.items || []))
        .catch(() => {});
    }
  }, [open, isStaff]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  if (!open) return null;

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Tra cứu nhanh UET PhDHub">
      <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-[2px] flex items-start justify-center pt-[14vh] px-4" onClick={() => onOpenChange(false)}>
        <div
          className="w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2.5 px-3.5 border-b border-slate-200">
            <Search size={15} className="text-slate-400 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Tìm Mã NCS, Họ tên, Đề tài, Cán bộ hướng dẫn hoặc chức năng..."
              className="w-full h-11 text-sm bg-transparent border-0 outline-none text-slate-900 placeholder:text-slate-400"
            />
            <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
          </div>
          <Command.List className="py-1.5">
            <Command.Empty className="py-8 text-center text-xs text-slate-500">
              Không tìm thấy kết quả khớp.
            </Command.Empty>

            <Command.Group heading="Điều hướng nhanh">
              {isStaff && (
                <>
                  <Command.Item onSelect={() => go('/')}>
                    <span className="inline-flex items-center gap-2"><LayoutDashboard size={14} /> Tổng quan Phòng CTSV</span>
                  </Command.Item>
                  <Command.Item onSelect={() => go('/ncs')}>
                    <span className="inline-flex items-center gap-2"><GraduationCap size={14} /> Danh sách Nghiên cứu sinh</span>
                  </Command.Item>
                  <Command.Item onSelect={() => go('/scientists')}>
                    <span className="inline-flex items-center gap-2"><Users size={14} /> Danh sách Cán bộ & Hội đồng</span>
                  </Command.Item>
                  <Command.Item onSelect={() => go('/import')}>
                    <span className="inline-flex items-center gap-2"><FileSpreadsheet size={14} /> Import / Export Excel</span>
                  </Command.Item>
                </>
              )}
              <Command.Item onSelect={() => go('/notifications')}>
                <span className="inline-flex items-center gap-2"><Bell size={14} /> Thông báo & Nhắc hạn</span>
              </Command.Item>
              {user.role === 'admin' && (
                <Command.Item onSelect={() => go('/settings')}>
                  <span className="inline-flex items-center gap-2"><Settings size={14} /> Cài đặt Quy chế 3638</span>
                </Command.Item>
              )}
            </Command.Group>

            {phds.length > 0 && (
              <Command.Group heading="Nghiên cứu sinh">
                {phds.slice(0, 12).map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`${p.phd_code} ${p.full_name} ${p.dissertation_title || ''} ${p.faculty_name || ''}`}
                    onSelect={() => go(`/ncs/${p.id}`)}
                  >
                    <div className="min-w-0">
                      <span className="mono text-xs font-semibold text-[#034ea1] mr-2">{p.phd_code}</span>
                      <span className="font-medium text-slate-900">{p.full_name}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{p.faculty_short_name || p.cohort}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {scientists.length > 0 && (
              <Command.Group heading="Cán bộ / Nhà khoa học">
                {scientists.slice(0, 10).map((s) => (
                  <Command.Item
                    key={s.id}
                    value={`${s.full_name} ${s.title_display} ${s.work_unit || ''} ${s.specialization || ''}`}
                    onSelect={() => go(`/scientists?search=${encodeURIComponent(s.full_name)}`)}
                  >
                    <span className="font-medium text-slate-900">
                      {s.title_display} {s.full_name}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{s.work_unit}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}
