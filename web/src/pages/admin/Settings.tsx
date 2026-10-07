import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Button, Card, Field, Input, Loading, Textarea } from '../../components/ui';
import type { GoogleStatus, HostSettings } from '../../types';
import { adminApi } from './adminApi';

export default function Settings() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <GoogleCalendar />
      <Profile />
    </div>
  );
}

function GoogleCalendar() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const result = params.get('google');
  const resultMessage = params.get('message');

  const load = () => adminApi.google().then(setStatus, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await adminApi.connectGoogle();
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar? Your busy times will no longer block slots and no Meet links will be created.')) return;
    setBusy(true);
    try {
      await adminApi.disconnectGoogle();
      setParams({});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Google Calendar</h2>
        <p className="mt-1 text-sm text-stone-600">
          Blocks times you are busy, adds each booking to your calendar, invites the guest and creates Google Meet links.
        </p>
      </div>

      {result === 'connected' && <Alert tone="success">Google Calendar connected.</Alert>}
      {result === 'error' && <Alert>Could not connect: {resultMessage}</Alert>}
      {error && <Alert>{error}</Alert>}

      {!status ? (
        !error && <Loading />
      ) : status.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {status.needsReconnect ? (
              <span className="font-medium text-red-700">Access expired or was revoked — reconnect to keep syncing.</span>
            ) : (
              <>
                <span className="mr-2 inline-block size-2 rounded-full bg-emerald-500" />
                Connected as <span className="font-medium">{status.email ?? 'your Google account'}</span>
              </>
            )}
          </p>
          <div className="flex gap-2">
            {status.needsReconnect && (
              <Button onClick={connect} busy={busy}>
                Reconnect
              </Button>
            )}
            <Button variant="secondary" onClick={disconnect} busy={busy && !status.needsReconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Alert tone="info">Not connected. Guests can still book, but your calendar events won't block slots.</Alert>
          <Button onClick={connect} busy={busy}>
            Connect Google Calendar
          </Button>
        </div>
      )}
    </Card>
  );
}

function Profile() {
  const [settings, setSettings] = useState<HostSettings | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.settings().then(setSettings, (e: Error) => setError(e.message));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      setSettings(await adminApi.saveSettings(settings));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return error ? <Alert>{error}</Alert> : <Loading />;

  return (
    <Card className="p-6">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-lg font-semibold">Public profile</h2>
        <Field label="Your name" hint="Shown on the booking page and in emails.">
          <Input required value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
        </Field>
        <Field label="Welcome message">
          <Textarea value={settings.welcome} onChange={(e) => setSettings({ ...settings, welcome: e.target.value })} />
        </Field>
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="success">Saved.</Alert>}
        <Button type="submit" busy={busy}>
          Save
        </Button>
      </form>
    </Card>
  );
}
