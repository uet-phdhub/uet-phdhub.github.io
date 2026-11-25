import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowLeftRight,
  Bell,
  ChevronDown,
  LogOut,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { AuthUser, FacultyItem, MajorItem, Regulation3638Config } from '../shared/types';
import { CommandPalette } from './components/CommandPalette';
import { DashboardPage } from './pages/DashboardPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PhdDetailPage } from './pages/PhdDetailPage';
import { PhdListPage } from './pages/PhdListPage';
import { ScientistsPage } from './pages/ScientistsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupervisorPortalPage } from './pages/SupervisorPortalPage';
import { apiFetch } from './shared/api';
import { GOOGLE_CLIENT_ID } from './shared/config';
import { cn } from './shared/ui';

export interface AppCatalogs {
  faculties: FacultyItem[];
  majors: MajorItem[];
  regulationConfig: Regulation3638Config | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị Phòng CTSV',
  staff: 'Chuyên viên Phòng CTSV',
  supervisor: 'Cán bộ hướng dẫn',
  phd_student: 'Nghiên cứu sinh',
};

function TopNavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'h-10 inline-flex items-center px-3 text-[13px] border-b-2 transition-colors whitespace-nowrap',
        active
          ? 'border-[#034ea1] text-[#034ea1] font-semibold'
          : 'border-transparent text-slate-600 font-medium hover:text-slate-900'
      )}
    >
      {label}
    </Link>
  );
}

