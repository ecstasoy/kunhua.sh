'use client';

import { useEffect, useState } from 'react';
import { HangingSection, HangingRow } from '@/components/HangingSection';
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
  NOTES_URL,
  albumKey,
  type Album,
  type Size,
  type TopAlbums,
} from '@/lib/topAlbums';

function Cover({
  album,
  editable,
  pinned,
  onPreview,
  onPin,
}: {
  album: Album;
  /* Marks what still needs writing, and only for the owner: finding the gaps
     and filling them are then one action. */
  editable: boolean;
  pinned: boolean;
  onPreview: () => void;
  onPin: () => void;
}) {
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
    <li
      className={
        [
          'cover',
          editable && !album.note ? 'unwritten' : '',
          pinned ? 'pinned' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
      onMouseEnter={onPreview}
      onFocus={onPreview}
      /* Pinning on click, because hover alone made the note unreachable:
         every path from a cover to the field passes over other covers, and
         the album changed before the pointer arrived. When the owner can
         edit, the click pins instead of following the link — the grid is a
         picker for them and a set of links for everyone else. */
      onClick={(e) => {
        if (editable) e.preventDefault();
        onPin();
      }}
    >
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

/**
 * One album's note: read by everyone, edited in place by the owner.
 *
 * A field that saves when it loses focus. No form and no admin page — the
 * ceremony is what would stop the notes being written at all.
 *
 * Keyed by album at the call site, so moving to another album remounts it and
 * an unsaved draft cannot be attributed to the wrong record.
 */
function Note({
  album,
  editable,
  takeFocus,
  onSaved,
}: {
  album: Album;
  editable: boolean;
  takeFocus: boolean;
  onSaved: (note: string) => void;
}) {
  const [draft, setDraft] = useState(album.note ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');

  if (!editable) {
    return album.note ? <p className="topster-note">{album.note}</p> : null;
  }

  const save = async () => {
    if (draft === (album.note ?? '')) return;
    setState('saving');
    try {
      const res = await fetch(NOTES_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist: album.artist, album: album.album, note: draft }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('idle');
      onSaved(draft);
    } catch {
      // The draft stays in the field: losing what was typed is worse than
      // saying it did not save.
      setState('failed');
    }
  };

  return (
    <div className="topster-note-edit">
      <textarea
        // The field is mounted in response to the owner clicking the album it
        // belongs to, so taking focus is finishing their gesture.
        autoFocus={takeFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder={`Note on ${album.album}`}
        aria-label={`Note on ${album.album} by ${album.artist}`}
      />
      {state !== 'idle' && (
        <span className="topster-note-state">
          {state === 'saving' ? 'saving…' : 'not saved'}
        </span>
      )}
    </div>
  );
}

// Most-played albums, with the period and grid size chosen by the reader.
export function Topster() {
  const [data, setData] = useState<TopAlbums | null>(null);
  const [period, setPeriod] = useState<string>(DEFAULT_PERIOD);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  // Two, not one: hover previews, a click pins. Without the pin there is no
  // route from a cover to its note field — every path passes over other
  // covers, and the album changed before the pointer arrived.
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

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

  // Applied locally so a saved note shows at once rather than at the next
  // poll, half an hour later.
  const remember = (album: Album, note: string) => {
    const key = albumKey(album);
    setData((current) => {
      if (!current) return current;
      const periods = Object.fromEntries(
        Object.entries(current.periods).map(([p, list]) => [
          p,
          list.map((a) => (albumKey(a) === key ? { ...a, note: note || null } : a)),
        ]),
      );
      return { ...current, periods };
    });
  };

  const choose = (next: { period?: string; size?: Size }) => {
    const p = next.period ?? period;
    const s = next.size ?? size;
    setPeriod(p);
    setSize(s);
    // The indices meant an album in the old grid.
    setHovered(null);
    setPinned(null);
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

  // Pinned wins over hovered, so moving the pointer towards the note field
  // cannot change what is being annotated. An index can outlive the grid it
  // pointed into, hence the fallback.
  const wanted = pinned ?? hovered ?? 0;
  const index = albums[wanted] ? wanted : 0;

  return (
    <HangingSection label="Albums">
      {/* HangingRow, like every other section: .hang is a two-column grid, so
          a bare child lands in the 88px rail column. */}
      <HangingRow>
        <div
          className="topster-bleed"
          style={{ '--cols': size } as React.CSSProperties}
          {...{ [TOP_ALBUMS_ATTR]: 'live' }}
        >
          {/* Native selects: a phone gets its own picker, a keyboard gets
              arrow keys, and both come with a real tap target — none of which
              a row of text buttons had without being built. */}
          <div className="topster-controls">
            <label className="topster-select">
              <span className="visually-hidden">Period</span>
              <select value={shown} onChange={(e) => choose({ period: e.target.value })}>
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p] ?? p}
                  </option>
                ))}
              </select>
            </label>
            <label className="topster-select">
              <span className="visually-hidden">Grid size</span>
              <select
                value={size}
                onChange={(e) => choose({ size: Number(e.target.value) as Size })}
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}×{s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Only the preview is dropped on leaving; a pinned album stays. */}
          <ul className="topster" onMouseLeave={() => setHovered(null)}>
            {albums.map((a, i) => (
              <Cover
                key={`${a.artist}-${a.album}-${i}`}
                album={a}
                editable={data?.editable ?? false}
                pinned={pinned === i}
                onPreview={() => setHovered(i)}
                onPin={() => setPinned(i)}
              />
            ))}
          </ul>

          {/* One caption below the grid rather than a label under every cover:
              at 5×5 there is no room for two lines of text per cell, and the
              grid would jump as names of different lengths wrapped. This is
              also where an album's note goes. */}
          {/* Every album's detail is laid out in the same grid cell, so the
              block is as tall as the longest note in this grid and moving
              across the covers changes what is read without moving anything
              below it. Only one is visible; the rest hold the space. */}
          <div className="topster-detail" aria-live="polite">
            {albums.map((a, i) => {
              const shown = i === index;
              return (
                <div
                  key={albumKey(a)}
                  className="topster-detail-slot"
                  data-shown={shown}
                  // visibility, not hidden: the slot has to keep its space.
                  // Out of the accessibility tree and out of tab order too,
                  // or twenty-five invisible notes would be read aloud.
                  aria-hidden={!shown}
                  inert={!shown}
                >
                  <p className="topster-caption">
                    {a.album}
                    <span> · {a.artist}</span>
                    <span className="topster-plays">{` · ${a.plays} plays`}</span>
                  </p>
                  {shown ? (
                    <Note
                      key={albumKey(a)}
                      album={a}
                      editable={data?.editable ?? false}
                      /* Focused when the album was chosen deliberately, so
                         picking a cover and typing are one gesture. */
                      takeFocus={pinned !== null}
                      onSaved={(note) => remember(a, note)}
                    />
                  ) : (
                    // The measured height has to match what the visible slot
                    // would be, so the placeholder is the note itself.
                    a.note && <p className="topster-note">{a.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </HangingRow>
    </HangingSection>
  );
}
