import { HangingSection, HangingRow } from '@/components/HangingSection';

// Project write-ups speak in the owner's name and are not generated. The
// structure below is the point: what was hard and what would change carry the
// signal, and only the owner can supply them.
export default function Projects() {
  return (
    <div>
      <p className="serif" style={{ fontSize: 17, lineHeight: 1.72, maxWidth: '48ch', margin: '0 0 6px' }}>
        [placeholder]
      </p>

      <HangingSection label="dash">
        <HangingRow>
          <p className="item-excerpt">[What it is]</p>
        </HangingRow>
        <HangingRow rail={<span className="rail-note">Bullet point</span>}>
          <p className="item-excerpt">[placeholder]</p>
        </HangingRow>
        <HangingRow rail={<span className="rail-note">To be done</span>}>
          <p className="item-excerpt">[placeholder]</p>
        </HangingRow>
      </HangingSection>
    </div>
  );
}
