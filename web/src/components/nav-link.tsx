'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Tailwind UI navbar tab: indigo underline on the active section.
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex shrink-0 items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors ${
        active
          ? 'border-indigo-600 text-gray-900 dark:border-indigo-400 dark:text-gray-100'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </Link>
  );
}
