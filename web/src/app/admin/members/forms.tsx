'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, inputClass } from '@/components/ui';

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
    <form onSubmit={submit} className="flex w-full items-center gap-2 text-sm sm:w-auto">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New ministry name"
        aria-label="New ministry name"
        required
        className={`${inputClass} flex-1 sm:flex-none`}
      />
      <Button type="submit">Create</Button>
      {error && (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      )}
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
    <form
      onSubmit={submit}
      className="grid grid-cols-2 items-end gap-3 text-sm sm:flex sm:flex-wrap"
    >
      <Field label="Full name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Phone (optional)">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`${inputClass} sm:w-36`}
        />
      </Field>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'member' | 'ic' | 'head')}
          className={inputClass}
        >
          <option value="member">Member</option>
          <option value="ic">IC</option>
          <option value="head">Head</option>
        </select>
      </Field>
      <Field label="Positions (comma-separated)">
        <input
          value={positions}
          onChange={(e) => setPositions(e.target.value)}
          placeholder="e.g. vocals, sound"
          className={`${inputClass} sm:w-56`}
        />
      </Field>
      <Button type="submit" className="col-span-2 sm:col-span-1">
        Add member
      </Button>
      {error && (
        <span role="alert" className="col-span-2 text-red-600">
          {error}
        </span>
      )}
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
    <span className="flex items-center gap-2">
      <button
        onClick={generate}
        className="rounded-md px-1 py-0.5 text-blue-600 hover:underline dark:text-blue-400"
      >
        Generate invite
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
