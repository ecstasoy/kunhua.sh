import type { Metadata } from 'next';
import { SITE, hrefLang, path, other, DEFAULT_LOCALE, type Locale } from './locale';

/**
 * A self-referencing canonical plus hreflang alternates. The alternate is
 * emitted only when the counterpart exists: pointing one at a 404 invalidates
 * the whole set, and pointing it at the home page tells a crawler the home
 * page is this article's translation.
 */
export function alternates(locale: Locale, route: string, hasCounterpart = true): Metadata {
  const self = `${SITE}${path(locale, route)}`;
  const languages: Record<string, string> = { [hrefLang[locale]]: self };
  if (hasCounterpart) {
    const alt = other(locale);
    languages[hrefLang[alt]] = `${SITE}${path(alt, route)}`;
    languages['x-default'] = `${SITE}${path(DEFAULT_LOCALE, route)}`;
  }
  return { alternates: { canonical: self, languages } };
}

/**
 * Where the language switch points. With no counterpart it goes to the other
 * locale's home rather than a 404 — a switch that sometimes vanishes or
 * sometimes breaks reads as a broken site.
 */
export function counterpart(locale: Locale, route: string, hasCounterpart: boolean) {
  const alt = other(locale);
  return hasCounterpart ? path(alt, route) : path(alt, '/');
}
