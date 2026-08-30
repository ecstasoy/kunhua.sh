import { getAllPosts } from '@/lib/posts';
import { getAllProjects } from '@/lib/projects';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export default function Home() {
  const posts = getAllPosts().slice(0, 3);
  const projects = getAllProjects().slice(0, 2);

  return (
    <div>
      {/* The opening statement speaks in the owner's name, so it is written by
          the owner and not generated. */}
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
        {projects.map((project) => (
          <HangingRow key={project.slug}>
            <div className="item-title">
              <a href="/projects/">{project.name}</a>
            </div>
            {/* Same file the projects page reads, so the summary lives once. */}
            <p className="item-excerpt">{project.summary}</p>
          </HangingRow>
        ))}
        <HangingRow>
          <a href="/projects/" style={{ fontSize: 12.5, color: 'var(--faint)', borderBottomColor: 'var(--rule)' }}>
            All projects →
          </a>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
