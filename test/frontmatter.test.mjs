import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const POST = path.join(ROOT, 'content', 'posts', 'hello.md');

// Drives the real build, because the point is that a bad post stops a deploy —
// not that a function throws when called directly.
function buildWith(frontMatter) {
  const original = fs.readFileSync(POST, 'utf8');
  fs.writeFileSync(POST, `---\n${frontMatter}\n---\n\n[placeholder]\n`);
  try {
    execFileSync('npm', ['run', 'build'], { cwd: path.join(ROOT, 'web'), encoding: 'utf8', stdio: 'pipe' });
    return null;
  } catch (err) {
    return String(err.stdout) + String(err.stderr);
  } finally {
    fs.writeFileSync(POST, original);
  }
}

test('a missing publication timestamp fails the build', () => {
  const out = buildWith('title: "t"\nexcerpt: "e"');
  assert.match(String(out), /missing front-matter: published/);
});

test('an unquoted bracketed title fails, naming the fix', () => {
  const out = buildWith('title: [t]\npublished: 2026-08-30T14:32:00-04:00\nexcerpt: "e"');
  assert.match(String(out), /must be a string, got a list/);
  assert.match(String(out), /quote it/);
});

test('a revision earlier than publication fails', () => {
  const out = buildWith(
    'title: "t"\npublished: 2026-08-30T14:32:00-04:00\nupdated: 2026-08-29T10:00:00-04:00\nexcerpt: "e"',
  );
  assert.match(String(out), /updated is earlier than published/);
});
