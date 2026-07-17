// Shared UI primitives — class recipes only, no state, usable from server and
// client components alike. Neutral palette; green reserved for publish/confirm,
// red for destructive and conflict surfaces, amber for drafts.

import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export const inputClass =
  'w-full min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm ' +
  'placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 sm:w-auto';

const buttonVariants = {
  primary:
    'bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300',
  secondary:
    'border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
  success: 'bg-green-700 text-white hover:bg-green-600',
  danger: 'bg-red-700 text-white hover:bg-red-600',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      {...props}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariants[variant]} ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

const badgeTones = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div role="status" className="rounded-lg border border-dashed border-gray-300 py-12 text-center dark:border-gray-700">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}
