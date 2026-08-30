import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(import.meta.dirname, '..', 'deploy', 'release.sh');

// Releases are picked by mtime, so the test has to control mtime rather than
// hope that creating them in a loop produces a stable order.
function makeRoot(shas) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
    fs.mkdirSync(path.join(root, 'releases'));
    shas.forEach((sha, i) => {
        const dir = path.join(root, 'releases', sha);
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'index.html'), sha);
        const t = new Date(Date.now() - (shas.length - i) * 86400_000);
        fs.utimesSync(dir, t, t);
    });
    return root;
}

const release = (root, sha) =>
    execFileSync('bash', [SCRIPT, sha], {
        env: { ...process.env, SITE_ROOT: root },
        encoding: 'utf8',
    });

const current = (root) => path.basename(fs.realpathSync(path.join(root, 'current')));

test('points current at the release', () => {
    const root = makeRoot(['aaa', 'bbb']);
    release(root, 'bbb');
    assert.equal(current(root), 'bbb');
});

test('refuses a release that does not exist, leaving current alone', () => {
    const root = makeRoot(['aaa']);
    release(root, 'aaa');
    assert.throws(() => release(root, 'nope'));
    assert.equal(current(root), 'aaa');
});

test('refuses a release with no index.html', () => {
    const root = makeRoot(['aaa']);
    release(root, 'aaa');
    fs.mkdirSync(path.join(root, 'releases', 'empty'));
    assert.throws(() => release(root, 'empty'));
    assert.equal(current(root), 'aaa');
});

// This is the path that failed twice in production and had never run: it only
// executes once a sixth release exists.
test('keeps five releases and deletes the oldest', () => {
    const shas = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
    const root = makeRoot(shas);
    release(root, 'r7');

    const left = fs.readdirSync(path.join(root, 'releases')).sort();
    assert.equal(left.length, 5);
    assert.ok(!left.includes('r1'));
    assert.ok(!left.includes('r2'));
    assert.ok(left.includes('r7'));
});

test('never deletes the release being served', () => {
    const shas = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
    const root = makeRoot(shas);
    release(root, 'r1');            // roll back to the oldest
    release(root, 'r1');            // deploy again; retention now runs
    assert.equal(current(root), 'r1');
    assert.ok(fs.existsSync(path.join(root, 'releases', 'r1')));
});