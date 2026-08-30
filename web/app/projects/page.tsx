import { getAllProjects, type Project } from '@/lib/projects';
import { HangingSection, HangingRow } from '@/components/HangingSection';

// Name, stack and links in the rail — the shape a resume uses, which is what a
// reader scanning a list expects. The prose beside it stays dense.
function Rail({ project }: { project: Project }) {
  return (
    <>
      <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{project.name}</div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.5, marginTop: 3 }}>
        {project.stack}
      </div>
      {(project.code || project.live) && (
        <div className="mono" style={{ fontSize: 10.5, marginTop: 5 }}>
          {project.live && (
            <a href={project.live} style={{ borderBottomColor: 'var(--rule)' }}>live</a>
          )}
          {project.live && project.code && <span style={{ color: 'var(--faint)' }}> · </span>}
          {project.code && (
            <a href={project.code} style={{ borderBottomColor: 'var(--rule)' }}>code</a>
          )}
        </div>
      )}
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
        [placeholder]
      </p>

      {projects.map((project) => (
        <HangingSection key={project.slug} label={<Rail project={project} />}>
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
