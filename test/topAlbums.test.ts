import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    grid, available, fallbackHue, initial, isTopAlbums, parseChoice,
    DEFAULT_PERIOD, DEFAULT_SIZE, type TopAlbums,
} from '../web/lib/topAlbums.ts';

const album = (n: number) => ({
    artist: `Artist ${n}`, album: `Album ${n}`,
    url: `https://last.fm/${n}`, plays: 100 - n, art: n % 2 ? null : `/api/art/${'a'.repeat(64)}`,
    note: n === 0 ? 'a note' : null,
});

const data = (counts: Record<string, number>): TopAlbums => ({
    order: ['7day', '1month', '12month', 'overall'],
    periods: Object.fromEntries(
        Object.entries(counts).map(([p, n]) => [p, Array.from({ length: n }, (_, i) => album(i))]),
    ),
    fetched_at: '2026-08-31T00:00:00Z',
    generated_at: '2026-08-31T12:00:00Z',
    editable: false,
});

test('the grid slices to the chosen size', () => {
    const d = data({ '7day': 25 });
    assert.equal(grid(d, '7day', 3).length, 9);
    assert.equal(grid(d, '7day', 4).length, 16);
    assert.equal(grid(d, '7day', 5).length, 25);
});

test('a short period renders short rather than padded', () => {
    // A new account, or a quiet year. Padding would draw holes and claim the
    // data was there.
    const d = data({ '7day': 5 });
    assert.equal(grid(d, '7day', 5).length, 5);
});

test('an unknown period is empty, not a crash', () => {
    assert.deepEqual(grid(data({ '7day': 3 }), 'nonsense', 3), []);
    assert.deepEqual(grid(null, '7day', 3), []);
});

test('only periods with albums are offered, in the server order', () => {
    const d = data({ '7day': 3, '12month': 5, overall: 0 });
    assert.deepEqual(available(d), ['7day', '12month']);
    assert.deepEqual(available(null), []);
});

test('the same album always gets the same fallback colour', () => {
    assert.equal(fallbackHue('Kid A'), fallbackHue('Kid A'));
    assert.notEqual(fallbackHue('Kid A'), fallbackHue('Amnesiac'));
    for (const n of ['', 'a', '七种武器', 'A'.repeat(200)]) {
        const h = fallbackHue(n);
        assert.ok(h >= 0 && h < 360, `hue ${h} out of range for ${JSON.stringify(n)}`);
    }
});

test('the fallback letter copes with what album names actually are', () => {
    assert.equal(initial('Kid A'), 'K');
    assert.equal(initial('  spaced'), 'S');
    assert.equal(initial('七种武器'), '七');
    assert.equal(initial(''), '?');
    assert.equal(initial('   '), '?');
});

test('a body that is not the agreed shape is rejected whole', () => {
    assert.equal(isTopAlbums(data({ '7day': 2 })), true);
    assert.equal(isTopAlbums({ ...data({}), order: 'not a list' }), false);
    assert.equal(isTopAlbums({ ...data({}), periods: { '7day': [{ artist: 'A' }] } }), false);
    assert.equal(isTopAlbums(null), false);
});

test('a stored choice survives, and nonsense falls back', () => {
    assert.deepEqual(parseChoice('{"period":"overall","size":5}'), { period: 'overall', size: 5 });
    // A value from an older version, or another tab's nonsense.
    assert.deepEqual(parseChoice(null), { period: DEFAULT_PERIOD, size: DEFAULT_SIZE });
    assert.deepEqual(parseChoice('not json'), { period: DEFAULT_PERIOD, size: DEFAULT_SIZE });
    assert.deepEqual(parseChoice('{"size":99}').size, DEFAULT_SIZE);
});
