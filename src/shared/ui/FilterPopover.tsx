import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

export function FilterPopover({
  activeCount = 0,
  onReset,
  children,
  align = 'left',
  widthClass = 'w-[min(340px,90vw)]',
}: {
  activeCount?: number;
  onReset?: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-9 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors',
          activeCount > 0 || open
            ? 'border-[#034ea1]/40 bg-[#eff5fc] text-[#034ea1]'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        )}
      >
        <SlidersHorizontal size={14} />
        <span>Bộ lọc</span>
        {activeCount > 0 && (
          <span className="tabular ml-0.5 px-1.5 py-0.2 rounded-full bg-[#034ea1] text-white text-[11px] font-semibold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Bộ lọc"
          className={cn(
            'uet-popover absolute top-[calc(100%+6px)] z-40 rounded-lg border border-slate-200 bg-white shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
            widthClass
          )}
        >
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">{children}</div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 rounded-b-lg flex items-center justify-between gap-2">
            {onReset ? (
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={() => {
                  onReset();
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Đặt lại
              </button>
            ) : (
              <span />
            )}
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              Áp dụng
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
