export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh';

/** Chinese sits at the root so already-published URLs keep working. */
export const prefix = (locale: Locale) => (locale === DEFAULT_LOCALE ? '' : `/${locale}`);

/** A path within a locale: path('en', '/posts/') → '/en/posts/'.
 *  Not called href: it is a path, and href={path(...)} reads badly. */
export const path = (locale: Locale, p: string) => `${prefix(locale)}${p}`;

export const other = (locale: Locale): Locale => (locale === 'zh' ? 'en' : 'zh');

/** What the switch says: the language it takes you to, not the one you are in. */
export const switchLabel: Record<Locale, string> = { zh: '中文', en: 'EN' };

export const htmlLang: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };

/** For hreflang, which wants a language subtag rather than a locale code. */
export const hrefLang: Record<Locale, string> = { zh: 'zh-Hans', en: 'en' };

export const SITE = 'https://kunhua.sh';
