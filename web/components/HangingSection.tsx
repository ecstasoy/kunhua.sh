/**
 * The hanging rail: a narrow left column carrying section names and dates,
 * with content to its right. Ordinary pages stack a heading above its content;
 * this puts the label outside the content block, the way a magazine index or a
 * marginal note does. It is the site's one distinguishing structure, so it
 * lives here and no page reimplements the grid.
 */
export function HangingSection({
  label,
  head,
  children,
}: {
  label?: React.ReactNode;
  /** Spans both columns. For a heading too wide for an 88px rail. */
  head?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="hang">
      {head ? (
        <div className="hang-head">{head}</div>
      ) : (
        <>
          {/* The label takes a row of its own. Letting it share the first row
              would push every date one row down from the item it belongs to. */}
          <div className="rail">{label}</div>
          <div />
        </>
      )}
      {children}
    </section>
  );
}

export function HangingRow({
  rail,
  children,
}: {
  rail?: React.ReactNode;
  children: React.ReactNode;
}) {
  // A Fragment, not a wrapper element: these two cells must be direct children
  // of the grid. Wrapped in a div they would become one grid item and stop
  // aligning to the columns, collapsing the rail.
  return (
    <>
      <div className="rail">{rail}</div>
      <div>{children}</div>
    </>
  );
}
