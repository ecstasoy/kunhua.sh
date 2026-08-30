import type { Metadata } from 'next';
import {
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  IBM_Plex_Mono,
  Noto_Sans_SC,
  Noto_Serif_SC,
} from 'next/font/google';
import { GitHubIcon, MailIcon } from '@/components/Icons';
import { EmailLink } from '@/components/Email';
import './globals.css';

// Downloaded and self-hosted at build time — the published pages make no
// request to a font host.
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-sans' });
const serif = IBM_Plex_Serif({ subsets: ['latin'], weight: ['400'], variable: '--font-serif' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

// CJK fallback. next/font emits unicode-range slices, so a browser pulls only
// the handful of slices a page actually uses.
const cjkSans = Noto_Sans_SC({ subsets: ['latin'], weight: ['400'], variable: '--font-cjk-sans' });
const cjkSerif = Noto_Serif_SC({ subsets: ['latin'], weight: ['400'], variable: '--font-cjk-serif' });

export const metadata: Metadata = {
  title: 'kunhua.sh',
  // description: written by the site owner, not generated. It is what a
  // stranger reads in search results and link previews.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${cjkSans.variable} ${cjkSerif.variable}`}
    >
      <body>
        <div className="shell">
          <header className="masthead">
            <span className="brand">
              <a href="/" className="mono wordmark">kunhua.sh</a>
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
              <a href="/posts/">Writing</a>
              <a href="/projects/">Projects</a>
              <a href="/about/">About</a>
            </nav>
          </header>
          {children}
          <footer className="colophon mono">© 2026 Kunhua Huang</footer>
        </div>
      </body>
    </html>
  );
}
