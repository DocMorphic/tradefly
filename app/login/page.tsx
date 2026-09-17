'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
export default function Login() {
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch('/api/session')
      .then(
        (r) =>
          r.json() as Promise<{
            platform: string;
            authenticated: boolean;
            configured: boolean;
          }>,
      )
      .then((s) => {
        if (s.platform === 'sites')
          window.location.assign('/signin-with-chatgpt?return_to=/');
        else if (s.authenticated) window.location.assign('/');
        else if (!s.configured)
          setMessage(
            'Set TRADEFLY_OWNER_KEY in your Vercel environment variables to enable owner access.',
          );
      })
      .catch(() => setMessage('Could not check sign-in. Try again.'));
  }, []);
  return (
    <main className="owner-login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage('');
          try {
            const response = await fetch('/api/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok)
              throw new Error(data.error || 'Could not sign in.');
            window.location.assign('/');
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : 'Could not sign in.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="owner-wordmark">
          <img
            src="/tradefly-mark.svg"
            width={40}
            height={40}
            alt=""
            style={{
              display: 'inline-block',
              verticalAlign: 'middle',
              marginRight: 12,
            }}
          />
          tradefly
        </span>
        <h1>Open your trading desk</h1>
        <p>Everyone can watch. Only you can control the flies.</p>
        <label htmlFor="owner-key">Owner access key</label>
        <input
          id="owner-key"
          type="password"
          autoComplete="current-password"
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button disabled={busy}>{busy ? 'Opening…' : 'Unlock desktop'}</button>
        <output aria-live="polite">{message}</output>
        <Link href="/">Back to desktop</Link>
      </form>
    </main>
  );
}
