import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/locale';

/**
 * Copy that speaks for the owner, kept out of the components.
 *
 * One rule throughout: removing a key means that piece is deliberately not
 * there, and the page renders without it. A key left with nothing after it is
 * somebody who meant to write something, and fails the build — a silent gap
 * looks exactly like a page that never had the thing.
 *
 * The cost of that trade is that a misspelled key would read as a deliberate
 * omission, so unknown keys are refused by name.
 */
export type Site = {
  name: string | null;
  subtitle: string | null;
  openers: { posts: string | null; projects: string | null; about: string | null };
  copyright: string | null;
  github: string | null;
  /** Null when the homepage carries no open-source entry. */
  openSource: { name: string; note: string; url: string } | null;
};

const FILE = path.join(process.cwd(), '..', 'content', 'site.yml');

const TOP = ['name', 'subtitle', 'openers', 'copyright', 'github', 'open_source'];
const OPENERS = ['posts', 'projects', 'about'];
const OPEN_SOURCE = ['name', 'note', 'url'];

function refuseUnknown(node: Record<string, unknown>, known: string[], where: string) {
  for (const key of Object.keys(node)) {
    if (!known.includes(key)) {
      throw new Error(
        `content/site.yml: ${where}${key} is not something this site has ` +
          `(expected ${known.join(', ')})`,
      );
    }
  }
}

/**
 * A value that may simply not be there.
 *
 * Empty and absent both mean "this page does not have one". An earlier version
 * made empty an error, on the reasoning that it looked like somebody had meant
 * to write something — but leaving a key and clearing its value is the obvious
 * way to say "no subtitle", and refusing it broke a deploy for saying so.
 *
 * The mistake that reasoning was guarding against is a misspelled key, and
 * that is caught by name instead.
 */
function optional(value: unknown, where: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`content/site.yml: ${where} is not text`);
  }
  return value.trim() === '' ? null : value;
}

/** Required only because the group it belongs to is present at all. */
function withinGroup(value: unknown, where: string): string {
  const text = optional(value, where);
  if (text === null) {
    throw new Error(`content/site.yml: ${where} is missing`);
  }
  return text;
}

/** Required, and allowed to differ by language. */
function localizedWithinGroup(value: unknown, locale: Locale, where: string): string {
  const text = localized(value, locale, where);
  if (text === null) {
    throw new Error(`content/site.yml: ${where} is missing`);
  }
  return text;
}

/**
 * A line shared by both languages, or one per language.
 *
 * A plain string is a decision — this reads the same on both sides. A mapping
 * has to name every locale: half of one renders an empty line rather than
 * saying anything.
 */
function localized(value: unknown, locale: Locale, where: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return optional(value, where);
  if (typeof value !== 'object') {
    throw new Error(`content/site.yml: ${where} is neither a line nor a mapping of languages`);
  }

  const byLocale = value as Record<string, unknown>;
  refuseUnknown(byLocale, [...LOCALES], `${where}.`);
  for (const l of LOCALES) {
    if (!(l in byLocale)) {
      throw new Error(`content/site.yml: ${where} gives no ${l} version`);
    }
  }
  return withinGroup(byLocale[locale], `${where}.${locale}`);
}

const cache = new Map<Locale, Site>();

export function site(locale: Locale = DEFAULT_LOCALE): Site {
  const hit = cache.get(locale);
  if (hit) return hit;

  const raw = load(fs.readFileSync(FILE, 'utf8')) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('content/site.yml is empty or not a mapping');
  }
  refuseUnknown(raw, TOP, '');

  const openers = (raw.openers ?? {}) as Record<string, unknown>;
  refuseUnknown(openers, OPENERS, 'openers.');

  let openSource: Site['openSource'] = null;
  if (raw.open_source !== undefined && raw.open_source !== null) {
    if (typeof raw.open_source !== 'object') {
      throw new Error('content/site.yml: open_source is not a group of fields');
    }
    const group = raw.open_source as Record<string, unknown>;
    refuseUnknown(group, OPEN_SOURCE, 'open_source.');
    openSource = {
      // The name and the link are the same whatever the language; what the
      // project is gets said in the language being read.
      name: withinGroup(group.name, 'open_source.name'),
      note: localizedWithinGroup(group.note, locale, 'open_source.note'),
      url: withinGroup(group.url, 'open_source.url'),
    };
  }

  const resolved: Site = {
    name: optional(raw.name, 'name'),
    subtitle: optional(raw.subtitle, 'subtitle'),
    openers: {
      posts: localized(openers.posts, locale, 'openers.posts'),
      projects: localized(openers.projects, locale, 'openers.projects'),
      about: localized(openers.about, locale, 'openers.about'),
    },
    copyright: optional(raw.copyright, 'copyright'),
    github: optional(raw.github, 'github'),
    openSource,
  };
  cache.set(locale, resolved);
  return resolved;
}
