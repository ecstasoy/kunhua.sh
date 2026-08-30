import { Shell } from '@/components/Shell';
import { PostPage } from '@/components/pages/PostPage';
import { slugsIn, getAllPosts } from '@/lib/posts';
import { alternates, counterpart } from '@/lib/meta';

export function generateStaticParams() {
  return slugsIn('en').map((slug) => ({ slug }));
}

/** Does the page this one switches to exist? Chinese is the source, so it
 *  always does; the English one exists only where a translation does. */
function counterpartExists(slug: string) {
  return true;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return alternates('en', `/posts/${slug}/`, counterpartExists(slug));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Shell locale="en" altHref={counterpart('en', `/posts/${slug}/`, counterpartExists(slug))}>
      <PostPage slug={slug} locale="en" />
    </Shell>
  );
}
