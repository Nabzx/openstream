// The OpenStream mark: a stream through a listening ring, a play on the
// name. This UI/tray size carries a single wave (scripts/build-icons.sh
// matches it); the app icon (assets/icon.svg) has room for the full
// two-line stream. Monoline, on the same 24px grid as the icon set.
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
      <path strokeWidth={2} d="M6 12q3 -5.2 6 0t6 0" />
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
