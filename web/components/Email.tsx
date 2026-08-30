'use client';

import { useEffect, useState } from 'react';

// Held encoded so the address is not a plain-text hit in anything the server
// serves. Assembling it from two string constants does not work: the minifier
// folds them back into one literal. atob is a runtime call and survives, so do
// not refactor this into concatenation.
const ENCODED = 'aHVhbmcua3VuaEBub3J0aGVhc3Rlcm4uZWR1';

function useAddress() {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    setAddress(atob(ENCODED));
  }, []);
  return address;
}

export function Email() {
  const address = useAddress();
  if (!address) {
    // Pre-render and no-JS fallback
    return <span style={{ color: 'var(--faint)' }}>email — enable JavaScript to reveal</span>;
  }
  return <a href={`mailto:${address}`}>{address}</a>;
}

/** Same address, wrapped around an icon. Falls back to the about page, which
 *  is where the address is written out, so the link is never dead. */
export function EmailLink({ children }: { children: React.ReactNode }) {
  const address = useAddress();
  return (
    <a href={address ? `mailto:${address}` : '/about/'} aria-label="email">
      {children}
    </a>
  );
}
