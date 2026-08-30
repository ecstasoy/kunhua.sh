import { getAllProjects } from '@/lib/projects';
import { HangingSection, HangingRow } from '@/components/HangingSection';

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
        <HangingSection key={project.slug} label={project.name}>
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
