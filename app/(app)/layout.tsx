import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Forme from '@/components/forme';
import { authRequired } from '@/lib/server/auth-policy.mjs';
import { currentAccess } from '@/lib/server/session';

// The persistent app shell reads the URL and owns browser-local preferences.
// Keeping it in the layout prevents cached routes from restoring stale state.
// When sign-in is enforced, a full page load also confirms the invite (Proxy only checks that a session cookie exists).
export default async function AppLayout({children}: Readonly<{children: React.ReactNode}>) {
  if (authRequired((await headers()).get('host'))) {
    const { access } = await currentAccess();
    if (access.state === 'anonymous') redirect('/login');
    if (access.state === 'uninvited') redirect('/login?error=not-invited');
  }
  return <><Suspense fallback={<div className="loading">FORME · Loading your edit…</div>}><Forme /></Suspense>{children}</>;
}
