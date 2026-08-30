import type { Metadata } from 'next';
import {
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  IBM_Plex_Mono,
  Noto_Sans_SC,
  Noto_Serif_SC,
} from 'next/font/google';
import { htmlLang, type Locale } from '@/lib/locale';

// Downloaded and self-hosted at build time — the published pages make no
// request to a font host.
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-sans' });
const serif = IBM_Plex_Serif({ subsets: ['latin'], weight: ['400'], variable: '--font-serif' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

// CJK fallback. next/font emits unicode-range slices, so a browser pulls only
// the handful of slices a page actually uses.
const cjkSans = Noto_Sans_SC({ subsets: ['latin'], weight: ['400'], variable: '--font-cjk-sans' });
const cjkSerif = Noto_Serif_SC({ subsets: ['latin'], weight: ['400'], variable: '--font-cjk-serif' });

export const metadata: Metadata = { title: 'kunhua.sh' };

/**
 * Only a root layout may render <html>, and its lang has to differ per
 * language, so the two locales live in route groups with a root layout each.
 * This holds the part they share.
 */
export function RootHtml({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html
      lang={htmlLang[locale]}
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${cjkSans.variable} ${cjkSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
