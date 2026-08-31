import { getPost } from '@/lib/posts';
import { Untranslated } from '@/components/Untranslated';
import type { Locale } from '@/lib/locale';

export function PostPage({ slug, locale }: { slug: string; locale: Locale }) {
  const post = getPost(slug, locale);
  return (
    <article>
      <h1 className="serif" style={{ fontSize: 'var(--text-h1)', fontWeight: 400, margin: '0 0 6px' }}>
        {post.title}
      </h1>
      <div className="date" style={{ marginBottom: post.translated ? 26 : 8 }}>
        <time dateTime={post.published}>{post.publishedFull}</time>
        {post.updated && (
          <>
            {' · revised '}
            <time dateTime={post.updated}>{post.updatedFull}</time>
          </>
        )}
      </div>
      {!post.translated && (
        <div style={{ marginBottom: 26 }}>
          <Untranslated slug={post.slug} kind="posts" />
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}
