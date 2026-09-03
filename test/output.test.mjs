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


test('every page carries the machine line in its unavailable state', () => {
    // The static export is what keeps the site up when the service is not, so
    // the degraded path is the one that ships. Asserting it here covers it in
    // the build rather than relying on someone remembering to stop the service
    // and look — which is how "renders without the service" quietly stops
    // being true.
    //
    // Every page, not just the homepage: the line lives in the colophon now,
    // so a page that lost the shell would lose it too.
    let checked = 0;
    for (const file of everyPage().filter((f) => !/404|_not-found/.test(f))) {
        const home = path.relative(OUT, file);
        const html = fs.readFileSync(file, 'utf8');
        assert.match(
            html,
            /data-machine-status="unavailable"/,
            `${home}: no machine line, or it was emitted as if live`,
        );
        // The em dash placeholder, twice: uptime and deploy time.
        const placeholders = html.match(/data-machine-status="unavailable"[^]*?<\/footer>/)?.[0] ?? '';
        assert.equal(
            (placeholders.match(/—/g) ?? []).length,
            2,
            `${home}: expected a placeholder for both values`,
        );
        assert.match(placeholders, /unreachable/, `${home}: no explanation`);
        checked++;
    }
    assert.ok(checked > 1, 'expected the line on more than one page');
});

test('the machine line names no value the service does not send', () => {
    // The frontend type and the Go handler are two declarations of one
    // contract; nothing but a matching pair of tests keeps them together.
    const contract = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'lib', 'status.ts'), 'utf8');
    const status = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'api', 'internal', 'server', 'status.go'), 'utf8');

    const fields = [...contract.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    assert.ok(fields.length >= 3, 'no fields found in the frontend type');
    for (const field of fields) {
        assert.match(
            status,
            new RegExp(`json:"${field}"`),
            `web/lib/status.ts declares ${field}, which the Go handler never sends`,
        );
    }
});

test('both homepages ship the listening section in its empty state', () => {
    // Nothing is fetched at build time, so what ships is the state with
    // nothing to say: a hidden marker and no heading. A section that reserved
    // space would leave a hole on the page whenever the fetcher was down.
    for (const home of ['index.html', 'en/index.html']) {
        const html = read(home);
        assert.match(html, /data-now-playing="none"/, `${home}: shipped as if a track were known`);
        assert.doesNotMatch(html, />Listening</, `${home}: heading rendered with nothing under it`);
    }
});

test('the now-playing contract names nothing the service does not send', () => {
    const contract = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'lib', 'nowPlaying.ts'), 'utf8');
    const handler = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'api', 'internal', 'server', 'nowplaying.go'), 'utf8');

    // The NowPlaying type's own fields, not the whole file: other types in
    // there describe view state, which the service knows nothing about.
    const body = contract.match(/export type NowPlaying = \{([^]*?)\};/)?.[1] ?? '';
    const fields = [...body.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    assert.ok(fields.length >= 3, 'no fields found in the frontend type');

    for (const field of fields) {
        assert.match(handler, new RegExp(`json:"${field}"`),
            `web/lib/nowPlaying.ts declares ${field}, which the Go handler never sends`);
    }
});

test('both homepages ship the topster in its empty state', () => {
    // Nothing is fetched at build time, so what ships is the state with no
    // grid at all: no heading, no controls, no reserved space. A grid of
    // placeholder squares would claim data that is not there.
    for (const home of ['index.html', 'en/index.html']) {
        const html = read(home);
        assert.match(html, /data-top-albums="none"/, `${home}: shipped as if albums were known`);
        assert.doesNotMatch(html, />Albums</, `${home}: heading rendered with nothing under it`);
    }
});

