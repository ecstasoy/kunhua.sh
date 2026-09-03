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

// Fields that are one line whatever the language.
const REQUIRED = [
    'name',
    'subtitle',
    'copyright',
    'github',
    'open_source.name',
    'open_source.note',
    'open_source.url',
];

const OPENERS = ['posts', 'projects', 'about'];
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

test('every field the pages read is present and not blank', () => {
    const doc = read();
    for (const key of REQUIRED) {
        assert.ok(doc.has(key), `${key} is missing`);
        assert.notEqual(doc.get(key), '', `${key} is blank`);
    }
});

test('the reader is checking the same fields these tests are', () => {
    // Two lists of required fields would drift apart, and the one that drifted
    // would be the one nothing noticed.
    const src = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'lib', 'site.ts'), 'utf8');
    for (const key of REQUIRED) {
        assert.match(
            src,
            new RegExp(`'${key.replace('.', '\\.')}'`),
            `web/lib/site.ts does not require ${key}`,
        );
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

        if (shared) {
            assert.notEqual(doc.get(`openers.${key}`), '', `openers.${key} is blank`);
            assert.deepEqual(perLocale, [], `openers.${key} is both shared and per-language`);
            continue;
        }
        assert.deepEqual(
            perLocale, LOCALES,
            `openers.${key} names ${perLocale.join(', ') || 'no language'}, not every one`,
        );
        for (const l of LOCALES) {
            assert.notEqual(doc.get(`openers.${key}.${l}`), '', `openers.${key}.${l} is blank`);
        }
    }
});
