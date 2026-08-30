import { Shell } from '@/components/Shell';
import { PostsIndex } from '@/components/pages/PostsIndex';
import { alternates } from '@/lib/meta';

export const metadata = alternates('zh', '/posts/');

export default function Page() {
  return (
    <Shell locale="zh" altHref="/en/posts/">
      <PostsIndex locale="zh" />
    </Shell>
  );
}
