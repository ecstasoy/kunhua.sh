import { THEME_KEY } from '@/lib/theme';

/**
 * Runs synchronously in <head>, before React hydrates, so the first paint is
 * already the right theme. Without this the page paints light and then flips,
 * which is more jarring than having no dark mode at all.
 *
 * It cannot import anything — only globals are available at this point — so
 * the resolution order here is duplicated from lib/theme.ts on purpose.
 */
export function ThemeScript() {
  const code =
    `(function(){var t;try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
    `if(s==="dark"||s==="light")t=s;}catch(e){}` +
    `if(!t){try{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e){t="light";}}` +
    `document.documentElement.setAttribute("data-theme",t);})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
