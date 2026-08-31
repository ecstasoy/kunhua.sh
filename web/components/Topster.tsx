'use client';

import { useEffect, useState } from 'react';
import { HangingSection } from '@/components/HangingSection';
import {
  available,
  fallbackHue,
  grid,
  initial,
  isTopAlbums,
  parseChoice,
  DEFAULT_PERIOD,
  DEFAULT_SIZE,
  PERIOD_LABELS,
  REFRESH_MS,
  SIZES,
  STORAGE_KEY,
  TOP_ALBUMS_ATTR,
  TOP_ALBUMS_URL,
  type Album,
  type Size,
  type TopAlbums,
} from '@/lib/topAlbums';

function Cover({ album, onFocus }: { album: Album; onFocus: () => void }) {
  const label = `${album.album} — ${album.artist}`;
  const inner = album.art ? (
    <img
      src={album.art}
      alt={label}
      /* Intrinsic size, so the grid does not reflow as covers arrive. */
      width={300}
      height={300}
      loading="lazy"
      decoding="async"
      className="cover-img"
    />
  ) : (
    <span
      className="cover-blank"
      // The one place a colour is computed rather than named: it has to be a
      // function of the album so the same record is always the same block.
      style={{ background: `hsl(${fallbackHue(album.album)} 18% 62%)` }}
    >
      {initial(album.album)}
    </span>
  );

  return (
    <li className="cover" onMouseEnter={onFocus} onFocus={onFocus}>
      {album.url ? (
        <a href={album.url} rel="noopener noreferrer" aria-label={label}>
          {inner}
        </a>
      ) : (
        inner
      )}
      {/* Named under the cover as well as in the caption. The caption is
          driven by hover and focus, neither of which a phone has: without
          this, a touch reader sees twenty-five unlabelled squares. Hidden on
          wider screens, where the caption does the job without crowding the
          grid. */}
      <span className="cover-name" aria-hidden>
        <span className="cover-album">{album.album}</span>
        <span className="cover-artist">{album.artist}</span>
      </span>
    </li>
  );
}

// Most-played albums, with the period and grid size chosen by the reader.
export function Topster() {
  const [data, setData] = useState<TopAlbums | null>(null);
  const [period, setPeriod] = useState<string>(DEFAULT_PERIOD);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [focused, setFocused] = useState<number>(0);

  // Read after mount, never during render: the server has no localStorage, and
  // reading it while rendering makes the two disagree.
  useEffect(() => {
    try {
      const choice = parseChoice(window.localStorage.getItem(STORAGE_KEY));
      setPeriod(choice.period);
      setSize(choice.size);
    } catch {
      // Private mode, or storage refused. The defaults are already correct.
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(TOP_ALBUMS_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (alive && isTopAlbums(body)) setData(body);
      } catch {
        // Unreachable: the section simply does not appear.
      }
    };

    void load();
    const poll = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  const choose = (next: { period?: string; size?: Size }) => {
    const p = next.period ?? period;
    const s = next.size ?? size;
    setPeriod(p);
    setSize(s);
    setFocused(0);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ period: p, size: s }));
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  };

  const periods = available(data);
  // Whatever was remembered may no longer have albums.
  const shown = periods.includes(period) ? period : (periods[0] ?? period);
  const albums = grid(data, shown, size);

  if (albums.length === 0) {
    return <span {...{ [TOP_ALBUMS_ATTR]: 'none' }} hidden />;
  }

  // A remembered index can outlive the grid it pointed into.
  const caption = albums[focused] ?? albums[0];

  return (
    <HangingSection label="Albums">
      <div className="topster-bleed" {...{ [TOP_ALBUMS_ATTR]: 'live' }}>
        <div className="topster-controls">
          <span className="topster-group">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choose({ period: p })}
                aria-pressed={p === shown}
                className={p === shown ? 'chosen' : undefined}
              >
                {PERIOD_LABELS[p] ?? p}
              </button>
            ))}
          </span>
          <span className="topster-group">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => choose({ size: s })}
                aria-pressed={s === size}
                aria-label={`${s} by ${s}`}
                className={s === size ? 'chosen' : undefined}
              >
                {s}×{s}
              </button>
            ))}
          </span>
        </div>

        <ul
          className="topster"
          style={{ '--cols': size } as React.CSSProperties}
          onMouseLeave={() => setFocused(0)}
        >
          {albums.map((a, i) => (
            <Cover
              key={`${a.artist}-${a.album}-${i}`}
              album={a}
              onFocus={() => setFocused(i)}
            />
          ))}
        </ul>

        {/* One caption below the grid rather than a label under every cover:
            at 5×5 there is no room for two lines of text per cell, and the
            grid would jump as names of different lengths wrapped. This is
            also where an album's note will go. */}
        <p className="topster-caption" aria-live="polite">
          {caption.album}
          <span> · {caption.artist}</span>
          <span className="topster-plays">{` · ${caption.plays} plays`}</span>
        </p>
      </div>
    </HangingSection>
  );
}
