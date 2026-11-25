import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  widthClass = 'w-[min(680px,95vw)]',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="uet-overlay" />
        <DialogPrimitive.Content className={cn('uet-modal', widthClass)}>
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 shrink-0">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-[15px] font-semibold text-slate-900 leading-snug">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-xs text-slate-500 mt-0.5">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Đóng"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
          {footer && (
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2 shrink-0 rounded-b-[10px]">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  headerActions,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="uet-overlay" />
        <DialogPrimitive.Content className="uet-drawer">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0 bg-white">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-base font-semibold text-slate-900 leading-snug truncate">
                {title}
              </DialogPrimitive.Title>
              {subtitle && (
                <DialogPrimitive.Description className="text-xs text-slate-500 mt-0.5 truncate">
                  {subtitle}
                </DialogPrimitive.Description>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {headerActions}
              <DialogPrimitive.Close
                aria-label="Đóng"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
          {footer && (
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
