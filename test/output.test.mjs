import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'web', 'out');
const read = (p) => fs.readFileSync(path.join(OUT, p), 'utf8');

// Pick a post from the emitted output rather than naming one. Asserting on a
// particular slug couples the gate to whichever post happens to exist, so
// deleting or renaming one turns the build red for an unrelated reason.
function somePost() {
  const dir = path.join(OUT, 'posts');
  const slug = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)[0];
  assert.ok(slug, 'no post was emitted');
  return read(path.join('posts', slug, 'index.html'));
}

test('emits every page at its expected path', () => {
    for (const p of ['index.html', 'posts/index.html', 'projects/index.html',
        'about/index.html']) {
        assert.ok(fs.existsSync(path.join(OUT, p)), `missing ${p}`);
    }
});

test('renders post bodies into the page', () => {
    const html = somePost();
    assert.match(html, /<p>/);
});

test('the wordmark links home', () => {
    assert.match(read('index.html'), /<a href="\/"[^>]*wordmark/);
});

test('no contact address in plain text', () => {
    const all = fs.readdirSync(OUT, { recursive: true })
        .filter((f) => /\.(html|js|css|txt)$/.test(String(f)))
        .map((f) => fs.readFileSync(path.join(OUT, String(f)), 'utf8'))
        .join('');
    assert.doesNotMatch(all, /northeastern/);
});

test('none of the prohibited visual devices appear', () => {
    const css = fs.readdirSync(path.join(OUT, '_next/static/chunks'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
        .join('');
    for (const bad of ['linear-gradient', 'backdrop-filter', 'box-shadow']) {
        assert.ok(!css.includes(bad), `found ${bad}`);
    }
});

test('post pages carry a machine-readable timestamp to the minute', () => {
  const html = somePost();
  // React emits the prop as dateTime; HTML parsing lowercases attribute names,
  // so browsers see datetime. Assert case-insensitively rather than fighting it.
  assert.match(html, /<time[^>]+datetime="\d{4}-\d{2}-\d{2}T[\d:.]+Z"/i);
  assert.match(html, /\d{4}-\d{2}-\d{2} \d{2}:\d{2} [A-Z]{2,5}</);
});

test('listings show the date only — the rail is too narrow for a time', () => {
  const html = read('index.html');
  const shown = html.match(/<time class="date"[^>]*>([^<]+)</);
  assert.ok(shown, 'no dated entry on the homepage');
  assert.match(shown[1], /^\d{4}-\d{2}-\d{2}$/);
});

test('emits exactly the posts that exist, and nothing else', () => {
  const source = fs
    .readdirSync(path.join(import.meta.dirname, '..', 'content', 'posts'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
  const emitted = fs
    .readdirSync(path.join(OUT, 'posts'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  // A stale or leaked page here would be deployed: the deploy step rsyncs the
  // whole of out/. A test fixture once made it this far.
  assert.deepEqual(emitted, source);
});

test('project headings become rail labels, never plain headings', () => {
  const html = read('projects/index.html');
  const source = fs
    .readdirSync(path.join(import.meta.dirname, '..', 'content', 'projects'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(import.meta.dirname, '..', 'content', 'projects', f), 'utf8'))
    .join('');
  // Sections are optional, so their absence is not a failure. What must never
  // happen is one rendering as an ordinary heading: the rail is the layout.
  assert.doesNotMatch(html, /<h2[^>]*>/);
  if (/^## /m.test(source)) {
    assert.match(html, /<span class="rail-note">[^<]+<\/span>/);
  }
});

test('every summary on the homepage comes verbatim from a project file', () => {
  const dir = path.join(import.meta.dirname, '..', 'content', 'projects');
  const summaries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .map((raw) => raw.match(/^summary:\s*"?(.*?)"?\s*$/m)?.[1])
    .filter(Boolean);
  assert.ok(summaries.length > 0, 'no project summaries found');

  const unescape = (t) =>
    t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
     .replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

  // The homepage shows a subset, so what matters is not how many appear but
  // that none of them is a second copy of the text living in the page.
  const home = read('index.html');
  // The rail label, not the masthead link of the same name, which comes first
  // in the document and would drag the Writing section into the slice.
  const marker = '<div class="rail">Projects</div>';
  const at = home.indexOf(marker);
  assert.notEqual(at, -1, 'no Projects section on the homepage');
  const shownAfterProjects = home.slice(at);
  const shown = [...shownAfterProjects.matchAll(/<p class="item-excerpt">([^<]*)<\/p>/g)]
    .map((m) => unescape(m[1]));
  assert.ok(shown.length > 0, 'no project summary rendered on the homepage');
  for (const text of shown) {
    assert.ok(summaries.includes(text), `not from a project file: ${text.slice(0, 30)}`);
  }
});

