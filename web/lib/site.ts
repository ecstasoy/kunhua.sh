import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/locale';

/**
 * Copy that speaks for the owner, kept out of the components.
 *
 * Read at build time. A missing or incomplete file fails the build rather than
 * rendering a page with a hole where its opening line should be.
 */
export type Site = {
  name: string;
  subtitle: string;
  /** One line per page, already resolved for the locale being rendered. */
  openers: { posts: string; projects: string; about: string };
  copyright: string;
  github: string;
  openSource: { name: string; note: string; url: string };
};

const FILE = path.join(process.cwd(), '..', 'content', 'site.yml');

function required(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`content/site.yml is missing ${where}`);
  }
  return value;
}

/**
 * A line that may be shared by both languages or given per language.
 *
 * A plain string is a decision — this reads the same on both sides — so it is
 * taken as written. A mapping must name every locale: a half-filled one would
 * render an empty opener rather than say anything.
 */
function localized(value: unknown, locale: Locale, where: string): string {
  if (typeof value === 'string') return required(value, where);
  if (typeof value !== 'object' || value === null) {
    throw new Error(`content/site.yml: ${where} is neither a line nor a mapping of languages`);
  }
  const byLocale = value as Record<string, unknown>;
  for (const l of LOCALES) {
    if (!(l in byLocale)) {
      throw new Error(`content/site.yml: ${where} gives no ${l} version`);
    }
  }
  return required(byLocale[locale], `${where}.${locale}`);
}

const cache = new Map<Locale, Site>();

export function site(locale: Locale = DEFAULT_LOCALE): Site {
  const hit = cache.get(locale);
  if (hit) return hit;

  const raw = load(fs.readFileSync(FILE, 'utf8')) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('content/site.yml is empty or not a mapping');
  }

  const openers = (raw.openers ?? {}) as Record<string, unknown>;
  const openSource = (raw.open_source ?? {}) as Record<string, unknown>;

  const resolved: Site = {
    name: required(raw.name, 'name'),
    subtitle: required(raw.subtitle, 'subtitle'),
    openers: {
      posts: localized(openers.posts, locale, 'openers.posts'),
      projects: localized(openers.projects, locale, 'openers.projects'),
      about: localized(openers.about, locale, 'openers.about'),
    },
    copyright: required(raw.copyright, 'copyright'),
    github: required(raw.github, 'github'),
    openSource: {
      name: required(openSource.name, 'open_source.name'),
      note: required(openSource.note, 'open_source.note'),
      url: required(openSource.url, 'open_source.url'),
    },
  };
  cache.set(locale, resolved);
  return resolved;
}
