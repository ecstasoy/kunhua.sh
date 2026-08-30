import { getAllPosts } from '@/lib/posts';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export default function PostsIndex() {
  const posts = getAllPosts();
  return (
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
  );
}
