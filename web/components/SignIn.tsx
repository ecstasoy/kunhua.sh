'use client';

import { useEffect, useState } from 'react';
import { SESSION_URL } from '@/lib/topAlbums';

/**
 * Where the owner exchanges their token for a session.
 *
 * The token is typed, never shipped: nothing in this bundle contains it, and
 * the page is not linked from anywhere. It exists because a session cookie has
 * to be set by a browser, and this is the least machinery that does it.
 */
export function SignIn() {
  const [token, setToken] = useState('');
  const [state, setState] = useState<'unknown' | 'in' | 'out' | 'working' | 'failed'>('unknown');

  useEffect(() => {
    void fetch(SESSION_URL)
      .then((r) => r.json())
      .then((d: { signed_in?: boolean }) => setState(d.signed_in ? 'in' : 'out'))
      .catch(() => setState('out'));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('working');
    try {
      const res = await fetch(SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? 'in' : 'failed');
      if (res.ok) setToken('');
    } catch {
      setState('failed');
    }
  };

  const signOut = async () => {
    setState('working');
    try {
      await fetch(SESSION_URL, { method: 'DELETE' });
    } finally {
      setState('out');
    }
  };

  if (state === 'in') {
    return (
      <div className="signin">
        <p className="signin-state">Signed in. Album notes are editable.</p>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form className="signin" onSubmit={submit}>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Token"
        aria-label="Token"
        autoComplete="current-password"
      />
      <button type="submit" disabled={state === 'working'}>
        Sign in
      </button>
      {state === 'failed' && <p className="signin-state">That token was refused.</p>}
    </form>
  );
}
