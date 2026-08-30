import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const DIR = path.join(process.cwd(), '..', 'content', 'projects');

/** One `##` section: its heading goes in the rail, its prose beside it. */
export type Section = { label: string; html: string };

export type ProjectMeta = {
  slug: string;
  name: string;
  /** The single line the homepage shows. */
  summary: string;
  /** Shown in the rail beside the name, the way a resume lists it. */
  stack: string;
  code?: string;
  live?: string;
  order: number;
};
export type Project = ProjectMeta & {
  /** Prose before the first `##`, if any. */
  introHtml: string;
  sections: Section[];
};

const render = (md: string) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
    .toString()
    .trim();

function read(slug: string) {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), 'utf8');
  const { data, content } = matter(raw);

  for (const field of ['name', 'summary', 'stack'] as const) {
    const v = data[field];
    if (!v) {
      throw new Error(`content/projects/${slug}.md is missing front-matter: ${field}`);
    }
    // YAML turns `name: [x]` into a list. The field is present, so a presence
    // check passes and the wrong thing renders.
    if (typeof v !== 'string') {
      throw new Error(
        `content/projects/${slug}.md: ${field} must be a string, got ${
          Array.isArray(v) ? 'a list' : typeof v
        } — quote it if it starts with [`,
      );
    }
  }
  if (data.order !== undefined && typeof data.order !== 'number') {
    throw new Error(`content/projects/${slug}.md: order must be a number`);
  }

  // Split on level-two headings. Each becomes a row: heading in the rail,
  // prose beside it. Authors add or rename sections without touching code.
  const parts = content.split(/^##[ \t]+/m);
  const intro = parts.shift() ?? '';
  const sections: Section[] = parts.map((part) => {
    const newline = part.indexOf('\n');
    const label = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    return { label, html: render(body) };
  });

  return {
    meta: {
      slug,
      name: String(data.name),
      summary: String(data.summary),
      stack: String(data.stack),
      ...(data.code ? { code: String(data.code) } : {}),
      ...(data.live ? { live: String(data.live) } : {}),
      // Ranked by what is worth reading first, not by date. Unranked sinks.
      order: typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER,
    } satisfies ProjectMeta,
    introHtml: render(intro),
    sections,
  };
}

function slugs(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

export function getAllProjects(): Project[] {
  return slugs()
    .map((s) => {
      const { meta, introHtml, sections } = read(s);
      return { ...meta, introHtml, sections };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
