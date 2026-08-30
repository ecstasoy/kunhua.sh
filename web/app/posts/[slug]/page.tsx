import { getAllPosts, getPost } from '@/lib/posts';

// Static export cannot discover dynamic routes on its own — without this the
// build emits nothing for /posts/<slug>/.
export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return (
    <article>
      <h1 className="serif" style={{ fontSize: 21, fontWeight: 400, margin: '0 0 6px' }}>
        {post.title}
      </h1>
      <div className="date" style={{ marginBottom: 26 }}>
        <time dateTime={post.published}>{post.publishedFull}</time>
        {post.updated && (
          <>
            {' · revised '}
            <time dateTime={post.updated}>{post.updatedFull}</time>
          </>
        )}
      </div>
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}
