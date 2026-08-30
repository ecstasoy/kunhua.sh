import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'web', 'out');
const read = (p) => fs.readFileSync(path.join(OUT, p), 'utf8');

test('emits every page at its expected path', () => {
    for (const p of ['index.html', 'posts/index.html', 'projects/index.html',
        'about/index.html']) {
        assert.ok(fs.existsSync(path.join(OUT, p)), `missing ${p}`);
    }
});

test('renders post bodies into the page', () => {
    const html = read('posts/hello/index.html');
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