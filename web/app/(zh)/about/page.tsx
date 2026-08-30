import { Shell } from '@/components/Shell';
import { AboutPage } from '@/components/pages/AboutPage';
import { alternates } from '@/lib/meta';

export const metadata = alternates('zh', '/about/');

export default function Page() {
  return (
    <Shell locale="zh" altHref="/en/about/">
      <AboutPage />
    </Shell>
  );
}
