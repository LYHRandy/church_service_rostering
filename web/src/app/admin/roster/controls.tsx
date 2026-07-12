'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Conflict {
  ministry_name: string;
  position: string;
  start_at: string;
  end_at: string | null;
}

interface AssignResult {
  status: 'assigned' | 'conflict' | 'already_assigned';
  conflicts?: Conflict[];
}

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Singapore',
});

export function AssignControl({
  slotId,
  members,
}: {
  slotId: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function assign(allowConflict: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc('assign_member', {
        p_duty_slot_id: slotId,
        p_user_id: selected,
        p_allow_conflict: allowConflict,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      const result = data as unknown as AssignResult;
      if (result.status === 'conflict') {
        setConflicts(result.conflicts ?? []);
        return;
      }
      if (result.status === 'already_assigned') {
        setError('Already assigned to this slot.');
        return;
      }
      setConflicts(null);
      setSelected('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <div className="flex items-center gap-1">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setConflicts(null);
            setError(null);
          }}
          className="rounded border border-gray-300 px-1.5 py-1 dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">Select member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => assign(false)}
          disabled={!selected || busy}
          className="rounded bg-gray-900 px-2 py-1 text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
        >
          Assign
        </button>
      </div>

      {conflicts && (
        <div className="mt-2 max-w-xs rounded border border-red-300 bg-red-50 p-2 text-xs dark:border-red-800 dark:bg-red-950">
          <p className="font-medium text-red-800 dark:text-red-200">
            ⚠️ Schedule conflict — assignment blocked:
          </p>
          <ul className="mt-1 list-inside list-disc text-red-700 dark:text-red-300">
            {conflicts.map((c, i) => (
              <li key={i}>
                {c.ministry_name} — {c.position}, {TIME_FMT.format(new Date(c.start_at))}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => assign(true)}
              disabled={busy}
              className="rounded bg-red-700 px-2 py-1 text-white"
            >
              Allow conflict anyway
            </button>
            <button
              onClick={() => setConflicts(null)}
              className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function RemoveAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('remove_assignment', {
      p_assignment_id: assignmentId,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button
        onClick={remove}
        title="Remove assignment"
        className="text-gray-400 hover:text-red-600"
      >
        ✕
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}

export function CreateSlotForm({ ministryId }: { ministryId: string }) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('');
  const [position, setPosition] = useState('');
  const [headcount, setHeadcount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('create_duty_slot', {
      p_ministry_id: ministryId,
      p_service_date: date,
      p_start_at: new Date(`${date}T${start}:00`).toISOString(),
      p_end_at: end ? new Date(`${date}T${end}:00`).toISOString() : undefined,
      p_position: position,
      p_headcount: headcount,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setPosition('');
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded border border-gray-200 p-3 text-sm dark:border-gray-800"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Service date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Start</span>
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">End (blank = 2h buffer)</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Position</span>
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="e.g. vocals"
          required
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Headcount</span>
        <input
          type="number"
          min={1}
          value={headcount}
          onChange={(e) => setHeadcount(Number(e.target.value))}
          className="w-20 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1.5 text-white dark:bg-gray-100 dark:text-gray-900">
        Add slot
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  );
}

export function PublishButton({
  ministryId,
  from,
  to,
  draftCount,
}: {
  ministryId: string;
  from: string;
  to: string;
  draftCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('publish_roster', {
        p_ministry_id: ministryId,
        p_from: from,
        p_to: to,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <button
        onClick={publish}
        disabled={busy}
        className="rounded bg-green-700 px-3 py-1.5 text-white disabled:opacity-40"
      >
        Publish {draftCount} draft slot{draftCount === 1 ? '' : 's'} &amp; notify
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
