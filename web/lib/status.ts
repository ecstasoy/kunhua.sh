/**
 * The contract between the homepage and `/api/status`.
 *
 * Declared once, here. The Go handler has a test asserting these exact field
 * names and types against decoded JSON, so renaming one on either side turns a
 * test red rather than silently emptying a line on the page — which is the
 * failure mode of two halves that build and deploy separately.
 */
export type Status = {
  /** Kernel uptime. Null when the machine cannot report it. */
  uptime_seconds: number | null;
  /** RFC 3339, UTC. When the release symlink was last swapped. */
  deployed_at: string | null;
  /** RFC 3339, UTC. When the service composed this answer. */
  generated_at: string;
};

export const STATUS_URL = '/api/status';

/** How often to ask again. */
export const REFRESH_MS = 60_000;

/**
 * How long an answer stays worth showing. Past this the values are replaced by
 * the placeholder rather than left on screen: a number that stopped updating
 * is worse than no number, because nothing about it looks wrong.
 */
export const STALE_AFTER_MS = 5 * 60_000;

/** Shown wherever a value is missing, stale, or never arrived. */
export const PLACEHOLDER = '—';

/** Marks the line in the emitted HTML so the build can assert the degraded
 *  path exists, instead of it being covered only by remembering to try it. */
export const STATUS_ATTR = 'data-machine-status';

export function isStatus(v: unknown): v is Status {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  const nullableNumber = s.uptime_seconds === null || typeof s.uptime_seconds === 'number';
  const nullableString = s.deployed_at === null || typeof s.deployed_at === 'string';
  return nullableNumber && nullableString && typeof s.generated_at === 'string';
}

/** "12d 4h", "4h 12m", "12m", "40s" — two units at most, largest first. */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return PLACEHOLDER;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.max(0, Math.floor(seconds))}s`;
}

/** "3h ago", "2d ago", "just now". */
export function formatSince(then: number, now: number): string {
  const secs = Math.floor((now - then) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
