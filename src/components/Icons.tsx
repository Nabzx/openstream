// Small stroke icons on a 24px grid, one consistent style, so they scale
// and take `currentColor`. Ported from prototypes/desktop-ui-211.

import type { ReactNode } from "react";

type IconProps = { className?: string };

function svg(path: ReactNode, strokeWidth = 1.8) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const HomeIcon = svg(
  <>
    <path d="M4 11.5 12 5l8 6.5" />
    <path d="M6 10v9h12v-9" />
  </>,
);

export const SettingsIcon = svg(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v3M12 18v3M4.2 7l2.1 1.2M17.7 15.8l2.1 1.2M4.2 17l2.1-1.2M17.7 8.2l2.1-1.2" />
  </>,
);

export const KeyboardIcon = svg(
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </>,
);

export const ShieldIcon = svg(<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />);

export const InputMonitorIcon = svg(
  <>
    <rect x="3" y="7" width="18" height="10" rx="2" />
    <path d="M7 11h.01M11 11h.01M15 11h.01" />
  </>,
);

export const MicIcon = svg(
  <>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
  </>,
);

export const WaveformIcon = svg(<path d="M4 12h4l2-5 4 10 2-5h4" />);

export const ClockIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);

export const CheckIcon = svg(<path d="M5 13l4 4L19 7" />, 3);

export const ChevronDownIcon = svg(<path d="M6 9l6 6 6-6" />, 2.5);
