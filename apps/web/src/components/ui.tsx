import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Building blocks on the Teste House tokens (globals.css). Server-safe: no hooks here.
 * Radius follows hierarchy: controls 8px (rounded-control), cards 12px (rounded-card).
 */

export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
type Size = 'sm' | 'md' | 'lg';

/** Button look as a class string, so links (`<Link>`) can share it. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    size === 'sm' && 'h-8 px-3 text-sm',
    size === 'md' && 'h-10 px-4 text-sm',
    size === 'lg' && 'h-12 px-6 text-base',
    variant === 'primary' && 'bg-petrol text-white hover:bg-petrol-soft active:bg-neutral-950',
    variant === 'accent' && 'bg-haldi text-petrol hover:bg-[#d9960f]',
    variant === 'secondary' &&
      'border border-line bg-surface text-ink hover:border-neutral-300 hover:bg-neutral-50',
    variant === 'ghost' && 'text-petrol hover:bg-petrol-tint',
    variant === 'danger' && 'bg-danger text-white hover:bg-[#9a1d14]',
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

const fieldClass =
  'block w-full rounded-control border border-line bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-neutral-400 transition-colors hover:border-neutral-300 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15 disabled:bg-neutral-100 aria-[invalid=true]:border-danger';

// ComponentProps includes `ref` (React 19 passes it as a normal prop).
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(fieldClass, 'h-10', className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(fieldClass, className)} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(fieldClass, 'h-10 pr-8', className)} />;
}

/** Label, control, optional hint and error message. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-control border-l-4 px-4 py-3 text-sm',
        tone === 'error' && 'border-danger bg-danger-soft text-[#7a1810]',
        tone === 'success' && 'border-success bg-success-soft text-[#155637]',
        tone === 'info' && 'border-petrol bg-petrol-tint text-petrol',
        tone === 'warning' && 'border-warning bg-warning-soft text-[#6e3f05]',
      )}
    >
      {children}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('rounded-card border border-line bg-surface p-5 sm:p-6', className)}>
      {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-petrol">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'brand';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-neutral-100 text-neutral-700',
        tone === 'green' && 'bg-success-soft text-success',
        tone === 'red' && 'bg-danger-soft text-danger',
        tone === 'amber' && 'bg-warning-soft text-warning',
        tone === 'brand' && 'bg-haldi text-petrol',
      )}
    >
      {children}
    </span>
  );
}

/** Centered card for the sign-in style pages (customer and admin). */
export function AuthCard({
  title,
  subtitle,
  brand,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Logo above the card (AuthShell passes the store logo). */
  brand?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-rice px-4 py-12">
      {brand}
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 sm:p-8">
        <h1 className="font-display text-[28px] leading-tight text-petrol">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
