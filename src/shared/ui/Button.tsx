import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tinted' | 'tinted-warning' | 'tinted-danger' | 'tinted-success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[#034ea1] text-white border-[#034ea1] hover:bg-[#023b7c] shadow-2xs',
  secondary: 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50 hover:border-slate-400/80 shadow-2xs',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-[#b42318] text-white border-[#b42318] hover:bg-[#912018]',
  tinted: 'bg-[#eff5fc] text-[#034ea1] border-[#d2e4f8] hover:bg-[#dceaf9]',
  'tinted-warning': 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/80',
  'tinted-danger': 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/80',
  'tinted-success': 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7.5 px-2.5 text-xs gap-1.5',
  md: 'h-8.5 px-3 text-[13px] gap-1.5',
  lg: 'h-9.5 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
