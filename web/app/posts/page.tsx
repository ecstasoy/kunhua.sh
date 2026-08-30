import { getAllPosts } from '@/lib/posts';
import { HangingSection } from '@/components/HangingSection';

export default function PostsIndex() {
    const posts = getAllPosts();
    return (
        <HangingSection label="Writing">
            {posts.map((p) => (
                <div key={p.slug} style={{ marginBottom: 18 }}>
                    <div className="item-title">
                        <a href={`/posts/${p.slug}/`}>{p.title}</a>
                    </div>
                    <p className="item-excerpt">{p.excerpt}</p>
                    <span className="date">{p.date}</span>
                </div>
            ))}
        </HangingSection>
    );
}

