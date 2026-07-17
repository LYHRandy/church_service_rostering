import { createClient } from '@/lib/supabase/server';
import { Button, EmptyState, inputClass } from '@/components/ui';

// Full-year published roster — readable by every signed-in member (SPEC §3.8).
// Draft slots are excluded here by query; RLS additionally hides them from
// non-admins. ⚠️ marks conflict-overridden assignments.

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
  weekday: 'short',
  day: 'numeric',
  month: 'short',
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
    <main className="mx-auto max-w-5xl p-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Roster {year}</h1>
        <form method="get" className="flex w-full flex-wrap items-center gap-2 text-sm sm:w-auto">
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
          <Button type="submit">Filter</Button>
        </form>
      </div>

      {byDate.size === 0 && (
        <EmptyState
          title="No published duties match these filters."
          hint="Try a different year or ministry, or clear the member filter."
        />
      )}

      <div className="space-y-6">
        {[...byDate.entries()].map(([date, dateSlots]) => (
          <section key={date}>
            <h2 className="mb-1 border-b border-gray-200 pb-1 font-medium dark:border-gray-800">
              {DATE_FMT.format(new Date(`${date}T00:00:00Z`))}
              <span className="ml-2 text-sm font-normal text-gray-400">{date}</span>
            </h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-900">
              {dateSlots.map((slot) => (
                <li
                  key={slot.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2 text-sm"
                >
                  <span className="w-24 shrink-0 tabular-nums text-gray-500">
                    {TIME_FMT.format(new Date(slot.start_at))}
                    {slot.end_at ? `–${TIME_FMT.format(new Date(slot.end_at))}` : ''}
                  </span>
                  <span className="w-36 shrink-0 truncate">{slot.ministries?.name}</span>
                  <span className="w-32 shrink-0 truncate font-medium">{slot.position}</span>
                  <span className="min-w-0 basis-full pl-24 sm:basis-0 sm:flex-1 sm:pl-0">
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
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
