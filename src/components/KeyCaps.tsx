import { hotkeyParts } from "../hotkey/keycodeMap";
import type { StoredHotkey } from "../hotkey/captureHotkey";

// Renders a stored hotkey as separate keycaps: ⌃ ⌥ D.
export default function KeyCaps({ hotkey }: { hotkey: StoredHotkey }) {
  return (
    <span className="keys">
      {hotkeyParts(hotkey).map((part, index) => (
        <kbd className="keycap" key={`${part}-${index}`}>
          {part}
        </kbd>
      ))}
    </span>
  );
}
