import { getAllPosts } from '@/lib/posts';
import { getAllProjects } from '@/lib/projects';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import { Untranslated } from '@/components/Untranslated';
import { NowPlaying } from '@/components/NowPlaying';
import { DEFAULT_LOCALE, path, type Locale } from '@/lib/locale';

export function Home({ locale }: { locale: Locale }) {
  const posts = getAllPosts(locale).slice(0, 3);
  const projects = getAllProjects(locale).slice(0, 3);

  return (
    <div>
      {/* The opening lines speak in the owner's name and are shared by both
          locales, so they are not translated. */}
      <p className="serif" style={{ fontSize: 'var(--text-lede)', lineHeight: 1.5, margin: 0 }}>
        Kunhua Huang
      </p>
      <p style={{ fontSize: 'var(--text-body)', lineHeight: 1.72, color: 'var(--soft)', maxWidth: '48ch', margin: '4px 0 6px' }}>
        MSCS @Northeastern University
      </p>

      <HangingSection label="Writing">
        {posts.map((p) => (
          <HangingRow key={p.slug} rail={<time className="date" dateTime={p.published}>{p.publishedDate}</time>}>
            <div className="item-title">
              {/* An untranslated entry links straight to the source: no
                  English page is generated for it. */}
              <a href={path(p.translated ? locale : DEFAULT_LOCALE, `/posts/${p.slug}/`)}>
                {p.title}
              </a>
            </div>
            <p className="item-excerpt">{p.excerpt}</p>
            {!p.translated && <Untranslated slug={p.slug} kind="posts" />}
          </HangingRow>
        ))}
        <HangingRow>
          <a href={path(locale, '/posts/')} style={{ fontSize: 'var(--text-body)', color: 'var(--faint)', borderBottomColor: 'var(--rule)' }}>
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
              {/* Lands on the project rather than the top of the page. */}
              <a href={path(locale, `/projects/#${project.slug}`)}>{project.name}</a>
            </div>
            <p className="item-excerpt">{project.summary}</p>
          </HangingRow>
        ))}
        <HangingRow>
          <a href={path(locale, '/projects/')} style={{ fontSize: 'var(--text-body)', color: 'var(--faint)', borderBottomColor: 'var(--rule)' }}>
            All projects →
          </a>
        </HangingRow>
      </HangingSection>

      <NowPlaying />
    </div>
  );
}
