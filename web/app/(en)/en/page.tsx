import { Shell } from '@/components/Shell';
import { Home } from '@/components/pages/Home';
import { alternates } from '@/lib/meta';

export const metadata = alternates('en', '/');

export default function Page() {
  return (
    <Shell locale="en" altHref="/">
      <Home locale="en" />
    </Shell>
  );
}
