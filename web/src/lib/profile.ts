import { createClient } from './supabase/server';

export interface Profile {
  id: string;
  name: string;
  globalRole: 'none' | 'staff' | 'pastor' | 'admin';
  memberships: {
    ministryId: string;
    ministryName: string;
    role: 'member' | 'ic' | 'head';
  }[];
}

// The signed-in member's profile, or null when the Telegram account has a
// session but no linked profile (shouldn't happen — telegram-auth requires it).
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('id, name, global_role, memberships(ministry_id, role, ministries(name))')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    globalRole: data.global_role,
    memberships: (data.memberships ?? []).map((m) => ({
      ministryId: m.ministry_id,
      ministryName: m.ministries?.name ?? '',
      role: m.role,
    })),
  };
}

// Pastor and admin are equivalent everywhere in the matrix.
export function isGlobalAdmin(profile: Profile): boolean {
  return profile.globalRole === 'pastor' || profile.globalRole === 'admin';
}

export function canManage(profile: Profile): boolean {
  return (
    isGlobalAdmin(profile) ||
    profile.memberships.some((m) => m.role === 'head' || m.role === 'ic')
  );
}
