import { Shell } from '@/components/Shell';
import { PostsIndex } from '@/components/pages/PostsIndex';
import { alternates } from '@/lib/meta';

export const metadata = alternates('en', '/posts/');

export default function Page() {
  return (
    <Shell locale="en" altHref="/posts/">
      <PostsIndex locale="en" />
    </Shell>
  );
}
