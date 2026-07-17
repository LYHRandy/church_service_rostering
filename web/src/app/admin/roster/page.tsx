import { getProfile, isGlobalAdmin } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  TableCard,
  inputClass,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from '@/components/ui';
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
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
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
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={`Manage roster — ${ministry.name}`}>
        {(ministries ?? []).length > 1 && (
          <form method="get" className="flex items-center gap-2">
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
      </PageHeader>

      {canCreateSlots && <CreateSlotForm ministryId={ministry.id} />}

      {(slots ?? []).length === 0 ? (
        <EmptyState
          title="No upcoming duty slots."
          hint={canCreateSlots ? 'Add the first slot above.' : 'The ministry head creates slots here.'}
        />
      ) : (
        <TableCard>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>
                  Date
                </th>
                <th scope="col" className={thClass}>
                  Time
                </th>
                <th scope="col" className={thClass}>
                  Position
                </th>
                <th scope="col" className={thClass}>
                  Status
                </th>
                <th scope="col" className={thClass}>
                  Assigned
                </th>
                <th scope="col" className={thClass}>
                  Assign
                </th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {(slots ?? []).map((slot) => (
                <tr key={slot.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className={`${tdClass} whitespace-nowrap font-medium`}>
                    {DATE_FMT.format(new Date(`${slot.service_date}T00:00:00Z`))}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap tabular-nums text-gray-500`}>
                    {TIME_FMT.format(new Date(slot.start_at))}
                    {slot.end_at ? `–${TIME_FMT.format(new Date(slot.end_at))}` : ' (2h buffer)'}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap font-medium`}>{slot.position}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <Badge tone={slot.status === 'draft' ? 'draft' : 'published'}>
                      {slot.status}
                    </Badge>
                    <div className="mt-1 text-xs text-gray-400">
                      {slot.assignments.length}/{slot.headcount} filled
                    </div>
                  </td>
                  <td className={tdClass}>
                    {slot.assignments.length === 0 && (
                      <span className="text-gray-400">—</span>
                    )}
                    <div className="space-y-1">
                      {slot.assignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-1.5 whitespace-nowrap">
                          <span>
                            {a.users?.name}
                            {a.conflict_acknowledged && <span title="Conflict override"> ⚠️</span>}
                            {a.status === 'confirmed' ? ' ✅' : ''}
                          </span>
                          <RemoveAssignmentButton assignmentId={a.id} />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className={tdClass}>
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
        </TableCard>
      )}
    </main>
  );
}
