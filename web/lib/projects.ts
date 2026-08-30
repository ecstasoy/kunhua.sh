import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { DEFAULT_LOCALE, type Locale } from './locale';

const DIR = path.join(process.cwd(), '..', 'content', 'projects');
const dirFor = (locale: Locale) => (locale === DEFAULT_LOCALE ? DIR : path.join(DIR, locale));

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
  /** False when this locale has no translation and the text below is Chinese. */
  translated: boolean;
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

/** gray-matter surfaces a YAML error with no idea which file it came from,
 *  which for an unquoted colon in a title is a long hunt. */
function parse(file: string, where: string) {
  try {
    return matter(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${where}: ${(err as Error).message.split('\n')[0]}`);
  }
}

function sections(content: string) {
  // Split on level-two headings. Each becomes a row: heading in the rail,
  // prose beside it. Authors add or rename sections without touching code.
  const parts = content.split(/^##[ \t]+/m);
  const intro = parts.shift() ?? '';
  const rows: Section[] = parts.map((part) => {
    const newline = part.indexOf('\n');
    const label = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    return { label, html: render(body) };
  });
  return { introHtml: render(intro), sections: rows };
}

/** Name, summary, stack and body for one locale, or null when untranslated. */
function readTranslation(slug: string, locale: Locale) {
  const file = path.join(dirFor(locale), `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const where = `content/projects/${locale}/${slug}.md`;
  const { data, content } = parse(file, where);

  // Ordering is a property of the project, not of a language.
  if (data.order !== undefined) {
    throw new Error(`${where}: remove order; it is inherited from the source file`);
  }
  return {
    name: String(data.name ?? ''),
    summary: String(data.summary ?? ''),
    stack: String(data.stack ?? ''),
    content,
  };
}

function read(slug: string, locale: Locale) {
  const where = `content/projects/${slug}.md`;
  const { data, content } = parse(path.join(DIR, `${slug}.md`), where);

  for (const field of ['name', 'summary', 'stack'] as const) {
    const v = data[field];
    if (!v) {
      throw new Error(`${where} is missing front-matter: ${field}`);
    }
    if (typeof v !== 'string') {
      throw new Error(
        `${where}: ${field} must be a string, got ${
          Array.isArray(v) ? 'a list' : typeof v
        } — quote it if it starts with [`,
      );
    }
  }
  if (data.order !== undefined && typeof data.order !== 'number') {
    throw new Error(`${where}: order must be a number`);
  }

  const source = {
    name: String(data.name),
    summary: String(data.summary),
    stack: String(data.stack),
    content,
  };
  const translation = locale === DEFAULT_LOCALE ? source : readTranslation(slug, locale);
  const body = translation ?? source;

  return {
    meta: {
      slug,
      name: body.name || source.name,
      summary: body.summary || source.summary,
      stack: body.stack || source.stack,
      ...(data.code ? { code: String(data.code) } : {}),
      ...(data.live ? { live: String(data.live) } : {}),
      // Ranked by what is worth reading first, not by date. Unranked sinks.
      order: typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER,
      translated: translation !== null,
    } satisfies ProjectMeta,
    ...sections(body.content),
  };
}

function slugs(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

export function getAllProjects(locale: Locale = DEFAULT_LOCALE): Project[] {
  return slugs()
    .map((s) => {
      const { meta, introHtml, sections } = read(s, locale);
      return { ...meta, introHtml, sections };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
