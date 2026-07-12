'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function CreateMinistryForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('create_ministry', { p_name: name });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setName('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 text-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New ministry name"
        required
        className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
      />
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white dark:bg-gray-100 dark:text-gray-900">
        Create
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  );
}

export function AddMemberForm({ ministryId }: { ministryId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'member' | 'ic' | 'head'>('member');
  const [positions, setPositions] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('add_member', {
      p_name: name,
      p_phone: phone.trim() || undefined,
      p_ministry_id: ministryId,
      p_role: role,
      p_positions: positions
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setName('');
    setPhone('');
    setPositions('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-sm dark:border-gray-900">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        required
        className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="w-36 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as 'member' | 'ic' | 'head')}
        className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
      >
        <option value="member">Member</option>
        <option value="ic">IC</option>
        <option value="head">Head</option>
      </select>
      <input
        value={positions}
        onChange={(e) => setPositions(e.target.value)}
        placeholder="Positions (comma-separated)"
        className="w-56 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
      />
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white dark:bg-gray-100 dark:text-gray-900">
        Add member
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  );
}

export function InviteButton({ userId }: { userId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  async function generate() {
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('create_invite', {
      p_user_id: userId,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const url = `https://t.me/${bot}?start=${data}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard unavailable (e.g. non-HTTPS) — the link is still shown
    }
  }

  if (link) {
    return (
      <span className="text-xs text-green-700 dark:text-green-400" title={link}>
        copied ✓
      </span>
    );
  }
  return (
    <span>
      <button onClick={generate} className="text-blue-600 hover:underline dark:text-blue-400">
        Generate invite
      </button>
      {error && <span className="ml-2 text-red-600">{error}</span>}
    </span>
  );
}
