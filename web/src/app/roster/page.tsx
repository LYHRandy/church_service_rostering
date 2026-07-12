import { createClient } from '@/lib/supabase/server';

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
        <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
          <select name="year" defaultValue={String(year)} className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select name="ministry" defaultValue={params.ministry ?? ''} className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
            <option value="">All ministries</option>
            {(ministries ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select name="member" defaultValue={params.member ?? ''} className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
            <option value="">All members</option>
            {(members ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white dark:bg-gray-100 dark:text-gray-900">
            Filter
          </button>
        </form>
      </div>

      {byDate.size === 0 && (
        <p className="text-gray-500">No published duties match these filters.</p>
      )}

      <div className="space-y-6">
        {[...byDate.entries()].map(([date, dateSlots]) => (
          <section key={date}>
            <h2 className="mb-2 border-b border-gray-200 pb-1 font-medium dark:border-gray-800">
              {DATE_FMT.format(new Date(`${date}T00:00:00Z`))} · {date}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {dateSlots.map((slot) => (
                  <tr key={slot.id} className="border-b border-gray-100 dark:border-gray-900">
                    <td className="w-40 py-1.5 text-gray-500">
                      {TIME_FMT.format(new Date(slot.start_at))}
                      {slot.end_at ? `–${TIME_FMT.format(new Date(slot.end_at))}` : ''}
                    </td>
                    <td className="w-40 py-1.5">{slot.ministries?.name}</td>
                    <td className="w-40 py-1.5 font-medium">{slot.position}</td>
                    <td className="py-1.5">
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
            </table>
          </section>
        ))}
      </div>
    </main>
  );
}
