import { Email } from '@/components/Email';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export function AboutPage() {
  return (
    <div>
      <p className="serif" style={{ fontSize: 'var(--text-lede)', lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        Across the Great Wall we can reach every corner in the world
      </p>

      <HangingSection label="Contact">
        <HangingRow rail={<span className="rail-note">email</span>}>
          <div className="mono" style={{ fontSize: 'var(--text-body)' }}>
            <Email />
          </div>
        </HangingRow>
        <HangingRow rail={<span className="rail-note">GitHub</span>}>
          <div className="mono" style={{ fontSize: 'var(--text-body)' }}>
            <a href="https://github.com/ecstasoy">github.com/ecstasoy</a>
          </div>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
