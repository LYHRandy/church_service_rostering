import { getProfile, isGlobalAdmin } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { Badge, Button, EmptyState, inputClass } from '@/components/ui';
import { AssignControl, CreateSlotForm, PublishButton, RemoveAssignmentButton } from './controls';

// Slot creation (heads/pastor, T13) + assignment with live conflict blocking
// and explicit override (IC+/pastor, T14). Drafts are visible here via RLS.

interface SearchParams {
  ministry?: string;
}

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Singapore',
});

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export default async function AdminRosterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = (await getProfile())!;
  const supabase = await createClient();

  const isAdmin = isGlobalAdmin(profile);
  const manageableIds = isAdmin
    ? null // all
    : profile.memberships.filter((m) => m.role !== 'member').map((m) => m.ministryId);

  let ministryQuery = supabase.from('ministries').select('id, name').eq('status', 'active').order('name');
  if (manageableIds) {
    ministryQuery = ministryQuery.in('id', manageableIds);
  }
  const { data: ministries } = await ministryQuery;
  const ministry =
    (ministries ?? []).find((m) => m.id === params.ministry) ?? (ministries ?? [])[0];

  if (!ministry) {
    return (
      <main className="mx-auto max-w-5xl p-4">
        <EmptyState title="You do not manage any ministries." />
      </main>
    );
  }

  const canCreateSlots =
    isAdmin ||
    profile.memberships.some((m) => m.ministryId === ministry.id && m.role === 'head');

  const [{ data: slots }, { data: roster }] = await Promise.all([
    supabase
      .from('duty_slots')
      .select(
        'id, service_date, start_at, end_at, position, headcount, status, assignments(id, status, conflict_acknowledged, users!user_id(id, name))',
      )
      .eq('ministry_id', ministry.id)
      .gte('service_date', new Date().toISOString().slice(0, 10))
      .order('service_date')
      .order('start_at'),
    supabase
      .from('memberships')
      .select('role, positions, users(id, name)')
      .eq('ministry_id', ministry.id),
  ]);

  const members = (roster ?? [])
    .filter((m) => m.users)
    .map((m) => ({ id: m.users!.id, name: m.users!.name, positions: m.positions ?? [] }));

  const draftDates = (slots ?? []).filter((s) => s.status === 'draft').map((s) => s.service_date);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Manage roster — {ministry.name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {(ministries ?? []).length > 1 && (
            <form method="get" className="flex items-center gap-2 text-sm">
              <select name="ministry" defaultValue={ministry.id} aria-label="Ministry" className={inputClass}>
                {(ministries ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                Switch
              </Button>
            </form>
          )}
          {draftDates.length > 0 && (
            <PublishButton
              ministryId={ministry.id}
              from={draftDates.reduce((a, b) => (a < b ? a : b))}
              to={draftDates.reduce((a, b) => (a > b ? a : b))}
              draftCount={draftDates.length}
            />
          )}
        </div>
      </div>

      {canCreateSlots && <CreateSlotForm ministryId={ministry.id} />}

      {(slots ?? []).length === 0 && (
        <EmptyState
          title="No upcoming duty slots."
          hint={canCreateSlots ? 'Add the first slot above.' : 'The ministry head creates slots here.'}
        />
      )}

      <ul className="space-y-3">
        {(slots ?? []).map((slot) => (
          <li
            key={slot.id}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">
                {DATE_FMT.format(new Date(`${slot.service_date}T00:00:00Z`))}
              </span>
              <span className="tabular-nums text-gray-500">
                {TIME_FMT.format(new Date(slot.start_at))}
                {slot.end_at ? `–${TIME_FMT.format(new Date(slot.end_at))}` : ' (2h buffer)'}
              </span>
              <span className="font-medium">{slot.position}</span>
              <Badge tone={slot.status === 'draft' ? 'draft' : 'published'}>{slot.status}</Badge>
              <span className="text-xs text-gray-400">
                {slot.assignments.length}/{slot.headcount} filled
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <div className="space-y-1 text-sm">
                {slot.assignments.length === 0 && (
                  <span className="text-gray-400">No one assigned yet</span>
                )}
                {slot.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5">
                    <span>
                      {a.users?.name}
                      {a.conflict_acknowledged && <span title="Conflict override"> ⚠️</span>}
                      {a.status === 'confirmed' ? ' ✅' : ''}
                    </span>
                    <RemoveAssignmentButton assignmentId={a.id} />
                  </div>
                ))}
              </div>
              <AssignControl
                slotId={slot.id}
                members={members.filter(
                  (m) => !slot.assignments.some((a) => a.users?.id === m.id),
                )}
              />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
