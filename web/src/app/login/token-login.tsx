'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Handles sign-in links minted by the bot's /login command:
// /login?token_hash=… → verifyOtp → session. The widget below stays available
// as a fallback when the link is expired or already used.
export function TokenLogin({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // token is single-use; never exchange twice
    started.current = true;
    (async () => {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: 'email',
        token_hash: tokenHash,
      });
      if (otpError) {
        setError(
          'This sign-in link is invalid, expired, or already used. Send /login to the bot for a fresh one, or use the button below.',
        );
        return;
      }
      router.replace('/roster');
      router.refresh();
    })();
  }, [tokenHash, router]);

  if (error) {
    return <p className="max-w-sm text-center text-sm text-red-600">{error}</p>;
  }
  return <p className="text-sm text-gray-500">Signing you in…</p>;
}
