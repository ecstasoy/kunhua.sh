import { DEFAULT_LOCALE, path } from '@/lib/locale';

/**
 * Shown under an entry that has no version in the language being read.
 * Knowing a piece exists and cannot be read beats not knowing it exists,
 * so the entry stays listed rather than being hidden.
 */
export function Untranslated({ slug, kind }: { slug: string; kind: 'posts' | 'projects' }) {
  const target = kind === 'posts' ? `/posts/${slug}/` : '/projects/';
  return (
    <p className="untranslated">
      Chinese only —{' '}
      <a href={path(DEFAULT_LOCALE, target)}>read it in Chinese</a>
    </p>
  );
}
