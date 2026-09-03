import { Email } from '@/components/Email';
import { HangingSection, HangingRow } from '@/components/HangingSection';
import { site } from '@/lib/site';
import { type Locale } from '@/lib/locale';

export function AboutPage({ locale }: { locale: Locale }) {
  return (
    <div>
      {/* Absent when the page wants no opening line. whiteSpace keeps any
          newlines the author wrote while still wrapping to the measure. */}
      {site(locale).openers.about && (
        <p
          className="serif"
          style={{
            fontSize: 'var(--text-lede)',
            lineHeight: 1.72,
            maxWidth: '48ch',
            margin: '0 0 6px',
            whiteSpace: 'pre-line',
          }}
        >
          {site(locale).openers.about}
        </p>
      )}

      <HangingSection label="Contact">
        <HangingRow rail={<span className="rail-note">email</span>}>
          <div className="mono" style={{ fontSize: 'var(--text-body)' }}>
            <Email />
          </div>
        </HangingRow>
        {site(locale).github && (
          <HangingRow rail={<span className="rail-note">GitHub</span>}>
            <div className="mono" style={{ fontSize: 'var(--text-body)' }}>
              <a href={site(locale).github!}>
                {site(locale).github!.replace(/^https?:\/\//, '')}
              </a>
            </div>
          </HangingRow>
        )}
      </HangingSection>
    </div>
  );
}
