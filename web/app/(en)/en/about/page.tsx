import { Shell } from '@/components/Shell';
import { AboutPage } from '@/components/pages/AboutPage';
import { alternates } from '@/lib/meta';

export const metadata = alternates('en', '/about/');

export default function Page() {
  return (
    <Shell locale="en" altHref="/about/">
      <AboutPage />
    </Shell>
  );
}
