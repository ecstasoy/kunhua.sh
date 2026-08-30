import { Email } from '@/components/Email';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export function AboutPage() {
  return (
    <div>
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        Across the Great Wall we can reach every corner in the world
      </p>

      <HangingSection label="Contact">
        <HangingRow rail={<span className="rail-note">email</span>}>
          <div className="mono" style={{ fontSize: 12.5 }}>
            <Email />
          </div>
        </HangingRow>
        <HangingRow rail={<span className="rail-note">GitHub</span>}>
          <div className="mono" style={{ fontSize: 12.5 }}>
            <a href="https://github.com/ecstasoy">github.com/ecstasoy</a>
          </div>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
