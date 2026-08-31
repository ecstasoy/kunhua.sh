import { test } from 'node:test';
import assert from 'node:assert/strict';
import { view, isNowPlaying, formatAge, type NowPlaying } from '../web/lib/nowPlaying.ts';

const TRACK = { artist: 'Artist', title: 'Title', album: 'Album', url: 'https://x.test/t' };
const NOW = Date.parse('2026-08-31T12:00:00Z');
const at = (iso: string) => Date.parse(iso);

const data = (over: Partial<NowPlaying> = {}): NowPlaying => ({
    track: TRACK,
    playing: true,
    art: '/api/art/' + 'ab'.repeat(32),
    fetched_at: '2026-08-31T11:59:00Z',
    generated_at: '2026-08-31T12:00:00Z',
    ...over,
});

test('a recent fetch is presented as current', () => {
    const v = view(data(), NOW, NOW);
    assert.equal(v.kind, 'live');
});

test('nothing is shown before anything has been fetched', () => {
    assert.equal(view(null, null, null).kind, 'none');
    assert.equal(view(data({ track: null }), NOW, NOW).kind, 'none');
    assert.equal(view(data({ fetched_at: null }), NOW, NOW).kind, 'none');
});

test('a fetch that stopped succeeding is shown as stale, not as current', () => {
    // The failure this exists for: the token expires, every fetch fails, and
    // the last song stays on the page looking exactly as it did when true.
    const v = view(data({ fetched_at: '2026-08-31T09:00:00Z' }), NOW, NOW);
    assert.equal(v.kind, 'stale');
    assert.ok(v.kind === 'stale' && v.ageMs >= 3 * 3600_000);
});

test('the page going quiet is stale too, even when the data it holds was fresh', () => {
    // Same symptom, other cause: the browser has not reached the service in
    // an hour, so what it holds is its own memory rather than the service's.
    const v = view(data(), at('2026-08-31T11:00:00Z'), NOW);
    assert.equal(v.kind, 'stale');
});

test('the threshold is a boundary, not a suggestion', () => {
    const justInside = view(data({ fetched_at: '2026-08-31T11:41:00Z' }), NOW, NOW);
    const justOutside = view(data({ fetched_at: '2026-08-31T11:39:00Z' }), NOW, NOW);
    assert.equal(justInside.kind, 'live');
    assert.equal(justOutside.kind, 'stale');
});

test('an unparseable timestamp shows nothing rather than something wrong', () => {
    assert.equal(view(data({ fetched_at: 'sometime last tuesday' }), NOW, NOW).kind, 'none');
});

test('a body that is not the agreed shape is rejected whole', () => {
    // Rendering half of a renamed shape puts "undefined" on the page.
    assert.equal(isNowPlaying(data()), true);
    assert.equal(isNowPlaying(data({ track: null })), true);
    assert.equal(isNowPlaying({ ...data(), playing: 'yes' }), false);
    assert.equal(isNowPlaying({ ...data(), track: { artist: 'A' } }), false);
    assert.equal(isNowPlaying({ ...data(), art: 42 }), false);
    assert.equal(isNowPlaying({ ...data(), art: null }), true);
    assert.equal(isNowPlaying(null), false);
    assert.equal(isNowPlaying('a string'), false);
});

test('ages read as a person would say them', () => {
    assert.equal(formatAge(90_000), '1m');
    assert.equal(formatAge(3 * 3600_000), '3h');
    assert.equal(formatAge(50 * 3600_000), '2d');
});
