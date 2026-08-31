import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(import.meta.dirname, '..', 'deploy', 'api-release.sh');

// Releases are picked by mtime, so the test has to control mtime rather than
// hope that creating them in a loop produces a stable order.
function makeRoot(shas, { executable = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-release-'));
    fs.mkdirSync(path.join(root, 'api', 'releases'), { recursive: true });
    shas.forEach((sha, i) => {
        const dir = path.join(root, 'api', 'releases', sha);
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'server'), `#!/bin/sh\necho ${sha}\n`, {
            mode: executable ? 0o755 : 0o644,
        });
        const t = new Date(Date.now() - (shas.length - i) * 86400_000);
        fs.utimesSync(dir, t, t);
    });
    return root;
}

// The restart and the health check are the two things this script cannot do in
// a test: one needs root, the other needs a listening service. Both are
// injected, which is also how the script is written for production — the sudo
// rule is what constrains the restart, not the script.
function release(root, sha, { healthy = true, restartLog = null, timeout = 2, unit = null } = {}) {
    const restart = restartLog ? `touch ${restartLog}` : 'true';
    return execFileSync('bash', [SCRIPT, sha], {
        env: {
            ...process.env,
            SITE_ROOT: root,
            RESTART_CMD: restart,
            // `true` and `false` stand in for curl: exit 0 is a healthy
            // response, exit 1 is one that never arrives.
            HEALTH_CMD: healthy ? 'true' : 'false',
            HEALTH_TIMEOUT: String(timeout),
            // Absent by default, which is the "no unit shipped" case.
            UNIT_SRC: unit ? unit.src : path.join(root, 'no-such-unit'),
            UNIT_LIVE: unit ? unit.live : '/nonexistent',
        },
        encoding: 'utf8',
    });
}

const current = (root) =>
    path.basename(fs.realpathSync(path.join(root, 'api', 'current')));

const releases = (root) =>
    fs.readdirSync(path.join(root, 'api', 'releases')).sort();

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

test('refuses a release whose server is not executable', () => {
    const root = makeRoot(['aaa'], { executable: false });
    assert.throws(() => release(root, 'aaa'), /executable/);
    assert.equal(fs.existsSync(path.join(root, 'api', 'current')), false);
});

test('refuses when the release unit differs from the one on the host', () => {
    const root = makeRoot(['aaa']);
    const src = path.join(root, 'kunhua-api.service');
    const live = path.join(root, 'live.service');
    fs.writeFileSync(src, 'ProtectSystem=strict\n');
    fs.writeFileSync(live, 'ProtectSystem=no\n');
    // Installing a unit needs root, which ci does not have. The pipeline must
    // therefore fail rather than report a confinement change it could not make.
    assert.throws(
        () => release(root, 'aaa', { unit: { src, live } }),
        /differs from the one on the host/,
    );
    assert.equal(fs.existsSync(path.join(root, 'api', 'current')), false);
});

test('proceeds when the release unit matches the host', () => {
    const root = makeRoot(['aaa']);
    const src = path.join(root, 'kunhua-api.service');
    const live = path.join(root, 'live.service');
    fs.writeFileSync(src, 'ProtectSystem=strict\n');
    fs.writeFileSync(live, 'ProtectSystem=strict\n');
    release(root, 'aaa', { unit: { src, live } });
    assert.equal(current(root), 'aaa');
});

test('restarts the unit', () => {
    const root = makeRoot(['aaa']);
    const marker = path.join(root, 'restarted');
    release(root, 'aaa', { restartLog: marker });
    assert.equal(fs.existsSync(marker), true);
});

test('fails when the service never becomes healthy', () => {
    const root = makeRoot(['aaa', 'bbb']);
    release(root, 'aaa');
    assert.throws(
        () => release(root, 'bbb', { healthy: false }),
        /did not become healthy/,
    );
});

test('names the previous release to roll back to when health fails', () => {
    const root = makeRoot(['aaa', 'bbb']);
    release(root, 'aaa');
    try {
        release(root, 'bbb', { healthy: false });
        assert.fail('expected a failure');
    } catch (err) {
        assert.match(err.stderr, /roll back: .*aaa/);
    }
});

test('keeps five releases and never deletes the live one', () => {
    const root = makeRoot(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
    // a1 is the oldest, so retention would delete it — except it is the one
    // being served. Six directories survive rather than five, and that is the
    // intended trade: a retention rule that can remove the live release is
    // worse than one that occasionally keeps an extra directory.
    release(root, 'a1');
    const left = releases(root);
    assert.deepEqual(left, ['a1', 'a3', 'a4', 'a5', 'a6', 'a7']);
});
