'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

const ERROR_TEXT: Record<string, string> = {
  not_invited:
    'This Telegram account is not linked to a member profile. Tap your invite link in Telegram first.',
  verification_failed: 'Telegram login could not be verified. Please try again.',
};

export function LoginWidget() {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.onTelegramAuth = async (user: TelegramUser) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/telegram-auth`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            Object.fromEntries(Object.entries(user).map(([k, v]) => [k, String(v)])),
          ),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(ERROR_TEXT[body.error] ?? 'Login failed. Please try again.');
          return;
        }
        const supabase = createClient();
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'email',
          token_hash: body.token_hash,
        });
        if (otpError) {
          setError('Could not start a session. Please try again.');
          return;
        }
        router.replace('/roster');
        router.refresh();
      } finally {
        setBusy(false);
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute(
      'data-telegram-login',
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '',
    );
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    container.current?.appendChild(script);

    return () => {
      window.onTelegramAuth = undefined;
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={container} />
      {busy && <p className="text-sm text-gray-500">Signing you in…</p>}
      {error && <p className="max-w-sm text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
