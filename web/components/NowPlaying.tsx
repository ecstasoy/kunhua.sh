'use client';

import { useEffect, useState } from 'react';
import {
  formatAge,
  isNowPlaying,
  NOW_PLAYING_ATTR,
  NOW_PLAYING_URL,
  REFRESH_MS,
  view,
  type NowPlaying as Data,
} from '@/lib/nowPlaying';

/**
 * What is playing, as a line in the colophon.
 *
 * A footnote, not a card: no logo, no artwork, nothing that would make the
 * footer look like it is advertising a service. It reads as something the page
 * happens to know.
 *
 * The rule for when to stop presenting a track as current lives in
 * lib/nowPlaying.ts and is tested there. This file only renders the answer.
 */
export function NowPlaying() {
  const [data, setData] = useState<Data | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(NOW_PLAYING_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (alive && isNowPlaying(body)) {
          setData(body);
          setReceivedAt(Date.now());
          setNow(Date.now());
        }
      } catch {
        // Unreachable is an ordinary state; going stale is how it shows.
      }
    };

    void load();
    const poll = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const v = view(data, receivedAt, now);

  // Nothing to say: no separator, no empty parentheses, no gap. The element
  // stays so the build can assert this state is the one that ships.
  if (v.kind === 'none') {
    return <span {...{ [NOW_PLAYING_ATTR]: 'none' }} />;
  }

  const { artist, title, url } = v.track;
  const label = `${artist} – ${title}`;

  return (
    <span {...{ [NOW_PLAYING_ATTR]: v.kind }}>
      <span aria-hidden> · </span>
      {/* "Playing" is the one claim that can be wrong. It is made only when
          the fetch is current and Last.fm said so; a stale entry says "last
          played", which stays true however old it is. */}
      {!(v.kind === 'live' && v.playing) && 'last played '}
      {url ? (
        <a href={url} rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
      {/* The age appears only once the fetch has stopped succeeding. Its being
          there at all is the signal: a track that stopped changing looks
          exactly like one that did not, which is the failure this line is
          meant to make visible. */}
      {v.kind === 'stale' && (
        <span style={{ color: 'var(--rule)' }}>{` (checked ${formatAge(v.ageMs)} ago)`}</span>
      )}
    </span>
  );
}
