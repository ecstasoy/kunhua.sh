import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

/**
 * Copy that speaks for the owner, kept out of the components.
 *
 * Read at build time. A missing or incomplete file fails the build rather than
 * rendering a page with a hole where the opening line should be.
 */
export type Site = {
  name: string;
  subtitle: string;
  openers: { posts: string; projects: string; about: string };
  copyright: string;
  github: string;
  openSource: { name: string; note: string; url: string };
};

const FILE = path.join(process.cwd(), '..', 'content', 'site.yml');

function require_(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`content/site.yml is missing ${where}`);
  }
  return value;
}

let cached: Site | null = null;

export function site(): Site {
  if (cached) return cached;

  const raw = load(fs.readFileSync(FILE, 'utf8')) as Record<string, any>;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('content/site.yml is empty or not a mapping');
  }

  const openers = raw.openers ?? {};
  const openSource = raw.open_source ?? {};

  cached = {
    name: require_(raw.name, 'name'),
    subtitle: require_(raw.subtitle, 'subtitle'),
    openers: {
      posts: require_(openers.posts, 'openers.posts'),
      projects: require_(openers.projects, 'openers.projects'),
      about: require_(openers.about, 'openers.about'),
    },
    copyright: require_(raw.copyright, 'copyright'),
    github: require_(raw.github, 'github'),
    openSource: {
      name: require_(openSource.name, 'open_source.name'),
      note: require_(openSource.note, 'open_source.note'),
      url: require_(openSource.url, 'open_source.url'),
    },
  };
  return cached;
}
