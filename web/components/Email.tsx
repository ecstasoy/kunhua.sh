'use client';

import { useEffect, useState } from 'react';

// Held encoded so the address is not a plain-text hit in anything the server
// serves — not the HTML, not the JS bundle.

const ENCODED = 'aHVhbmcua3VuaEBub3J0aGVhc3Rlcm4uZWR1';

export function Email() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    setAddress(atob(ENCODED));
  }, []);

  if (!address) {
    // Pre-render and no-JS fallback
    return <span style={{ color: 'var(--faint)' }}>email — enable JavaScript to reveal</span>;
  }

  return <a href={`mailto:${address}`}>{address}</a>;
}
