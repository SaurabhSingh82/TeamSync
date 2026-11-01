import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-teamsync-navy text-white hover:bg-teamsync-navy-light',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  quiet: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
}

export function Button({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
