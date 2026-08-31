'use client';

import { useEffect, useState } from 'react';
import {
  isStatus,
  formatSince,
  formatUptime,
  PLACEHOLDER,
  REFRESH_MS,
  STALE_AFTER_MS,
  STATUS_ATTR,
  STATUS_URL,
  type Status,
} from '@/lib/status';

type Snapshot = { status: Status; at: number };

/**
 * Uptime and last deploy, read from the service at view time.
 *
 * Lives in the colophon beside the copyright. These are footnotes about the
 * machine, not something the page is about; giving them a section of their own
 * at the top said the opposite.
 *
 * The site is a static export, so this is the only way a runtime fact reaches a
 * page — and the point of the first such line is the case where the answer
 * never comes. The service can be stopped and this page still serves: the
 * numbers become a placeholder, not an error and not a gap.
 *
 * Nothing calls Date.now() while rendering. The first paint is the placeholder
 * on the server and on the client alike, so there is no hydration mismatch and
 * no flash of a value that was never there.
 */
export function MachineStatus() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const body: unknown = await res.json();
        // A body that does not match the contract is treated as no answer at
        // all. Rendering half of a renamed shape would show "up NaN".
        if (alive && isStatus(body)) {
          setSnapshot({ status: body, at: Date.now() });
          setNow(Date.now());
        }
      } catch {
        // The service being unreachable is an ordinary state here, not an
        // error to report: staleness below is what makes it visible.
      }
    };

    void load();
    const poll = setInterval(load, REFRESH_MS);
    // A second timer only so the relative times age on screen between polls.
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const fresh =
    snapshot !== null && now !== null && now - snapshot.at < STALE_AFTER_MS;

  const uptime =
    fresh && snapshot.status.uptime_seconds !== null
      ? `up ${formatUptime(snapshot.status.uptime_seconds)}`
      : PLACEHOLDER;

  const deployed =
    fresh && snapshot.status.deployed_at !== null && now !== null
      ? `deployed ${formatSince(Date.parse(snapshot.status.deployed_at), now)}`
      : PLACEHOLDER;

  return (
    <span
      {...{ [STATUS_ATTR]: fresh ? 'live' : 'unavailable' }}
      // Inherits the colophon's size and colour rather than setting its own:
      // it belongs to that line, not beside it.
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {uptime}
      <span style={{ color: 'var(--rule)' }}> · </span>
      {deployed}
      {/* How current the reading is, not how current the machine is: a number
          that had silently frozen would otherwise look identical to one
          updating every minute.

          Shown only once a refresh has been missed. Saying "read just now" on
          every view spends a third of the line on the one case where nothing
          is wrong, and a freshness note that is always present is one nobody
          reads when it finally changes. */}
      {fresh && now !== null && now - snapshot.at > REFRESH_MS && (
        <span style={{ color: 'var(--rule)' }}>
          {` · read ${formatSince(snapshot.at, now)}`}
        </span>
      )}
      {!fresh && <span style={{ color: 'var(--rule)' }}> · unreachable</span>}
    </span>
  );
}
