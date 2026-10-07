import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert, Card, Loading } from '../components/ui';
import { publicApi } from '../lib/api';
import { durationLabel, locationSummary } from '../lib/time';
import type { PublicProfile } from '../types';

export default function Home() {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi.profile().then(setProfile, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (profile) document.title = `Book a meeting with ${profile.name}`;
  }, [profile]);

  if (error) return <Page><Alert>{error}</Alert></Page>;
  if (!profile) return <Page><Loading /></Page>;

  return (
    <Page>
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-teal-700 text-2xl font-semibold text-white">
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <h1 className="text-2xl font-semibold">{profile.name}</h1>
        {profile.welcome && <p className="mx-auto mt-2 max-w-md whitespace-pre-line text-stone-600">{profile.welcome}</p>}
      </header>

      {profile.eventTypes.length === 0 ? (
        <p className="text-center text-stone-500">No meeting types are available right now.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {profile.eventTypes.map((et) => (
            <li key={et.slug}>
              <Link to={`/${et.slug}`} className="block h-full">
                <Card className="h-full p-5 transition hover:border-teal-600 hover:shadow-md">
                  <h2 className="font-semibold">{et.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {durationLabel(et.durationMin)} · {locationSummary(et.location)}
                  </p>
                  {et.description && <p className="mt-3 line-clamp-3 text-sm text-stone-600">{et.description}</p>}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

const Page = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">{children}</main>
);
