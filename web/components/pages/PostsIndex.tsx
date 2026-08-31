import { getAllPosts } from '@/lib/posts';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import { Untranslated } from '@/components/Untranslated';
import { DEFAULT_LOCALE, path, type Locale } from '@/lib/locale';

export function PostsIndex({ locale }: { locale: Locale }) {
  const posts = getAllPosts(locale);
  return (
    <div>
      <p className="serif" style={{ fontSize: 'var(--text-lede)', lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        你的我的
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
      </HangingSection>
    </div>
  );
}
