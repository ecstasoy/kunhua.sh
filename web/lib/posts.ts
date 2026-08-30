import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

// next build runs with cwd = web/, so content/ is one level up.
const DIR = path.join(process.cwd(), '..', 'content', 'posts');

// Timestamps are shown in one declared zone rather than the reader's, which
// would need JavaScript and would shift the page under them after first paint.
const ZONE = 'America/New_York';

export type PostMeta = {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO 8601 with offset — the machine-readable value for <time datetime>. */
  published: string;
  /** Date only, for listings: the rail is too narrow for a full timestamp. */
  publishedDate: string;
  /** To the minute, with the zone named. */
  publishedFull: string;
  /** Present only when the post was revised after publication. */
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

function requireTimestamp(slug: string, field: string, raw: unknown): Date {
  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`content/posts/${slug}.md is missing front-matter: ${field}`);
  }
  // YAML parses an unquoted timestamp into a Date; anything else is a mistake
  // worth naming, since a wrong type renders wrongly rather than not at all.
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

function read(slug: string) {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), 'utf8');
  const { data, content } = matter(raw);

  for (const field of ['title', 'excerpt'] as const) {
    const v = data[field];
    if (!v) {
      throw new Error(`content/posts/${slug}.md is missing front-matter: ${field}`);
    }
    // YAML turns `title: [x]` into a list. The field is present, so a presence
    // check passes and the wrong thing renders.
    if (typeof v !== 'string') {
      throw new Error(
        `content/posts/${slug}.md: ${field} must be a string, got ${
          Array.isArray(v) ? 'a list' : typeof v
        } — quote it if it starts with [`,
      );
    }
  }

  const published = requireTimestamp(slug, 'published', data.published);
  const updated =
    data.updated === undefined ? undefined : requireTimestamp(slug, 'updated', data.updated);

  if (updated && updated < published) {
    throw new Error(`content/posts/${slug}.md: updated is earlier than published`);
  }

  const meta: PostMeta = {
    slug,
    title: String(data.title),
    excerpt: String(data.excerpt),
    published: published.toISOString(),
    publishedDate: dateOnly.format(published),
    publishedFull: toMinute(published),
    // Shown only when it differs — a revision timestamp equal to publication
    // says nothing, and one that moves for a typo devalues every other post's.
    ...(updated && updated.getTime() !== published.getTime()
      ? { updated: updated.toISOString(), updatedFull: toMinute(updated) }
      : {}),
  };
  return { meta, content };
}

export function getAllPosts(): PostMeta[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => read(f.replace(/\.md$/, '')).meta)
    // By instant, not by date string: two posts on the same day need an order.
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
}

export function getPost(slug: string): Post {
  const { meta, content } = read(slug);
  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(content)
    .toString();
  return { ...meta, html };
}
