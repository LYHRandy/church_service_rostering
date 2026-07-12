import { LoginWidget } from './login-widget';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Church Duty Roster</h1>
        <p className="mt-2 text-gray-500">Sign in with the Telegram account linked to your member profile.</p>
      </div>
      <LoginWidget />
    </main>
  );
}
