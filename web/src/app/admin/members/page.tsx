import { getProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { AddMemberForm, CreateMinistryForm, InviteButton } from './forms';

export default async function MembersPage() {
  const profile = (await getProfile())!;
  const supabase = await createClient();

  const { data: ministries } = await supabase
    .from('ministries')
    .select('id, name, status, memberships(role, positions, users(id, name, telegram_id))')
    .eq('status', 'active')
    .order('name');

  const isPastor = profile.globalRole === 'pastor';
  const headOf = new Set(
    profile.memberships.filter((m) => m.role === 'head').map((m) => m.ministryId),
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ministries &amp; members</h1>
        {isPastor && <CreateMinistryForm />}
      </div>

      {(ministries ?? []).map((ministry) => {
        const manageable = isPastor || headOf.has(ministry.id);
        return (
          <section key={ministry.id} className="rounded border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">{ministry.name}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 font-normal">Name</th>
                  <th className="py-1 font-normal">Role</th>
                  <th className="py-1 font-normal">Positions</th>
                  <th className="py-1 font-normal">Telegram</th>
                  {manageable && <th className="py-1 font-normal">Invite</th>}
                </tr>
              </thead>
              <tbody>
                {ministry.memberships.map((m) =>
                  m.users ? (
                    <tr key={m.users.id} className="border-t border-gray-100 dark:border-gray-900">
                      <td className="py-1.5">{m.users.name}</td>
                      <td className="py-1.5 uppercase text-gray-500">{m.role}</td>
                      <td className="py-1.5">{(m.positions ?? []).join(', ')}</td>
                      <td className="py-1.5">{m.users.telegram_id ? '✅ linked' : '— not linked'}</td>
                      {manageable && (
                        <td className="py-1.5">
                          {!m.users.telegram_id && <InviteButton userId={m.users.id} />}
                        </td>
                      )}
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
            {manageable && <AddMemberForm ministryId={ministry.id} />}
          </section>
        );
      })}
    </main>
  );
}
