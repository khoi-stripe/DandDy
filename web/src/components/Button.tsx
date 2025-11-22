import { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'btn inline-flex items-center justify-center gap-2'

  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
      ? 'btn-secondary'
      : variant === 'danger'
      ? 'btn-danger'
      : // ghost
        'btn-ghost'

  const sizeClass =
    size === 'sm'
      ? 'btn-sm'
      : size === 'lg'
      ? 'btn-lg'
      : 'btn-md'

  const widthClass = fullWidth ? 'w-full' : ''

  const isDisabled = disabled || loading

  return (
    <button
      className={`${base} ${variantClass} ${sizeClass} ${widthClass} ${className}`.trim()}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      {...props}
    >
      {loading && (
        <span className="inline-block h-4 w-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
      )}
      {leadingIcon}
      <span>{children}</span>
      {trailingIcon}
    </button>
  )
}




