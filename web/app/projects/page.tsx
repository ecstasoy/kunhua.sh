import { getAllProjects, type Project } from '@/lib/projects';
import { HangingSection, HangingRow } from '@/components/HangingSection';

// Name left, stack right, one line spanning both columns — what a resume does,
// and what a reader scanning a list expects. A tech list will not fit the rail.
function Head({ project }: { project: Project }) {
  return (
    <>
      <div className="hang-head-top">
        <span className="name">{project.name}</span>
        <span className="meta">
          {project.stack}
          {(project.live || project.code) && ' · '}
          {project.live && (
            <a href={project.live} style={{ borderBottomColor: 'var(--rule)' }}>live</a>
          )}
          {project.live && project.code && ' · '}
          {project.code && (
            <a href={project.code} style={{ borderBottomColor: 'var(--rule)' }}>code</a>
          )}
        </span>
      </div>
      {/* The resume calls this 项目描述: one line before the bullets. */}
      <p className="hang-lede">{project.summary}</p>
    </>
  );
}

// Every project on one page: a hiring reader reads a page, not four.
export default function Projects() {
  const projects = getAllProjects();
  return (
    <div>
      {/* Speaks in the owner's name — written by the owner. */}
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        这里那里
      </p>

      {projects.map((project) => (
        <HangingSection key={project.slug} head={<Head project={project} />}>
          {project.introHtml && (
            <HangingRow>
              <div className="prose" dangerouslySetInnerHTML={{ __html: project.introHtml }} />
            </HangingRow>
          )}
          {project.sections.map((section) => (
            <HangingRow key={section.label} rail={<span className="rail-note">{section.label}</span>}>
              <div className="prose" dangerouslySetInnerHTML={{ __html: section.html }} />
            </HangingRow>
          ))}
        </HangingSection>
      ))}
    </div>
  );
}
