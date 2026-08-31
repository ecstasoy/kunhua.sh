/**
 * The contract for `/api/now-playing`, and the one decision the colophon makes
 * about it: whether what it was told is still worth presenting as current.
 *
 * The decision is a pure function so it can be tested without a browser. Node
 * runs this file directly — the only thing keeping the rule honest is that it
 * is separable from the rendering.
 */

export type NowPlayingTrack = {
  artist: string;
  title: string;
  album: string;
  url: string;
};

export type NowPlaying = {
  /** Null before anything has ever been fetched. */
  track: NowPlayingTrack | null;
  playing: boolean;
  /** A path on this site, never an upstream URL. Null when no cover is stored. */
  art: string | null;
  /** RFC 3339. When the fetch last *succeeded*, not when it last ran. */
  fetched_at: string | null;
  generated_at: string;
};

/** The fetcher runs every minute. Twenty missed runs is not a blip. */
export const STALE_AFTER_MS = 20 * 60_000;

/** How often the page asks. */
export const REFRESH_MS = 60_000;

export const NOW_PLAYING_URL = '/api/now-playing';
export const NOW_PLAYING_ATTR = 'data-now-playing';

export function isNowPlaying(v: unknown): v is NowPlaying {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s.playing !== 'boolean') return false;
  if (typeof s.generated_at !== 'string') return false;
  if (!(s.fetched_at === null || typeof s.fetched_at === 'string')) return false;
  if (!(s.art === null || typeof s.art === 'string')) return false;
  if (s.track === null) return true;
  if (typeof s.track !== 'object') return false;
  const t = s.track as Record<string, unknown>;
  return ['artist', 'title', 'album', 'url'].every((k) => typeof t[k] === 'string');
}

export type View =
  /** Nothing to show: never fetched, never reached, or no listening history. */
  | { kind: 'none' }
  /** Current, and worth presenting as such. */
  | { kind: 'live'; track: NowPlayingTrack; art: string | null; playing: boolean }
  /**
   * A track we still have, from a fetch that stopped succeeding. Shown with
   * its age rather than silently as if current — this is the failure the whole
   * ticket is about, and the only visible symptom is the absence of change.
   */
  | { kind: 'stale'; track: NowPlayingTrack; art: string | null; ageMs: number };

/**
 * What the colophon should show.
 *
 * `receivedAt` is when this browser last got an answer; `fetched_at` inside the
 * data is when the server last got one from Last.fm. Both can go stale
 * independently: the network between you and the site, and the fetcher on the
 * site. Either one being old means the track on screen is not news.
 */
export function view(
  data: NowPlaying | null,
  receivedAt: number | null,
  now: number | null,
  staleAfterMs: number = STALE_AFTER_MS,
): View {
  if (data === null || receivedAt === null || now === null) return { kind: 'none' };
  if (data.track === null) return { kind: 'none' };

  // Our own connection to the site. Beyond one refresh interval the page is
  // reading its own memory, not the service.
  if (now - receivedAt > staleAfterMs) {
    return { kind: 'stale', track: data.track, art: data.art, ageMs: now - receivedAt };
  }

  if (data.fetched_at === null) return { kind: 'none' };
  const fetched = Date.parse(data.fetched_at);
  if (Number.isNaN(fetched)) return { kind: 'none' };

  const age = now - fetched;
  if (age > staleAfterMs) return { kind: 'stale', track: data.track, art: data.art, ageMs: age };

  return { kind: 'live', track: data.track, art: data.art, playing: data.playing };
}

/** "3h", "2d", "40m" — for the parenthetical on a stale entry. */
export function formatAge(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
