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

test('project headings become rail labels', () => {
  const html = read('projects/index.html');
  // The rail is what makes this layout the site's own; a project whose
  // sections rendered as ordinary headings would have quietly lost it.
  assert.match(html, /<span class="rail-note">[^<]+<\/span>/);
  assert.doesNotMatch(html, /<h2[^>]*>/);
});

test('the homepage and the projects page share one summary', () => {
  const home = read('index.html');
  const source = fs
    .readdirSync(path.join(import.meta.dirname, '..', 'content', 'projects'))
    .filter((f) => f.endsWith('.md'));
  assert.ok(source.length > 0, 'no projects to check');
  // Every project appears on the homepage, linking to the single page.
  assert.equal((home.match(/href="\/projects\/"/g) || []).length >= source.length, true);
});
