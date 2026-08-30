import { getAllPosts } from '@/lib/posts';
import { getAllProjects } from '@/lib/projects';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import { Untranslated } from '@/components/Untranslated';
import { DEFAULT_LOCALE, href, type Locale } from '@/lib/locale';

export function Home({ locale }: { locale: Locale }) {
  const posts = getAllPosts(locale).slice(0, 3);
  const projects = getAllProjects(locale).slice(0, 3);

  return (
    <div>
      {/* The opening lines speak in the owner's name and are shared by both
          locales, so they are not translated. */}
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
        Kunhua Huang
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.72, color: 'var(--soft)', maxWidth: '48ch', margin: '4px 0 6px' }}>
        MSCS @Northeastern University
      </p>

      <HangingSection label="Writing">
        {posts.map((p) => (
          <HangingRow key={p.slug} rail={<time className="date" dateTime={p.published}>{p.publishedDate}</time>}>
            <div className="item-title">
              {/* An untranslated entry links straight to the source: no
                  English page is generated for it. */}
              <a href={href(p.translated ? locale : DEFAULT_LOCALE, `/posts/${p.slug}/`)}>
                {p.title}
              </a>
            </div>
            <p className="item-excerpt">{p.excerpt}</p>
            {!p.translated && <Untranslated slug={p.slug} kind="posts" />}
          </HangingRow>
        ))}
        <HangingRow>
          <a href={href(locale, '/posts/')} style={{ fontSize: 12.5, color: 'var(--faint)', borderBottomColor: 'var(--rule)' }}>
            All posts →
          </a>
        </HangingRow>
      </HangingSection>

      <HangingSection label="Open source">
        <HangingRow>
          {/* Shared by both locales, so it says what RIME is rather than what
              was contributed — the link lands on the merged PRs themselves. */}
          <div className="item-title">
            <a href="https://github.com/pulls?q=is%3Apr+author%3Aecstasoy+is%3Amerged+org%3Arime">
              RIME
            </a>
            <span style={{ color: 'var(--soft)', fontWeight: 400 }}>
              : an open-source input method engine
            </span>
          </div>
        </HangingRow>
      </HangingSection>

      <HangingSection label="Projects">
        {projects.map((project) => (
          <HangingRow key={project.slug}>
            <div className="item-title">
              <a href={href(locale, '/projects/')}>{project.name}</a>
            </div>
            <p className="item-excerpt">{project.summary}</p>
          </HangingRow>
        ))}
        <HangingRow>
          <a href={href(locale, '/projects/')} style={{ fontSize: 12.5, color: 'var(--faint)', borderBottomColor: 'var(--rule)' }}>
            All projects →
          </a>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
