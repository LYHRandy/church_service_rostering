import { createClient } from '@/lib/supabase/server';
import {
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

// Full-year published roster — readable by every signed-in member (SPEC §3.8).
// Draft slots are excluded here by query; RLS additionally hides them from
// non-admins. ⚠️ marks conflict-overridden assignments. Layout: Tailwind UI
// "table with grouped rows" — one table, a full-width header row per date.

interface SearchParams {
  year?: string;
  ministry?: string;
  member?: string;
}

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Singapore',
});

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();

  const supabase = await createClient();

  const [{ data: ministries }, { data: members }] = await Promise.all([
    supabase.from('ministries').select('id, name').eq('status', 'active').order('name'),
    supabase.from('users').select('id, name').order('name'),
  ]);

  let query = supabase
    .from('duty_slots')
    .select(
      'id, service_date, start_at, end_at, position, ministry_id, ministries(name), assignments(id, status, conflict_acknowledged, users!user_id(id, name))',
    )
    .eq('status', 'published')
    .gte('service_date', `${year}-01-01`)
    .lte('service_date', `${year}-12-31`)
    .order('service_date')
    .order('start_at');
  if (params.ministry) {
    query = query.eq('ministry_id', params.ministry);
  }
  const { data: slots } = await query;

  const visible = (slots ?? []).filter(
    (slot) =>
      !params.member ||
      slot.assignments.some((a) => a.users?.id === params.member),
  );

  const byDate = new Map<string, typeof visible>();
  for (const slot of visible) {
    const list = byDate.get(slot.service_date) ?? [];
    list.push(slot);
    byDate.set(slot.service_date, list);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={`Roster ${year}`}>
        <form method="get" className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select name="year" defaultValue={String(year)} aria-label="Year" className={inputClass}>
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            name="ministry"
            defaultValue={params.ministry ?? ''}
            aria-label="Filter by ministry"
            className={inputClass}
          >
            <option value="">All ministries</option>
            {(ministries ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            name="member"
            defaultValue={params.member ?? ''}
            aria-label="Filter by member"
            className={inputClass}
          >
            <option value="">All members</option>
            {(members ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </PageHeader>

      {byDate.size === 0 ? (
        <EmptyState
          title="No published duties match these filters."
          hint="Try a different year or ministry, or clear the member filter."
        />
      ) : (
        <TableCard>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>
                  Time
                </th>
                <th scope="col" className={thClass}>
                  Ministry
                </th>
                <th scope="col" className={thClass}>
                  Position
                </th>
                <th scope="col" className={thClass}>
                  Assigned
                </th>
              </tr>
            </thead>
            {[...byDate.entries()].map(([date, dateSlots]) => (
              <tbody key={date} className={tbodyClass}>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <th
                    colSpan={4}
                    scope="colgroup"
                    className="bg-gray-50 px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:bg-gray-950/40 dark:text-gray-100"
                  >
                    {DATE_FMT.format(new Date(`${date}T00:00:00Z`))}
                    <span className="ml-2 font-normal text-gray-400">{date}</span>
                  </th>
                </tr>
                {dateSlots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className={`${tdClass} whitespace-nowrap tabular-nums text-gray-500`}>
                      {TIME_FMT.format(new Date(slot.start_at))}
                      {slot.end_at ? `–${TIME_FMT.format(new Date(slot.end_at))}` : ''}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{slot.ministries?.name}</td>
                    <td className={`${tdClass} whitespace-nowrap font-medium`}>{slot.position}</td>
                    <td className={tdClass}>
                      {slot.assignments.length === 0 && (
                        <span className="text-gray-400">unfilled</span>
                      )}
                      {slot.assignments.map((a, i) => (
                        <span key={a.id}>
                          {i > 0 && ', '}
                          {a.users?.name}
                          {a.conflict_acknowledged && (
                            <span title="Assigned despite a schedule conflict"> ⚠️</span>
                          )}
                          {a.status === 'confirmed' ? ' ✅' : ''}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </TableCard>
      )}
    </main>
  );
}
