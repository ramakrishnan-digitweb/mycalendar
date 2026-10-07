import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Alert, Button, Card, Loading, cx } from '../../components/ui';
import { adminApi, auth, googleProvider } from './adminApi';

type State = { status: 'loading' } | { status: 'signedOut' } | { status: 'denied'; user: User; message: string } | { status: 'ok'; user: User };

const TABS = [
  { to: '/admin', label: 'Bookings', end: true },
  { to: '/admin/event-types', label: 'Meeting types' },
  { to: '/admin/availability', label: 'Availability' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [signInError, setSignInError] = useState('');

  useEffect(() => {
    document.title = 'Admin · My Calendar';
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setState({ status: 'signedOut' });
      try {
        await adminApi.me();
        setState({ status: 'ok', user });
      } catch (e) {
        setState({ status: 'denied', user, message: (e as Error).message });
      }
    });
  }, []);

  const signIn = async () => {
    setSignInError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user') setSignInError((e as Error).message);
    }
  };

  if (state.status === 'loading') return <Loading />;

  if (state.status !== 'ok') {
    return (
      <main className="mx-auto max-w-sm px-4 py-24">
        <Card className="space-y-4 p-8 text-center">
          <h1 className="text-xl font-semibold">Calendar admin</h1>
          {state.status === 'denied' ? (
            <>
              <Alert>
                {state.user.email}: {state.message}
              </Alert>
              <Button variant="secondary" onClick={() => signOut(auth)}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-600">Sign in with the Google account that owns this calendar.</p>
              {signInError && <Alert>{signInError}</Alert>}
              <Button onClick={signIn} className="w-full">
                Sign in with Google
              </Button>
            </>
          )}
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/admin" className="font-semibold">
            My Calendar
          </Link>
          <nav className="order-last -mx-2 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
                    isActive ? 'bg-teal-50 font-medium text-teal-800' : 'text-stone-600 hover:bg-stone-100',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <a href="/" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
              View public page ↗
            </a>
            <Button variant="ghost" onClick={() => signOut(auth)}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
