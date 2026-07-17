import { getProfile, isGlobalAdmin } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from '@/components/ui';
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
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title="Ministries & members">
        {isAdmin && <CreateMinistryForm />}
      </PageHeader>

      {(ministries ?? []).length === 0 && (
        <EmptyState
          title="No ministries yet."
          hint={isAdmin ? 'Create the first ministry above.' : undefined}
        />
      )}

      {(ministries ?? []).map((ministry) => {
        const manageable = isAdmin || headOf.has(ministry.id);
        return (
          <Card key={ministry.id}>
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 className="font-semibold">{ministry.name}</h2>
            </div>

            {ministry.memberships.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400">No members yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th scope="col" className={thClass}>
                        Name
                      </th>
                      <th scope="col" className={thClass}>
                        Role
                      </th>
                      <th scope="col" className={thClass}>
                        Positions
                      </th>
                      <th scope="col" className={thClass}>
                        Telegram
                      </th>
                      {manageable && (
                        <th scope="col" className={thClass}>
                          Invite
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className={tbodyClass}>
                    {ministry.memberships.map((m) =>
                      m.users ? (
                        <tr
                          key={m.users.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/40"
                        >
                          <td className={`${tdClass} whitespace-nowrap font-medium`}>
                            {m.users.name}
                          </td>
                          <td className={`${tdClass} whitespace-nowrap`}>
                            <Badge tone={m.role === 'member' ? 'neutral' : 'published'}>
                              {m.role}
                            </Badge>
                          </td>
                          <td className={`${tdClass} text-gray-500`}>
                            {(m.positions ?? []).join(', ') || '—'}
                          </td>
                          <td className={`${tdClass} whitespace-nowrap text-gray-500`}>
                            {m.users.telegram_id ? '✅ linked' : '— not linked'}
                          </td>
                          {manageable && (
                            <td className={`${tdClass} whitespace-nowrap`}>
                              {!m.users.telegram_id && <InviteButton userId={m.users.id} />}
                            </td>
                          )}
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {manageable && (
              <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                <AddMemberForm ministryId={ministry.id} />
              </div>
            )}
          </Card>
        );
      })}
    </main>
  );
}
