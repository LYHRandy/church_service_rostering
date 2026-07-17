import { getProfile, isGlobalAdmin } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { Badge, EmptyState } from '@/components/ui';
import { AddMemberForm, CreateMinistryForm, InviteButton } from './forms';

export default async function MembersPage() {
  const profile = (await getProfile())!;
  const supabase = await createClient();

  const { data: ministries } = await supabase
    .from('ministries')
    .select('id, name, status, memberships(role, positions, users(id, name, telegram_id))')
    .eq('status', 'active')
    .order('name');

  const isAdmin = isGlobalAdmin(profile);
  const headOf = new Set(
    profile.memberships.filter((m) => m.role === 'head').map((m) => m.ministryId),
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Ministries &amp; members</h1>
        {isAdmin && <CreateMinistryForm />}
      </div>

      {(ministries ?? []).length === 0 && (
        <EmptyState
          title="No ministries yet."
          hint={isAdmin ? 'Create the first ministry above.' : undefined}
        />
      )}

      {(ministries ?? []).map((ministry) => {
        const manageable = isAdmin || headOf.has(ministry.id);
        return (
          <section
            key={ministry.id}
            className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
          >
            <h2 className="mb-3 font-medium">{ministry.name}</h2>

            {ministry.memberships.length === 0 && (
              <p className="py-2 text-sm text-gray-400">No members yet.</p>
            )}

            <ul className="divide-y divide-gray-100 dark:divide-gray-900">
              {ministry.memberships.map((m) =>
                m.users ? (
                  <li
                    key={m.users.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="w-full font-medium sm:w-44 sm:truncate">{m.users.name}</span>
                    <Badge tone={m.role === 'member' ? 'neutral' : 'published'}>{m.role}</Badge>
                    <span className="min-w-0 flex-1 truncate text-gray-500">
                      {(m.positions ?? []).join(', ')}
                    </span>
                    <span className="shrink-0 text-gray-500">
                      {m.users.telegram_id ? '✅ linked' : '— not linked'}
                    </span>
                    {manageable && !m.users.telegram_id && (
                      <InviteButton userId={m.users.id} />
                    )}
                  </li>
                ) : null,
              )}
            </ul>

            {manageable && <AddMemberForm ministryId={ministry.id} />}
          </section>
        );
      })}
    </main>
  );
}
