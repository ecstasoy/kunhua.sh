import { GitHubIcon, MailIcon } from '@/components/Icons';
import { EmailLink } from '@/components/Email';
import { ThemeToggle } from '@/components/ThemeToggle';
import { href, other, switchLabel, type Locale } from '@/lib/locale';

/**
 * Masthead, footer, and the language switch. The interface itself is the same
 * English in both locales — only the content changes — so nothing here is
 * translated; what varies is where the links point.
 */
export function Shell({
  locale,
  altHref,
  children,
}: {
  locale: Locale;
  /** The other language's version of this page. Falls back to that locale's
   *  home when no counterpart exists, so the switch is never a dead link. */
  altHref: string;
  children: React.ReactNode;
}) {
  const alt = other(locale);
  return (
    <div className="shell">
      <header className="masthead">
        <span className="brand">
          <a href={href(locale, '/')} className="mono wordmark">kunhua.sh</a>
          <span className="brand-icons">
            <a href="https://github.com/ecstasoy" aria-label="GitHub">
              <GitHubIcon />
            </a>
            <EmailLink>
              <MailIcon />
            </EmailLink>
          </span>
        </span>
        <nav>
          <a href={href(locale, '/posts/')}>Writing</a>
          <a href={href(locale, '/projects/')}>Projects</a>
          <a href={href(locale, '/about/')}>About</a>
          <a href={altHref} className="locale-switch">{switchLabel[alt]}</a>
          <ThemeToggle />
        </nav>
      </header>
      {children}
      <footer className="colophon mono">© 2026 Kunhua Huang</footer>
    </div>
  );
}
