import { Card } from '@/components/ui';
import { LoginWidget } from './login-widget';
import { TokenLogin } from './token-login';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col justify-center p-6">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <div className="text-3xl">⛪</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Church Duty Roster</h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in with the Telegram account linked to your member profile.
          </p>
        </div>
        <Card className="mt-8 flex flex-col items-center gap-4 px-6 py-8">
          {token_hash && <TokenLogin tokenHash={token_hash} />}
          <LoginWidget />
          <p className="text-center text-xs text-gray-400">
            No Telegram button? Send <span className="font-mono">/login</span> to the roster bot
            for a one-tap sign-in link.
          </p>
        </Card>
      </div>
    </main>
  );
}
