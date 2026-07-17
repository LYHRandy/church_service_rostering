'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Field, inputClass } from '@/components/ui';

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
    <div className="w-full text-sm sm:w-auto">
      <div className="flex w-full items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setConflicts(null);
            setError(null);
          }}
          aria-label="Member to assign"
          className={`${inputClass} flex-1 sm:flex-none`}
        >
          <option value="">Select member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Button onClick={() => assign(false)} disabled={!selected || busy}>
          Assign
        </Button>
      </div>

      {conflicts && (
        <div
          role="alert"
          className="mt-2 max-w-sm rounded-md border border-red-300 bg-red-50 p-3 text-xs dark:border-red-800 dark:bg-red-950"
        >
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
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => assign(true)} disabled={busy}>
              Allow conflict anyway
            </Button>
            <Button variant="secondary" onClick={() => setConflicts(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
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
        aria-label="Remove assignment"
        title="Remove assignment"
        className="rounded-md px-1.5 py-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
      >
        ✕
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
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
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Add duty slot</h2>
      <form
        onSubmit={submit}
        className="grid grid-cols-2 items-end gap-3 text-sm sm:flex sm:flex-wrap"
      >
      <Field label="Service date">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Start">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
          className={inputClass}
        />
      </Field>
      <Field label="End (blank = 2h buffer)">
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Position">
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="e.g. vocals"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Headcount">
        <input
          type="number"
          min={1}
          value={headcount}
          onChange={(e) => setHeadcount(Number(e.target.value))}
          className={`${inputClass} sm:w-20`}
        />
      </Field>
        <Button type="submit" className="col-span-2 sm:col-span-1">
          Add slot
        </Button>
        {error && (
          <span role="alert" className="col-span-2 text-red-600">
            {error}
          </span>
        )}
      </form>
    </Card>
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
      <Button variant="success" onClick={publish} disabled={busy}>
        Publish {draftCount} draft slot{draftCount === 1 ? '' : 's'} &amp; notify
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
