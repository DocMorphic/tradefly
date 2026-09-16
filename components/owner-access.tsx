'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
export function OwnerAccess() {
  const [state, setState] = useState<{
    platform: string;
    authenticated: boolean;
  } | null>(null);
  useEffect(() => {
    void fetch('/api/session')
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ platform: string; authenticated: boolean }>)
          : null,
      )
      .then(setState)
      .catch(() => {});
  }, []);
  if (!state || state.platform === 'sites') return null;
  return state.authenticated ? (
    <button
      onClick={async () => {
        const response = await fetch('/api/session', { method: 'DELETE' });
        if (response.ok) window.location.reload();
      }}
    >
      Lock
    </button>
  ) : (
    <Link className="owner-access-link" href="/login">
      Owner login
    </Link>
  );
}
