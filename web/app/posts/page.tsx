import { getAllPosts } from '@/lib/posts';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export default function PostsIndex() {
  const posts = getAllPosts();
  return (
    <div>
      {/* Speaks in the owner's name — written by the owner. */}
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        你的我的
      </p>

      <HangingSection label="Writing">
      {posts.map((p) => (
        <HangingRow key={p.slug} rail={<time className="date" dateTime={p.published}>{p.publishedDate}</time>}>
          <div className="item-title">
            <a href={`/posts/${p.slug}/`}>{p.title}</a>
          </div>
          <p className="item-excerpt">{p.excerpt}</p>
        </HangingRow>
      ))}
      </HangingSection>
    </div>
  );
}
