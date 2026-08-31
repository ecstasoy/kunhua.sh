import { Shell } from '@/components/Shell';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import { SignIn } from '@/components/SignIn';

// Not linked from anywhere and not translated: one person uses it. Excluded
// from indexing because there is nothing here for a reader.
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Shell locale="zh" altHref="/">
      <HangingSection label="Sign in">
        <HangingRow>
          <SignIn />
        </HangingRow>
      </HangingSection>
    </Shell>
  );
}
