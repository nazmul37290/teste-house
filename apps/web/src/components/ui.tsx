import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from 'react';

/** Small, unstyled-library building blocks (Tailwind only). Server-safe: no hooks here. */

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-neutral-900 text-white hover:bg-neutral-700',
        variant === 'secondary' &&
          'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
        className,
      )}
    />
  );
}

const fieldClass =
  'block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:bg-neutral-100';

// ComponentProps includes `ref` (React 19 passes it as a normal prop).
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(fieldClass, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(fieldClass, className)} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(fieldClass, className)} />;
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
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-neutral-500">{hint}</p>
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
        'rounded-md border px-4 py-3 text-sm',
        tone === 'error' && 'border-red-200 bg-red-50 text-red-800',
        tone === 'success' && 'border-green-200 bg-green-50 text-green-800',
        tone === 'info' && 'border-blue-200 bg-blue-50 text-blue-800',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
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
    <section
      className={cx('rounded-lg border border-neutral-200 bg-white p-6 shadow-sm', className)}
    >
      {title ? <h2 className="text-base font-semibold text-neutral-900">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-neutral-600">{description}</p> : null}
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-neutral-600">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'green' | 'red' | 'amber';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-neutral-100 text-neutral-700',
        tone === 'green' && 'bg-green-100 text-green-800',
        tone === 'red' && 'bg-red-100 text-red-800',
        tone === 'amber' && 'bg-amber-100 text-amber-900',
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
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-neutral-600">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
