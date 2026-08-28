// The OpenStream mark: an upward caret - the insertion point where
// dictated text lands - inside a listening ring. Monoline, on the same
// 24px grid and stroke weight as the icon set, so it can also be
// rasterised into the tray and app icon later.
//
// `state` only shifts the colour: "idle" (accent) is the resting look,
// "attention" (red) flags a blocking permission.
export type MarkState = "idle" | "recording" | "attention";

export default function Mark({
  state = "idle",
  className,
  tile = false,
}: {
  state?: MarkState;
  className?: string;
  tile?: boolean;
}) {
  const glyph = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.4 13.6 12 10l3.6 3.6" />
    </svg>
  );

  if (!tile) {
    return <span className={className}>{glyph}</span>;
  }

  return (
    <span className={`mark mark--${state}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {glyph}
    </span>
  );
}
