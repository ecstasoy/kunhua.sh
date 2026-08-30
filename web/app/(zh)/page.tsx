import { Shell } from '@/components/Shell';
import { Home } from '@/components/pages/Home';
import { alternates } from '@/lib/meta';

export const metadata = alternates('zh', '/');

export default function Page() {
  return (
    <Shell locale="zh" altHref="/en/">
      <Home locale="zh" />
    </Shell>
  );
}
