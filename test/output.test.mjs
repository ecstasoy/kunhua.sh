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

// ── bilingual ──────────────────────────────────────────────────────────────

const CONTENT = path.join(import.meta.dirname, '..', 'content');
const mdIn = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];

test('no orphan translation: every English file has a Chinese source', () => {
  for (const kind of ['posts', 'projects']) {
    const source = new Set(mdIn(path.join(CONTENT, kind)));
    for (const f of mdIn(path.join(CONTENT, kind, 'en'))) {
      assert.ok(source.has(f), `content/${kind}/en/${f} has no Chinese source`);
    }
  }
});

test('translations carry no ordering or dates of their own', () => {
  // A translation is not a separate publication. Enforced at build time too;
  // asserted here so the rule cannot quietly rot into a comment.
  for (const kind of ['posts', 'projects']) {
    for (const f of mdIn(path.join(CONTENT, kind, 'en'))) {
      const head = fs.readFileSync(path.join(CONTENT, kind, 'en', f), 'utf8').split('\n---')[0];
      for (const field of ['published', 'updated', 'order']) {
        assert.doesNotMatch(head, new RegExp(`^${field}:`, 'm'), `${kind}/en/${f} sets ${field}`);
      }
    }
  }
});

test('/en/ emits the same four pages as the root', () => {
  for (const p of ['index.html', 'posts/index.html', 'projects/index.html', 'about/index.html']) {
    assert.ok(fs.existsSync(path.join(OUT, 'en', p)), `missing /en/${p}`);
  }
});

/** Turn a site path into the file the export should have produced. */
const pageFor = (url) => path.join(OUT, url.replace(/^\//, '').replace(/\/$/, ''), 'index.html');

function everyPage() {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === 'index.html' ? [path.join(dir, e.name)] : [],
    );
  return walk(OUT).filter((f) => !f.includes(`${path.sep}_next${path.sep}`));
}

test('every language switch lands on a page that was generated', () => {
  // This is the assertion that matters: the fallback it exercises only runs
  // when a counterpart is missing, which is rare enough to stay green until
  // the day it is not.
  let checked = 0;
  for (const file of everyPage()) {
    const html = fs.readFileSync(file, 'utf8');
    const m = html.match(/<a href="([^"]+)" class="locale-switch">/);
    if (!m) continue;
    checked++;
    assert.ok(fs.existsSync(pageFor(m[1])), `${file}: switch points at missing ${m[1]}`);
  }
  assert.ok(checked > 0, 'no language switch found on any page');
});

test('every hreflang target exists', () => {
  let checked = 0;
  for (const file of everyPage()) {
    const html = fs.readFileSync(file, 'utf8');
    for (const [, url] of html.matchAll(/<link rel="alternate" hreflang="[^"]*" href="https:\/\/kunhua\.sh([^"]*)"/gi)) {
      checked++;
      assert.ok(fs.existsSync(pageFor(url)), `${file}: hreflang points at missing ${url}`);
    }
  }
  assert.ok(checked > 0, 'no hreflang alternates found');
});

// ── theme ──────────────────────────────────────────────────────────────────

test('every page runs the theme script inside head, before anything paints', () => {
  // Next's 404 output is excluded: Caddy has no handle_errors, so it is never
  // served and carries none of the site's own head.
  for (const file of everyPage().filter((f) => !/404|_not-found/.test(f))) {
    const html = fs.readFileSync(file, 'utf8');
    const head = html.match(/<head>([\s\S]*?)<\/head>/);
    assert.ok(head, `${file}: no head`);
    // Synchronous and in head is what makes the first paint already correct;
    // deferred or moved into body, the page would flash the wrong theme.
    assert.match(head[1], /<script>\(function\(\)\{var t;/, `${file}: theme script missing from head`);
    assert.doesNotMatch(head[1], /<script[^>]+(defer|async)[^>]*>\(function\(\)\{var t;/);
  }
});

test('the dark theme redefines the tokens', () => {
  const css = fs
    .readdirSync(path.join(OUT, '_next/static/chunks'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
    .join('');
  assert.match(css, /\[data-theme=["\']?dark["\']?\]/);
  // Every colour comes from these, so a theme that missed one would leave a
  // light value stranded on a dark page.
  for (const token of ['--paper', '--ink', '--rule', '--accent']) {
    const block = css.match(/\[data-theme=["\']?dark["\']?\]\{([^}]*)\}/);
    assert.ok(block && block[1].includes(token), `dark theme does not set ${token}`);
  }
});

test('no font size is written as a literal', () => {
  // Sizes used to live in the stylesheet and inline in components at once, so
  // a change meant editing both. Colours never had that problem because they
  // were tokens from the start, which is why the dark theme was seven lines.
  const css = fs
    .readdirSync(path.join(OUT, '_next/static/chunks'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
    .join('');
  const inCss = css.match(/font-size:\s*[0-9.]+(px|rem)/g) ?? [];
  assert.deepEqual(inCss, [], `literal font-size in CSS: ${inCss.join(', ')}`);

  for (const file of everyPage().filter((f) => !/404|_not-found/.test(f))) {
    const html = fs.readFileSync(file, 'utf8');
    const inline = html.match(/font-size:\s*[0-9.]+(px|rem)/g) ?? [];
    assert.deepEqual(inline, [], `${file}: literal font-size inline`);
  }
});

test('every internal fragment link lands on an element that exists', () => {
  // The link checker follows URLs but not fragments, so renaming a slug would
  // leave the homepage pointing at an anchor that is no longer there — a link
  // that still returns 200 and silently drops you at the top of the page.
  let checked = 0;
  for (const file of everyPage().filter((f) => !/404|_not-found/.test(f))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const [, url, id] of html.matchAll(/href="(\/[^"#]*)#([^"]+)"/g)) {
      const target = pageFor(url);
      assert.ok(fs.existsSync(target), `${file}: ${url} does not exist`);
      const targetHtml = fs.readFileSync(target, 'utf8');
      assert.match(targetHtml, new RegExp(`id="${id}"`), `${file}: no #${id} on ${url}`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'no fragment links found');
});