test('the top-albums contract names nothing the service does not send', () => {
    const contract = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'lib', 'topAlbums.ts'), 'utf8');
    const handler = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'api', 'internal', 'server', 'topalbums.go'), 'utf8');

    for (const [, type] of [['', 'TopAlbums'], ['', 'Album']]) {
        const body = contract.match(new RegExp(`export type ${type} = \\{([^]*?)\\};`))?.[1] ?? '';
        const fields = [...body.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
        assert.ok(fields.length >= 3, `no fields found in ${type}`);
        for (const field of fields) {
            assert.match(handler, new RegExp(`json:"${field}"`),
                `web/lib/topAlbums.ts declares ${type}.${field}, which the Go handler never sends`);
        }
    }
});

test('every text colour meets WCAG AA against the page', () => {
    // Written after --rule, a border colour, was used as text at 1.31:1 —
    // the words "service unreachable" were invisible, on a line whose entire
    // purpose is making a failure visible. Computed rather than eyeballed.
    const css = fs
        .readdirSync(path.join(OUT, '_next/static/chunks'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
        .join('');

    // The minifier shortens #ffffff to #fff, so both forms have to parse.
    const expand = (hex) =>
        hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;

    const luminance = (hex) => {
        const n = parseInt(expand(hex).slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
            .map((c) => {
                const v = c / 255;
                return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((acc, c, i) => acc + [0.2126, 0.7152, 0.0722][i] * c, 0);
    };
    const ratio = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };

    const tokensIn = (block) =>
        Object.fromEntries(
            [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\b/gi)].map((m) => [m[1], m[2]]),
        );

    const light = tokensIn(css.match(/:root\{([^}]*)\}/)?.[1] ?? '');
    const darkBlock = css.match(/\[data-theme=["']?dark["']?\]\{([^}]*)\}/)?.[1] ?? '';
    const dark = { ...light, ...tokensIn(darkBlock) };
    assert.ok(light.paper && light.ink, 'no palette found in the emitted CSS');

    // Tokens used as text somewhere. --rule is deliberately absent: it is a
    // border and background colour, and using it as text is the bug this
    // test exists for.
    const textTokens = ['ink', 'soft', 'muted', 'faint', 'accent'];
    for (const [theme, palette] of [['light', light], ['dark', dark]]) {
        for (const token of textTokens) {
            const r = ratio(palette[token], palette.paper);
            assert.ok(
                r >= 4.5,
                `${theme}: --${token} (${palette[token]}) on --paper is ${r.toFixed(2)}:1, below AA's 4.5:1`,
            );
        }
    }
});

test('focusable things have a visible focus style', () => {
    // Links carry an underline, but covers and buttons have their border
    // removed and were invisible when focused: the site had no :focus-visible
    // rule at all.
    const css = fs
        .readdirSync(path.join(OUT, '_next/static/chunks'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
        .join('');
    assert.match(css, /:focus-visible\{[^}]*outline:/, 'no :focus-visible outline anywhere');
});

test('every period the service offers has a label', () => {
    // The two are declared in different languages, so adding a period on the
    // Go side alone would put a raw key like "3month" on the page.
    const go = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'api', 'internal', 'lastfm', 'albums.go'), 'utf8');
    const ts = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'lib', 'topAlbums.ts'), 'utf8');

    const periods = [...(go.match(/var Periods = \[\]string\{([^}]*)\}/)?.[1] ?? '')
        .matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(periods.length >= 4, 'no periods found in albums.go');

    const labels = ts.match(/PERIOD_LABELS[^=]*= \{([^}]*)\}/)?.[1] ?? '';
    for (const p of periods) {
        assert.ok(
            new RegExp(`['"]?${p}['"]?\\s*:`).test(labels),
            `the service offers the period ${p}, which PERIOD_LABELS does not name`,
        );
    }
});

test('the built stylesheet contains no declaration a browser will drop', () => {
    // Both of these shipped. repeat(min(var(--cols), 3), 1fr) is not a valid
    // track list, so the mobile grid silently fell back to the desktop rule;
    // and the minifier turns saturate(1) into saturate(), which is invalid, so
    // the hover that restores a cover's colour did nothing in production while
    // working in development.
    const css = fs
        .readdirSync(path.join(OUT, '_next/static/chunks'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
        .join('');

    // A CSS function with no argument at all.
    const empty = css.match(/\b(saturate|blur|grayscale|brightness|contrast|scale|translate|rotate)\(\)/g);
    assert.deepEqual(empty, null, `functions called with no argument: ${empty}`);

    // repeat()'s first argument must be an integer, auto-fill or auto-fit.
    // Searched across the whole file rather than per declaration: the minifier
    // keeps an invalid form as a second declaration beside a valid one, where
    // it wins by being last and the valid one is only a decoy.
    const counts = [...css.matchAll(/repeat\(\s*([^,]+),/g)]
        .map((m) => m[1].trim())
        .filter((c) => !/^(\d+|auto-fill|auto-fit)$/.test(c));
    assert.deepEqual(
        [...new Set(counts)],
        [],
        `repeat() counts that are not an integer or auto-fill/auto-fit: ${counts}`,
    );
});

test('the editor is reached only through the server saying so', () => {
    // Asserting that no <textarea> ships would pass whatever the code did: the
    // whole grid is absent from the static output, so nothing inside it can
    // appear either. That is the "scanned 0 links" shape — a green check that
    // cannot fail.
    //
    // What can be checked is the source: the editor's gate has to read the
    // server's answer, not a value the page decides for itself. The guarantee
    // itself is the session check on PUT /api/notes, which is tested in Go.
    const src = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'web', 'components', 'Topster.tsx'), 'utf8');

    const gates = [...src.matchAll(/editable=\{([^}]*)\}/g)].map((m) => m[1].trim());
    assert.ok(gates.length > 0, 'nothing is gated on editable');
    for (const gate of gates) {
        assert.match(
            gate,
            /^data\?\.editable/,
            `the editor is gated on \`${gate}\`, which the server does not decide`,
        );
    }
});

test('no admin token appears anywhere in the built site', () => {
    // The token lives on the host and in the owner's keyboard. A sign-in page
    // that carried one would hand writing to everybody.
    const files = fs.readdirSync(OUT, { recursive: true })
        .filter((f) => /\.(html|js|css|txt|json)$/.test(String(f)))
        .map((f) => path.join(OUT, String(f)));

    for (const file of files) {
        const body = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(body, /ADMIN_TOKEN/, `${path.relative(OUT, file)} names ADMIN_TOKEN`);
        // A long opaque string assigned to something token-shaped.
        assert.doesNotMatch(
            body,
            /token\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/,
            `${path.relative(OUT, file)} contains what looks like a literal token`,
        );
    }
});

test('no font stack is written out at its point of use', () => {
    // The fallback chain used to be repeated at every declaration and had
    // drifted into three different chains for one font, so a reader without
    // the webfont got a different monospace on the dates than in the code.
    // Same rule as colour and size: name the token, never the value.
    const css = fs
        .readdirSync(path.join(OUT, '_next/static/chunks'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(OUT, '_next/static/chunks', f), 'utf8'))
        .join('');

    // The three definitions are the one place a family may be spelled out.
    const defined = [...css.matchAll(/--(?:sans|serif|mono):[^;}]*/g)].map((m) => m[0]);
    assert.equal(defined.length, 3, `expected three stack tokens, found ${defined.length}`);

    // next/font generates two things that name a family directly: the
    // @font-face blocks for what it downloaded, and a utility class per face.
    // Both are its own output, identified by shape rather than by guessing at
    // the family names.
    const ours = css
        .replace(/@font-face\s*\{[^}]*\}/g, '')
        .replace(/\.[\w-]*module__[\w-]*[^{]*\{[^}]*\}/g, '');

    let uses = 0;
    for (const [, value] of ours.matchAll(/font-family:([^;}]*)/g)) {
        assert.match(
            value.trim(),
            /^var\(--(sans|serif|mono)\)$/,
            `font-family: ${value.trim()} names a family instead of a token`,
        );
        uses++;
    }
    assert.ok(uses > 0, 'no font-family declarations were checked');
});
