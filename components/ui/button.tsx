import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'celebrate'

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-500 text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] hover:bg-primary-600',
  secondary: 'bg-surface text-neutral-900 border-2 border-primary-200 hover:bg-primary-50',
  ghost: 'bg-transparent text-neutral-600 hover:text-neutral-900',
  celebrate: 'bg-primary-500 text-white border-[3px] border-ink shadow-hard active:translate-x-[1px] active:translate-y-[1px]',
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  ...props
}: { variant?: ButtonVariant; fullWidth?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-5 py-3 font-bold transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${BUTTON_VARIANT[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    />
  )
}
