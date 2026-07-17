import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { canManage, getProfile } from "@/lib/profile";
import { NavLink } from "@/components/nav-link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Church Duty Roster",
  description: "Serving rosters across ministries, with Telegram notifications",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getProfile();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {profile && (
          <header className="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <nav
              aria-label="Main"
              className="mx-auto flex h-14 max-w-6xl items-stretch gap-5 overflow-x-auto px-4 sm:px-6"
            >
              <span className="inline-flex shrink-0 items-center text-sm font-semibold">
                ⛪ Duty Roster
              </span>
              <NavLink href="/roster">Roster</NavLink>
              {canManage(profile) && (
                <>
                  <NavLink href="/admin/roster">Manage roster</NavLink>
                  <NavLink href="/admin/members">Members</NavLink>
                </>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <span className="hidden text-sm text-gray-500 sm:inline">{profile.name}</span>
                <form action="/logout" method="post" className="flex items-center">
                  <button
                    type="submit"
                    className="rounded-md px-2.5 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  >
                    Log out
                  </button>
                </form>
              </span>
            </nav>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
