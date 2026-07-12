import { redirect } from 'next/navigation';
import { canManage, getProfile } from '@/lib/profile';

// Admin pages are for pastors, heads, and ICs. This gate is cosmetic routing —
// real enforcement lives in the RPCs and RLS.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile || !canManage(profile)) {
    redirect('/roster');
  }
  return <>{children}</>;
}
