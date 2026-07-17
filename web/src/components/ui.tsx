// Shared UI primitives following Tailwind UI application-UI recipes: white
// card surfaces on a gray-50 canvas, ring-inset inputs, indigo primary
// actions. Green stays reserved for publish/confirm, red for destructive and
// conflict surfaces, amber for drafts. No component library dependency —
// these are class recipes only, usable from server and client components.

import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export const inputClass =
  'block w-full min-w-0 rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-gray-900 ' +
  'shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 ' +
  'focus:ring-2 focus:ring-inset focus:ring-indigo-600 ' +
  'dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 sm:w-auto';

const buttonVariants = {
  primary:
    'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary:
    'bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 ' +
    'dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:hover:bg-gray-800',
  success: 'bg-green-700 text-white shadow-sm hover:bg-green-600',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      {...props}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariants[variant]} ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium leading-none text-gray-900 dark:text-gray-100">
        {label}
      </span>
      {children}
    </label>
  );
}

const badgeTones = {
  draft: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-900/40 dark:text-amber-200',
  published:
    'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/40 dark:text-green-200',
  neutral: 'bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-300',
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
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

// White surface on the gray canvas — Tailwind UI "card".
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-lg bg-white shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-gray-800 ${className}`}
    >
      {children}
    </div>
  );
}

// Card that hosts a full-width table; scrolls horizontally on small screens
// so the table keeps its real column structure at every width.
export function TableCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <div className="overflow-x-auto rounded-lg">{children}</div>
    </Card>
  );
}

export const tableClass = 'min-w-full divide-y divide-gray-200 dark:divide-gray-800';
export const theadClass = 'bg-gray-50 dark:bg-gray-950/40';
export const thClass =
  'px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:pl-4 last:pr-4';
export const tbodyClass = 'divide-y divide-gray-100 dark:divide-gray-800';
export const tdClass = 'px-3 py-3 text-sm first:pl-4 last:pr-4';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-gray-300 bg-white/50 py-12 text-center dark:border-gray-700 dark:bg-transparent"
    >
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}
