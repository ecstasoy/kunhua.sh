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

const REQUIRED = [
    'name',
    'subtitle',
    'copyright',
    'github',
    'openers.posts',
    'openers.projects',
    'openers.about',
    'open_source.name',
    'open_source.note',
    'open_source.url',
];

// Read without a YAML library. The parser lives in web/node_modules and this
// runs from the repository root, and using the same parser as the code under
// test would let one misreading agree with itself — which is how the B2 client
// and its fake managed to be wrong together.
//
// The file is two levels deep and all values are strings, so this is enough.
function read(): Map<string, string> {
    const out = new Map<string, string>();
    let section = '';
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
        if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
        const match = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
        if (!match) continue;
        const [, indent, key, value] = match;
        if (indent === '') {
            section = value.trim() === '' ? key : '';
            if (section === '') out.set(key, value.trim());
        } else {
            out.set(`${section}.${key}`, value.trim());
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

test('the openers are the same in both languages, by design', () => {
    // They are the owner's own words rather than interface text, so there is
    // one of each and no translation. A locale key appearing here would mean
    // that decision had changed without anyone saying so.
    const openers = [...read().keys()]
        .filter((k) => k.startsWith('openers.'))
        .map((k) => k.slice('openers.'.length))
        .sort();
    assert.deepEqual(openers, ['about', 'posts', 'projects']);
});
