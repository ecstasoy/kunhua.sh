'use client';

import { useEffect, useState } from 'react';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import {
  formatAge,
  isNowPlaying,
  NOW_PLAYING_ATTR,
  NOW_PLAYING_URL,
  REFRESH_MS,
  view,
  type NowPlaying as Data,
} from '@/lib/nowPlaying';

const SIZE = 56;

// A stored cover, or a block carrying the album's first letter.
function Cover({ art, seed }: { art: string | null; seed: string }) {
  if (art) {
    return (
      <img
        src={art}
        alt=""
        width={SIZE}
        height={SIZE}
        style={{ display: 'block', borderRadius: '2px', objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: '2px',
        background: 'var(--rule)',
        color: 'var(--faint)',
        fontSize: 'var(--text-lede)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {seed.slice(0, 1).toUpperCase()}
    </div>
  );
}

// What is playing, read from the service at view time.
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
        // Unreachable is ordinary here; going stale is how it shows.
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

  // Nothing to show: no heading, no empty row. The marker stays so the build
  // can assert this is the state that ships.
  if (v.kind === 'none') {
    return <span {...{ [NOW_PLAYING_ATTR]: 'none' }} hidden />;
  }

  const { artist, title, album, url } = v.track;
  // "Playing" is the one claim that can be wrong; a stale entry never makes it.
  const playing = v.kind === 'live' && v.playing;

  return (
    <HangingSection label="Listening">
      <HangingRow>
        <div {...{ [NOW_PLAYING_ATTR]: v.kind }} style={{ display: 'flex', gap: '12px' }}>
          <Cover art={v.art} seed={album || artist} />
          <div style={{ minWidth: 0 }}>
            <div className="item-title">
              {url ? (
                <a href={url} rel="noopener noreferrer">
                  {title}
                </a>
              ) : (
                title
              )}
            </div>
            <p className="item-excerpt">
              {artist}
              {album && <span style={{ color: 'var(--faint)' }}>{` · ${album}`}</span>}
            </p>
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--faint)', margin: 0 }}>
              {playing ? 'now playing' : 'last played'}
              {v.kind === 'stale' && ` · checked ${formatAge(v.ageMs)} ago`}
            </p>
          </div>
        </div>
      </HangingRow>
    </HangingSection>
  );
}
