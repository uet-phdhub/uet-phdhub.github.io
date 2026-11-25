import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export { Button, type ButtonSize, type ButtonVariant } from './Button';
export { ConfirmDialog } from './ConfirmDialog';
export { DataTable } from './DataTable';
export { Drawer, Modal } from './Dialog';
export { FilterPopover } from './FilterPopover';
export { cn } from './cn';

export type StatusTone = 'success' | 'info' | 'warning' | 'error' | 'neutral';

const dotMap: Record<StatusTone, string> = {
  success: 'bg-emerald-600',
  info: 'bg-[#034ea1]',
  warning: 'bg-amber-500',
  error: 'bg-rose-600',
  neutral: 'bg-slate-400',
};

const pillMap: Record<StatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  info: 'bg-[#eff5fc] text-[#034ea1] border-[#d2e4f8]',
  warning: 'bg-amber-50 text-amber-900 border-amber-200/80',
  error: 'bg-rose-50 text-rose-800 border-rose-200/80',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200/80',
};

export function StatusDot({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap', className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotMap[tone])} />
      <span>{children}</span>
    </span>
  );
}

export function Tag({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap tabular',
        pillMap[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg', className)} {...props}>
      {children}
    </div>
  );
}

export function PageTop({
  title,
  count,
  meta,
  actions,
}: {
  title: ReactNode;
  count?: number | string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-xl font-semibold text-slate-900 tracking-tight truncate">{title}</h1>
          {count !== undefined && (
            <span className="tabular text-xs font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {meta && <div className="text-xs text-slate-500 mt-0.5">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ value: T; label: string; count?: number; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('uet-tabs-list', className)} role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-state={active ? 'active' : 'inactive'}
            onClick={() => onChange(item.value)}
            className={cn('uet-tab-trigger', active && 'uet-tab-trigger--active')}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  'tabular text-[11px] px-1.5 rounded-full',
                  active ? 'bg-[#eff5fc] text-[#034ea1] font-semibold' : 'bg-slate-100 text-slate-500'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}
