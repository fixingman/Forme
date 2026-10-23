import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authRequired, googleEnabled, loginError, safeNext, supabaseConfig } from '@/lib/server/auth-policy.mjs';
import { currentAccess } from '@/lib/server/session';

export const metadata = { title: 'Sign in — FORME' };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Login({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams, next = safeNext(first(query.next)), error = loginError(first(query.error) ?? ''), sent = first(query.sent) === '1';
  const configured = !!supabaseConfig();
  let signedInUninvited = false;
  if (configured) {
    const { access } = await currentAccess();
    if (access.state === 'allowed') redirect(next);
    signedInUninvited = access.state === 'uninvited';
  }
  const enforced = authRequired((await headers()).get('host'));
  return (
    <main className="auth-page" id="main-content">
      <div className="auth-card">
        <h1 className="auth-brand">FORME</h1>
        <p className="auth-lede">Private beta. Sign in with an invited email.</p>
        {!configured && <div className="notice" role="status">Sign-in isn’t set up on this server. {enforced ? '' : 'Running locally without it works as before.'}</div>}
        {error && <div className="notice" role="alert">{error}</div>}
        {sent && <div className="notice" role="status">If that address is invited, a sign-in link is on its way. It works for an hour and only once.</div>}
        {configured && <>
          <form method="post" action="/auth/login" className="auth-form">
            <input type="hidden" name="next" value={next} />
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required maxLength={254} /></div>
            <button className="btn" type="submit">Email me a sign-in link</button>
          </form>
          {googleEnabled() && <>
            <div className="auth-divider"><span>or</span></div>
            <a className="btn light" href={`/auth/google?next=${encodeURIComponent(next)}`}>Continue with Google</a>
          </>}
        </>}
        {signedInUninvited && <form method="post" action="/auth/signout" className="auth-signout"><button className="textbutton" type="submit">Sign out of the current account</button></form>}
      </div>
    </main>
  );
}
