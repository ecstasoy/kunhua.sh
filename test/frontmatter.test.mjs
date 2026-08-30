import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const POSTS = path.join(ROOT, 'content', 'posts');

// Its own file, removed afterwards. An earlier version rewrote a real post and
// restored it, which loses the post if the run is interrupted.
const FIXTURE = path.join(POSTS, '__fixture__.md');
const PROJECTS = path.join(ROOT, 'content', 'projects');
const PROJECT_FIXTURE = path.join(PROJECTS, '__fixture__.md');

// Drives the real build, because the point is that a bad post stops a deploy —
// not that a function throws when called directly.
function buildWith(frontMatter) {
  fs.writeFileSync(FIXTURE, `---\n${frontMatter}\n---\n\nbody\n`);
  try {
    execFileSync('npm', ['run', 'build'], {
      cwd: path.join(ROOT, 'web'),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return null;
  } catch (err) {
    return String(err.stdout) + String(err.stderr);
  } finally {
    fs.rmSync(FIXTURE, { force: true });
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

test('a well-formed post builds', () => {
  const out = buildWith('title: "t"\npublished: 2026-08-30T14:32:00-04:00\nexcerpt: "e"');
  assert.equal(out, null);
});

function buildWithProject(frontMatter) {
  fs.writeFileSync(PROJECT_FIXTURE, `---\n${frontMatter}\n---\n\n## label\n\nbody\n`);
  try {
    execFileSync('npm', ['run', 'build'], {
      cwd: path.join(ROOT, 'web'),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return null;
  } catch (err) {
    return String(err.stdout) + String(err.stderr);
  } finally {
    fs.rmSync(PROJECT_FIXTURE, { force: true });
  }
}

test('a project without a summary fails the build', () => {
  const out = buildWithProject('name: "n"');
  assert.match(String(out), /content\/projects\/__fixture__\.md is missing front-matter: summary/);
});

test('a project without a stack fails the build', () => {
  const out = buildWithProject('name: "n"\nsummary: "s"');
  assert.match(String(out), /missing front-matter: stack/);
});

test('a project with a non-numeric order fails', () => {
  const out = buildWithProject('name: "n"\nsummary: "s"\nstack: "Go"\norder: soon');
  assert.match(String(out), /order must be a number/);
});

test('a well-formed project builds', () => {
  assert.equal(buildWithProject('name: "n"\nsummary: "s"\nstack: "Go"\norder: 9'), null);
});
