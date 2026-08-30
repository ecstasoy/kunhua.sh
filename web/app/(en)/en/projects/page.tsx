import { Shell } from '@/components/Shell';
import { ProjectsPage } from '@/components/pages/ProjectsPage';
import { alternates } from '@/lib/meta';

export const metadata = alternates('en', '/projects/');

export default function Page() {
  return (
    <Shell locale="en" altHref="/projects/">
      <ProjectsPage locale="en" />
    </Shell>
  );
}
