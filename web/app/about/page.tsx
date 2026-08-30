import { Email } from '@/components/Email';
import { HangingSection, HangingRow } from '@/components/HangingSection';

export default function About() {
  return (
    <div>
      {/* Speaks in the owner's name — written by the owner. */}
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        [placeholder]
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
