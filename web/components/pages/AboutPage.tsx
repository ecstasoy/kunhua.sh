import { Email } from '@/components/Email';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import { site } from '@/lib/site';

export function AboutPage() {
  return (
    <div>
      <p className="serif" style={{ fontSize: 'var(--text-lede)', lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        {site().openers.about}
      </p>

      <HangingSection label="Contact">
        <HangingRow rail={<span className="rail-note">email</span>}>
          <div className="mono" style={{ fontSize: 'var(--text-body)' }}>
            <Email />
          </div>
        </HangingRow>
        <HangingRow rail={<span className="rail-note">GitHub</span>}>
          <div className="mono" style={{ fontSize: 'var(--text-body)' }}>
            <a href={site().github}>{site().github.replace(/^https?:\/\//, '')}</a>
          </div>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
