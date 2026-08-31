/**
 * The contract for `/api/top-albums`, and the decisions the grid makes about
 * it. Kept apart from the rendering so node can test them without a browser.
 */

export type Album = {
  artist: string;
  album: string;
  url: string;
  plays: number;
  /** A path on this site, or null when no cover is stored. */
  art: string | null;
  /** The owner's annotation. Null when there is none — never an empty string,
   *  so "unwritten" and "emptied" cannot differ. */
  note: string | null;
};

export type TopAlbums = {
  /** Period keys in the order the page offers them. */
  order: string[];
  periods: Record<string, Album[]>;
  /** RFC 3339. When the chart last fetched successfully. */
  fetched_at: string | null;
  generated_at: string;
  /** Whether this browser may edit notes. Not a permission — the write
   *  endpoint checks the session itself — only whether to offer the affordance. */
  editable: boolean;
};

export const TOP_ALBUMS_URL = '/api/top-albums';
export const TOP_ALBUMS_ATTR = 'data-top-albums';

/** Refetched daily by the service, so the page has no reason to ask often. */
export const REFRESH_MS = 30 * 60_000;

/** Last.fm's own period names, labelled for reading. */
export const PERIOD_LABELS: Record<string, string> = {
  '7day': '7 days',
  '1month': '1 month',
  '3month': '3 months',
  '6month': '6 months',
  '12month': '12 months',
  overall: 'all time',
};

export const SIZES = [3, 4, 5] as const;
export type Size = (typeof SIZES)[number];

export const DEFAULT_PERIOD = '7day';
export const DEFAULT_SIZE: Size = 4;

/** Remembered per visitor; a preference, not state anything depends on. */
export const STORAGE_KEY = 'kunhua.topster';

export function isTopAlbums(v: unknown): v is TopAlbums {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (!Array.isArray(s.order) || !s.order.every((p) => typeof p === 'string')) return false;
  if (typeof s.generated_at !== 'string') return false;
  if (!(s.fetched_at === null || typeof s.fetched_at === 'string')) return false;
  if (typeof s.periods !== 'object' || s.periods === null) return false;
  return Object.values(s.periods as Record<string, unknown>).every(
    (list) =>
      Array.isArray(list) &&
      list.every((a) => {
        if (typeof a !== 'object' || a === null) return false;
        const t = a as Record<string, unknown>;
        return (
          typeof t.artist === 'string' &&
          typeof t.album === 'string' &&
          typeof t.plays === 'number' &&
          (t.art === null || typeof t.art === 'string') &&
          (t.note === null || typeof t.note === 'string')
        );
      }),
  );
}

/**
 * The albums to draw for a choice.
 *
 * Short is a real answer: a new account, or a quiet year, has fewer albums than
 * the grid holds. Padding with blanks would draw a grid of holes and claim the
 * data was there.
 */
export function grid(data: TopAlbums | null, period: string, size: Size): Album[] {
  if (data === null) return [];
  return (data.periods[period] ?? []).slice(0, size * size);
}

/** Periods that actually have albums, in the server's order. */
export function available(data: TopAlbums | null): string[] {
  if (data === null) return [];
  return data.order.filter((p) => (data.periods[p] ?? []).length > 0);
}

/**
 * A stable hue for an album with no cover, so the same album is always the same
 * colour. Lightness and saturation are fixed and dull: these blocks sit beside
 * real covers and must not out-shout them.
 */
export function fallbackHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    // A small odd multiplier spreads short names, which most album names are.
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return h;
}

/** The letter drawn on a cover-less block. */
export function initial(name: string): string {
  return [...name.trim()].find((c) => c.trim() !== '')?.toUpperCase() ?? '?';
}

export function parseChoice(raw: string | null): { period: string; size: Size } {
  const fallback = { period: DEFAULT_PERIOD, size: DEFAULT_SIZE };
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const size = SIZES.includes(v.size as Size) ? (v.size as Size) : DEFAULT_SIZE;
    const period = typeof v.period === 'string' ? v.period : DEFAULT_PERIOD;
    return { period, size };
  } catch {
    // A stored value from an older version, or another tab's nonsense.
    return fallback;
  }
}

export const NOTES_URL = '/api/notes';
export const SESSION_URL = '/api/session';

/** Identifies an album across a refetch: the chart position is not stable. */
export function albumKey(a: Pick<Album, 'artist' | 'album'>): string {
  return `${a.artist}\u0000${a.album}`;
}
