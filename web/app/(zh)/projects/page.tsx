import { Shell } from '@/components/Shell';
import { ProjectsPage } from '@/components/pages/ProjectsPage';
import { alternates } from '@/lib/meta';

export const metadata = alternates('zh', '/projects/');

export default function Page() {
  return (
    <Shell locale="zh" altHref="/en/projects/">
      <ProjectsPage locale="zh" />
    </Shell>
  );
}
