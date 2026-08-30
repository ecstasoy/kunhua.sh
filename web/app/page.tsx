import { getAllPosts } from '@/lib/posts';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export default function Home() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <div>
      {/* The opening statement speaks in the owner's name, so it is written by
          the owner and not generated. */}
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        [placeholder]
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
        <HangingRow>
          <a href="/posts/" style={{ fontSize: 12.5, color: 'var(--faint)', borderBottomColor: 'var(--rule)' }}>
            All posts →
          </a>
        </HangingRow>
      </HangingSection>

      <HangingSection label="Projects">
        <HangingRow>
          <div className="item-title">
            <a href="/projects/">dash</a>
          </div>
          {/* Project descriptions speak in the owner's name too. */}
          <p className="item-excerpt">[placeholder]</p>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
