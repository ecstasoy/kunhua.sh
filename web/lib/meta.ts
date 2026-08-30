import type { Metadata } from 'next';
import { SITE, hrefLang, href, other, DEFAULT_LOCALE, type Locale } from './locale';

/**
 * A self-referencing canonical plus hreflang alternates. The alternate is
 * emitted only when the counterpart exists: pointing one at a 404 invalidates
 * the whole set, and pointing it at the home page tells a crawler the home
 * page is this article's translation.
 */
export function alternates(locale: Locale, path: string, hasCounterpart = true): Metadata {
  const self = `${SITE}${href(locale, path)}`;
  const languages: Record<string, string> = { [hrefLang[locale]]: self };
  if (hasCounterpart) {
    const alt = other(locale);
    languages[hrefLang[alt]] = `${SITE}${href(alt, path)}`;
    languages['x-default'] = `${SITE}${href(DEFAULT_LOCALE, path)}`;
  }
  return { alternates: { canonical: self, languages } };
}

/**
 * Where the language switch points. With no counterpart it goes to the other
 * locale's home rather than a 404 — a switch that sometimes vanishes or
 * sometimes breaks reads as a broken site.
 */
export function counterpart(locale: Locale, path: string, hasCounterpart: boolean) {
  const alt = other(locale);
  return hasCounterpart ? href(alt, path) : href(alt, '/');
}
