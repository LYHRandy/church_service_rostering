import { getProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
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

export default async function AdminRosterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = (await getProfile())!;
  const supabase = await createClient();

  const isPastor = profile.globalRole === 'pastor';
  const manageableIds = isPastor
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
        <p className="text-gray-500">You do not manage any ministries.</p>
      </main>
    );
  }

  const canCreateSlots =
    isPastor ||
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
        <div className="flex items-center gap-3">
          <form method="get" className="text-sm">
            <select
              name="ministry"
              defaultValue={ministry.id}
              className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            >
              {(ministries ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button type="submit" className="ml-2 rounded border border-gray-300 px-2 py-1 dark:border-gray-700">
              Switch
            </button>
          </form>
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

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1 font-normal">Date</th>
            <th className="py-1 font-normal">Time</th>
            <th className="py-1 font-normal">Position</th>
            <th className="py-1 font-normal">Status</th>
            <th className="py-1 font-normal">Assigned</th>
            <th className="py-1 font-normal">Assign</th>
          </tr>
        </thead>
        <tbody>
          {(slots ?? []).map((slot) => (
            <tr key={slot.id} className="border-t border-gray-100 align-top dark:border-gray-900">
              <td className="py-2">{slot.service_date}</td>
              <td className="py-2 text-gray-500">
                {TIME_FMT.format(new Date(slot.start_at))}
                {slot.end_at ? `–${TIME_FMT.format(new Date(slot.end_at))}` : ' (2h buffer)'}
              </td>
              <td className="py-2 font-medium">{slot.position}</td>
              <td className="py-2">
                {slot.status === 'draft' ? (
                  <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    draft
                  </span>
                ) : (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                    published
                  </span>
                )}
                <div className="mt-1 text-xs text-gray-400">
                  {slot.assignments.length}/{slot.headcount} filled
                </div>
              </td>
              <td className="py-2">
                {slot.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-1">
                    <span>
                      {a.users?.name}
                      {a.conflict_acknowledged && <span title="Conflict override"> ⚠️</span>}
                      {a.status === 'confirmed' ? ' ✅' : ''}
                    </span>
                    <RemoveAssignmentButton assignmentId={a.id} />
                  </div>
                ))}
              </td>
              <td className="py-2">
                <AssignControl
                  slotId={slot.id}
                  members={members.filter(
                    (m) => !slot.assignments.some((a) => a.users?.id === m.id),
                  )}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