function AuthenticatedShell({
  user,
  catalogs,
  unreadCount,
  onRefreshCatalogs,
  onRefreshUnread,
  onLogout,
}: {
  user: AuthUser;
  catalogs: AppCatalogs;
  unreadCount: number;
  onRefreshCatalogs: () => Promise<void>;
  onRefreshUnread: () => Promise<void>;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [cmdOpen, setCmdOpen] = useState(false);

  const isStaff = user.role === 'admin' || user.role === 'staff';
  const isSupervisorView =
    location.pathname.startsWith('/supervisor') || new URLSearchParams(location.search).get('view') === 'supervisor';
  const canSwitchRole = isStaff && user.is_supervisor === 1 && Boolean(user.scientist_id);

  const defaultRoute = isStaff
    ? '/'
    : user.role === 'supervisor'
      ? '/supervisor'
      : user.phd_student_id
        ? `/ncs/${user.phd_student_id}`
        : '/notifications';

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      {/* Restored Official UET Blue Header — Compact & Uncluttered */}
      <header className="uet-header text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to={defaultRoute} className="flex items-center gap-3 min-w-0 hover:opacity-95">
            <img
              src={`${import.meta.env.BASE_URL}uet-logo-white.png`}
              alt="Trường Đại học Công nghệ - ĐHQGHN"
              className="h-8 w-auto object-contain shrink-0"
            />
            <span className="hidden sm:inline-block h-5 w-px bg-white/25" />
            <span className="hidden sm:inline text-[13px] font-semibold text-white/95 truncate">
              Quản lý Nghiên cứu sinh
            </span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="h-8 px-2.5 rounded-md bg-white/12 hover:bg-white/20 text-white/90 text-xs inline-flex items-center gap-2 cursor-pointer transition-colors"
              title="Tìm nhanh (Ctrl + K)"
            >
              <Search size={14} />
              <span className="hidden md:inline text-white/80">Tìm nhanh</span>
              <kbd className="hidden md:inline font-mono text-[10px] text-white/75 bg-white/10 px-1 rounded">Ctrl K</kbd>
            </button>

            {canSwitchRole && (
              <button
                type="button"
                onClick={() => navigate(isSupervisorView ? '/' : '/supervisor')}
                className="h-8 px-2.5 rounded-md bg-white/12 hover:bg-white/20 border border-white/20 text-xs font-medium text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowLeftRight size={13} />
                <span className="hidden sm:inline">{isSupervisorView ? 'Phòng CTSV' : 'Trang CBHD'}</span>
              </button>
            )}

            <Link
              to="/notifications"
              className="relative w-8 h-8 rounded-md hover:bg-white/15 inline-flex items-center justify-center text-white transition-colors"
              title="Thông báo"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-400 ring-2 ring-[#075fc7]" />
              )}
            </Link>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="h-8 pl-1.5 pr-2 rounded-md hover:bg-white/15 inline-flex items-center gap-2 text-xs text-white cursor-pointer transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-white/20 text-[11px] font-semibold flex items-center justify-center">
                    {user.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden md:inline font-medium max-w-[140px] truncate">{user.name}</span>
                  <ChevronDown size={13} className="text-white/75" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg text-xs">
                  <div className="px-2.5 py-2 border-b border-slate-100 mb-1">
                    <div className="font-semibold text-slate-900 truncate">{user.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{ROLE_LABELS[user.role] || user.role}</div>
                  </div>
                  {canSwitchRole && (
                    <DropdownMenu.Item
                      onSelect={() => navigate(isSupervisorView ? '/' : '/supervisor')}
                      className="flex items-center gap-2 px-2.5 py-2 rounded text-slate-700 hover:bg-slate-100 cursor-pointer outline-none"
                    >
                      <ArrowLeftRight size={13} />
                      <span>{isSupervisorView ? 'Về Phòng CTSV' : 'Sang Trang CBHD'}</span>
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    onSelect={onLogout}
                    className="flex items-center gap-2 px-2.5 py-2 rounded text-rose-700 hover:bg-rose-50 cursor-pointer outline-none"
                  >
                    <LogOut size={13} />
                    <span>Đăng xuất</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Single Crisp Horizontal Navigation Strip (40px, fit-uet CampaignChrome rhythm) */}
        <nav className="bg-white border-b border-slate-200 text-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {isStaff && !isSupervisorView && (
              <>
                <TopNavLink to="/" label="Tổng quan" active={location.pathname === '/'} />
                <TopNavLink to="/ncs" label="Nghiên cứu sinh" active={location.pathname.startsWith('/ncs')} />
                <TopNavLink to="/scientists" label="Cán bộ & Hội đồng" active={location.pathname.startsWith('/scientists')} />
                <TopNavLink to="/import" label="Excel" active={location.pathname.startsWith('/import')} />
                <TopNavLink to="/notifications" label="Thông báo" active={location.pathname.startsWith('/notifications')} />
                {user.role === 'admin' && (
                  <TopNavLink to="/settings" label="Cài đặt 3638" active={location.pathname.startsWith('/settings')} />
                )}
              </>
            )}

            {(user.role === 'supervisor' || isSupervisorView) && (
              <>
                <TopNavLink to="/supervisor" label="Trang CBHD" active={location.pathname === '/supervisor'} />
                <TopNavLink to="/ncs?view=supervisor" label="NCS hướng dẫn" active={location.pathname.startsWith('/ncs')} />
                <TopNavLink to="/notifications" label="Thông báo" active={location.pathname.startsWith('/notifications')} />
              </>
            )}

            {user.role === 'phd_student' && (
              <>
                {user.phd_student_id && (
                  <TopNavLink to={`/ncs/${user.phd_student_id}`} label="Hồ sơ của tôi" active={location.pathname.startsWith('/ncs')} />
                )}
                <TopNavLink to="/notifications" label="Thông báo" active={location.pathname.startsWith('/notifications')} />
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Airy Centered Workspace */}
      <main className="workspace-content flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Routes>
          <Route path="/" element={isStaff ? <DashboardPage user={user} /> : <Navigate to={defaultRoute} replace />} />
          <Route path="/ncs" element={<PhdListPage user={user} catalogs={catalogs} />} />
          <Route path="/ncs/:id" element={<PhdDetailPage user={user} catalogs={catalogs} />} />
          <Route path="/scientists" element={isStaff ? <ScientistsPage user={user} catalogs={catalogs} /> : <Navigate to={defaultRoute} replace />} />
          <Route path="/import" element={isStaff ? <ImportExportPage user={user} /> : <Navigate to={defaultRoute} replace />} />
          <Route path="/notifications" element={<NotificationsPage user={user} onUnreadChanged={onRefreshUnread} />} />
          <Route path="/settings" element={user.role === 'admin' ? <SettingsPage catalogs={catalogs} onRefreshCatalogs={onRefreshCatalogs} /> : <Navigate to={defaultRoute} replace />} />
          <Route path="/supervisor" element={user.scientist_id ? <SupervisorPortalPage user={user} catalogs={catalogs} /> : <Navigate to={defaultRoute} replace />} />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Trường Đại học Công nghệ — ĐHQGHN · Phòng Công tác sinh viên</span>
          <span>Quy chế 3638/QĐ-ĐHQGHN</span>
        </div>
      </footer>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} user={user} />
    </div>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string, user: AuthUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [devAccounts, setDevAccounts] = useState<any[]>([]);
  const [devEnabled, setDevEnabled] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ enabled: boolean; accounts: any[] }>('/api/auth/dev-accounts')
      .then((data) => {
        setDevEnabled(Boolean(data.enabled));
        setDevAccounts(data.accounts || []);
      })
      .catch(() => { });
  }, []);

  const handleGoogleSuccess = async (cred: any) => {
    setError(null);
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential: cred.credential }),
      });
      onLoggedIn(data.token, data.user);
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại.');
    }
  };

  const handleDevLogin = async (email: string) => {
    setError(null);
    setLoadingEmail(email);
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      onLoggedIn(data.token, data.user);
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại.');
    } finally {
      setLoadingEmail(null);
    }
  };

  const hasRealGoogleId = Boolean(GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes('mock'));

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <header className="uet-header text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}uet-logo-white.png`} alt="UET VNU" className="h-8 w-auto object-contain" />
          <span className="h-5 w-px bg-white/25" />
          <span className="text-[13px] font-semibold">Quản lý Nghiên cứu sinh</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="text-center space-y-1">
            <h1 className="font-display text-xl font-bold text-slate-900">Đăng nhập</h1>
            <p className="text-xs text-slate-500">Email <strong className="text-[#034ea1]">@vnu.edu.vn</strong> hoặc email đã đăng ký</p>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>
          )}

          {hasRealGoogleId && (
            <div className="flex justify-center">
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Lỗi xác thực Google.')} shape="rectangular" width="300" />
            </div>
          )}

          {devEnabled && devAccounts.length > 0 && (
            <div className={hasRealGoogleId ? 'pt-4 border-t border-slate-200 space-y-2' : 'space-y-2'}>
              <div className="text-[11px] font-medium text-slate-400">Đăng nhập thử nghiệm</div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {devAccounts.slice(0, 6).map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={loadingEmail === acc.email}
                    onClick={() => handleDevLogin(acc.email)}
                    className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-xs font-medium text-slate-900 truncate">{acc.name}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {acc.role === 'admin' ? (acc.is_supervisor ? 'Admin · CBHD' : 'Admin') : acc.role === 'staff' ? 'CTSV' : acc.role === 'supervisor' ? 'CBHD' : 'NCS'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('phdhub_token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('phdhub_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [catalogs, setCatalogs] = useState<AppCatalogs>({ faculties: [], majors: [], regulationConfig: null });
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('phdhub_token');
    localStorage.removeItem('phdhub_user');
    setToken(null);
    setUser(null);
    setUnreadCount(0);
  }, []);

  const refreshCatalogs = useCallback(async () => {
    if (!localStorage.getItem('phdhub_token')) return;
    try {
      setCatalogs(await apiFetch<AppCatalogs>('/api/catalogs'));
    } catch { }
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!localStorage.getItem('phdhub_token')) return;
    try {
      const data = await apiFetch<{ user: AuthUser; unreadNotifications: number }>('/api/auth/me');
      setUser(data.user);
      localStorage.setItem('phdhub_user', JSON.stringify(data.user));
      setUnreadCount(data.unreadNotifications || 0);
    } catch { }
  }, []);

  useEffect(() => {
    const onExpired = () => handleLogout();
    window.addEventListener('phdhub-auth-expired', onExpired);
    return () => window.removeEventListener('phdhub-auth-expired', onExpired);
  }, [handleLogout]);

  useEffect(() => {
    if (!token) return;
    refreshCatalogs();
    refreshUnread();
  }, [token, refreshCatalogs, refreshUnread]);

  const handleLoggedIn = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem('phdhub_token', newToken);
    localStorage.setItem('phdhub_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Toaster position="bottom-right" duration={2200} richColors closeButton toastOptions={{ className: 'text-xs' }} />
      <HashRouter>
        {!token || !user ? (
          <LoginScreen onLoggedIn={handleLoggedIn} />
        ) : (
          <AuthenticatedShell
            user={user}
            catalogs={catalogs}
            unreadCount={unreadCount}
            onRefreshCatalogs={refreshCatalogs}
            onRefreshUnread={refreshUnread}
            onLogout={handleLogout}
          />
        )}
      </HashRouter>
    </GoogleOAuthProvider>
  );
}
