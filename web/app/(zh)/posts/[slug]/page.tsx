import { Shell } from '@/components/Shell';
import { PostPage } from '@/components/pages/PostPage';
import { slugsIn, getAllPosts } from '@/lib/posts';
import { alternates, counterpart } from '@/lib/meta';

export function generateStaticParams() {
  return slugsIn('zh').map((slug) => ({ slug }));
}

/** Does the page this one switches to exist? Chinese is the source, so it
 *  always does; the English one exists only where a translation does. */
function counterpartExists(slug: string) {
  return getAllPosts('en').find((p) => p.slug === slug)?.translated ?? false;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return alternates('zh', `/posts/${slug}/`, counterpartExists(slug));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Shell locale="zh" altHref={counterpart('zh', `/posts/${slug}/`, counterpartExists(slug))}>
      <PostPage slug={slug} locale="zh" />
    </Shell>
  );
}
