export type Theme = 'light' | 'dark';
export const THEME_KEY = 'kunhua-theme';

/**
 * The same logic the inline script runs, for use after hydration.
 * Order: an explicit choice, then the system preference, then light.
 */
export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Private windows throw on localStorage; fall through to the system.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
