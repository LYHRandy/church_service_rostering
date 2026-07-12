import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { canManage, getProfile } from "@/lib/profile";
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
          <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
              <span className="font-semibold">Duty Roster</span>
              <Link href="/roster" className="hover:underline">
                Roster
              </Link>
              {canManage(profile) && (
                <>
                  <Link href="/admin/roster" className="hover:underline">
                    Manage roster
                  </Link>
                  <Link href="/admin/members" className="hover:underline">
                    Members
                  </Link>
                </>
              )}
              <span className="ml-auto text-gray-500">{profile.name}</span>
              <form action="/logout" method="post">
                <button type="submit" className="text-gray-500 hover:underline">
                  Log out
                </button>
              </form>
            </nav>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
