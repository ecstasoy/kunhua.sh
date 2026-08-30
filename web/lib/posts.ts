import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { DEFAULT_LOCALE, type Locale } from './locale';

// next build runs with cwd = web/, so content/ is one level up.
const DIR = path.join(process.cwd(), '..', 'content', 'posts');
const dirFor = (locale: Locale) => (locale === DEFAULT_LOCALE ? DIR : path.join(DIR, locale));

// Timestamps are shown in one declared zone rather than the reader's, which
// would need JavaScript and would shift the page under them after first paint.
const ZONE = 'America/New_York';

export type PostMeta = {
  slug: string;
  title: string;
  excerpt: string;
  /** False when this locale has no translation and the text below is Chinese. */
  translated: boolean;
  /** ISO 8601 with offset — the machine-readable value for <time datetime>. */
  published: string;
  /** Date only, for listings: the rail is too narrow for a full timestamp. */
  publishedDate: string;
  /** To the minute, with the zone named. */
  publishedFull: string;
  updated?: string;
  updatedFull?: string;
};
export type Post = PostMeta & { html: string };

const dateOnly = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeOnly = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
});

// Composed rather than formatted in one pass: a combined format inserts a
// comma between the date and the time, which reads as a list.
const toMinute = (d: Date) => `${dateOnly.format(d)} ${timeOnly.format(d)}`;

const render = (md: string) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
    .toString();

function requireTimestamp(slug: string, field: string, raw: unknown): Date {
  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`content/posts/${slug}.md is missing front-matter: ${field}`);
  }
  if (!(raw instanceof Date)) {
    throw new Error(
      `content/posts/${slug}.md: ${field} must be a timestamp, got ${
        Array.isArray(raw) ? 'a list' : typeof raw
      } — write it as 2026-08-30T14:32:00-04:00`,
    );
  }
  if (Number.isNaN(raw.getTime())) {
    throw new Error(`content/posts/${slug}.md: ${field} is not a valid timestamp`);
  }
  return raw;
}

/** gray-matter surfaces a YAML error with no idea which file it came from,
 *  which for an unquoted colon in a title is a long hunt. */
function parse(file: string, where: string) {
  try {
    return matter(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${where}: ${(err as Error).message.split('\n')[0]}`);
  }
}

function requireString(where: string, field: string, v: unknown): string {
  if (!v) throw new Error(`${where} is missing front-matter: ${field}`);
  // YAML turns `title: [x]` into a list. The field is present, so a presence
  // check passes and the wrong thing renders.
  if (typeof v !== 'string') {
    throw new Error(
      `${where}: ${field} must be a string, got ${
        Array.isArray(v) ? 'a list' : typeof v
      } — quote it if it starts with [`,
    );
  }
  return v;
}

/** Title, excerpt and body for one locale, or null when untranslated. */
function readTranslation(slug: string, locale: Locale) {
  const file = path.join(dirFor(locale), `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const where = `content/posts/${locale}/${slug}.md`;
  const { data, content } = parse(file, where);

  // A translation is not a separate publication: dates and ordering come from
  // the source file, so carrying them here can only introduce a disagreement.
  for (const forbidden of ['published', 'updated'] as const) {
    if (data[forbidden] !== undefined) {
      throw new Error(`${where}: remove ${forbidden}; it is inherited from the source file`);
    }
  }
  return {
    title: requireString(where, 'title', data.title),
    excerpt: requireString(where, 'excerpt', data.excerpt),
    content,
  };
}

function read(slug: string, locale: Locale) {
  const where = `content/posts/${slug}.md`;
  const { data, content } = parse(path.join(DIR, `${slug}.md`), where);

  const source = {
    title: requireString(where, 'title', data.title),
    excerpt: requireString(where, 'excerpt', data.excerpt),
    content,
  };
  const published = requireTimestamp(slug, 'published', data.published);
  const updated =
    data.updated === undefined ? undefined : requireTimestamp(slug, 'updated', data.updated);
  if (updated && updated < published) {
    throw new Error(`${where}: updated is earlier than published`);
  }

  const translation = locale === DEFAULT_LOCALE ? source : readTranslation(slug, locale);
  const body = translation ?? source;

  const meta: PostMeta = {
    slug,
    title: body.title,
    excerpt: body.excerpt,
    translated: translation !== null,
    published: published.toISOString(),
    publishedDate: dateOnly.format(published),
    publishedFull: toMinute(published),
    ...(updated && updated.getTime() !== published.getTime()
      ? { updated: updated.toISOString(), updatedFull: toMinute(updated) }
      : {}),
  };
  return { meta, content: body.content };
}

/** Slugs come from the source directory: a translation without a source is an
 *  orphan, which the gate rejects rather than silently publishing. */
export function postSlugs(): string[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

/** Slugs that have a page in this locale. Chinese is the source so it has
 *  them all; English only has the translated ones — an English page holding
 *  Chinese text would make its hreflang a lie. */
export function slugsIn(locale: Locale): string[] {
  if (locale === DEFAULT_LOCALE) return postSlugs();
  return postSlugs().filter((slug) => fs.existsSync(path.join(dirFor(locale), `${slug}.md`)));
}

export function getAllPosts(locale: Locale = DEFAULT_LOCALE): PostMeta[] {
  return postSlugs()
    .map((s) => read(s, locale).meta)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
}

export function getPost(slug: string, locale: Locale = DEFAULT_LOCALE): Post {
  const { meta, content } = read(slug, locale);
  return { ...meta, html: render(content) };
}
