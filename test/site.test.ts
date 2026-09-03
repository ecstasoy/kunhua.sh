import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site's own copy — the openers, the name, the copyright — is data now
// rather than text inside a component. A field going missing has to stop the
// deploy, or a page renders with a hole where its opening line was.
//
// Checked against the real file without driving a build: an earlier version of
// this drove two, and took the web gate from forty seconds to two minutes for
// a rule that is a pure function of the file.
const FILE = path.join(import.meta.dirname, '..', 'content', 'site.yml');

// Everything the pages may read. All of it is optional: an absent or empty
// value means that piece is not on the page. What must not happen is a key the
// site does not know, since that would read as a deliberate omission.
const TOP = ['name', 'subtitle', 'openers', 'copyright', 'github', 'open_source'];
const OPENERS = ['posts', 'projects', 'about'];
const OPEN_SOURCE = ['name', 'note', 'url'];
const LOCALES = ['zh', 'en'];

// Read without a YAML library. The parser lives in web/node_modules and this
// runs from the repository root, and using the same parser as the code under
// test would let one misreading agree with itself — which is how the B2 client
// and its fake managed to be wrong together.
//
// The file is two levels deep and all values are strings, so this is enough.
function read(): Map<string, string> {
    const out = new Map<string, string>();
    const path_: string[] = [];
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
        if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
        const match = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
        if (!match) continue;
        const [, indent, key, value] = match;
        const depth = indent.length / 2;
        path_.length = depth;
        if (value.trim() === '') {
            path_.push(key);
        } else {
            out.set([...path_, key].join('.'), value.trim());
        }
    }
    return out;
}

test('nothing in the file is a key the site does not know', () => {
    // The one thing that cannot be allowed to pass. Every value is optional,
    // so a misspelled key would silently mean "this page has none of that"
    // rather than "you typed it wrong".
    const keys = [...read().keys()];
    for (const key of keys) {
        const [head, second] = key.split('.');
        assert.ok(TOP.includes(head), `${head} is not something this site has`);
        if (head === 'openers' && second) {
            assert.ok(OPENERS.includes(second), `openers.${second} is not a page`);
        }
        if (head === 'open_source' && second) {
            assert.ok(OPEN_SOURCE.includes(second), `open_source.${second} is not a field`);
        }
    }
});

test('the open-source entry is complete or absent, never half', () => {
    const doc = read();
    const present = OPEN_SOURCE.filter((f) =>
        [...doc.keys()].some((k) => k === `open_source.${f}` || k.startsWith(`open_source.${f}.`)),
    );
    if (present.length === 0) return;
    assert.deepEqual(present.sort(), [...OPEN_SOURCE].sort(),
        'the homepage entry names some fields but not all of them');
});

test('the reader knows the same keys these tests do', () => {
    // Two lists of known keys would drift apart, and the one that drifted
    // would be the one nothing noticed.
    const src = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'lib', 'site.ts'), 'utf8');
    for (const key of [...TOP, ...OPENERS, ...OPEN_SOURCE]) {
        assert.match(src, new RegExp(`'${key}'`), `web/lib/site.ts does not know ${key}`);
    }
});

test('an opener key is one of the pages, spelled correctly', () => {
    // A misspelled key looks exactly like a deliberate omission, and an
    // omission is how a page says it wants no opening line. One of the two has
    // to be detectable, so unknown keys are refused.
    const keys = new Set(
        [...read().keys()]
            .filter((k) => k.startsWith('openers.'))
            .map((k) => k.split('.')[1]),
    );
    for (const key of keys) {
        assert.ok(OPENERS.includes(key), `openers.${key} is not a page`);
    }
});

test('every opener is either one line or one per language, never half', () => {
    // A plain line means the two sides read the same, which is a decision. A
    // mapping means they differ, and then both have to be there — a half-filled
    // one renders an empty opening line rather than saying anything.
    const doc = read();
    for (const key of OPENERS) {
        const shared = doc.has(`openers.${key}`);
        const perLocale = LOCALES.filter((l) => doc.has(`openers.${key}.${l}`));

        // Absent, or present and empty, both mean that page has no opener.
        if (!shared && perLocale.length === 0) continue;

        if (shared) {
            assert.deepEqual(perLocale, [], `openers.${key} is both shared and per-language`);
            continue;
        }
        assert.deepEqual(
            perLocale, LOCALES,
            `openers.${key} names ${perLocale.join(', ') || 'no language'}, not every one`,
        );

    }
});
