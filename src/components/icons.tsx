// Inline SVG icon set: one stroke weight (1.75), one visual voice,
// currentColor throughout. No emoji is ever used as an icon.

import type { JSX } from "react";

interface IconProps {
  size?: number;
  label?: string;
}

function Svg({
  size = 20,
  label,
  children,
}: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label !== undefined ? "img" : undefined}
      aria-label={label}
      aria-hidden={label === undefined}
    >
      {children}
    </svg>
  );
}

export function PaperIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </Svg>
  );
}

export function LedgerIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Svg>
  );
}

export function StatusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

export function SealIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="10" r="6" />
      <path d="M9 15l-1.5 6L12 18l4.5 3L15 15" />
    </Svg>
  );
}

export function CloudIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M7 18a4 4 0 1 1 .6-7.96A5.5 5.5 0 0 1 18.3 12 3.5 3.5 0 0 1 17.5 18z" />
    </Svg>
  );
}

export function DeviceIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </Svg>
  );
}

export function LockIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3l10 17H2z" />
      <path d="M12 10v4M12 17.5h.01" />
    </Svg>
  );
}

export function PhotoIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-9 9" />
    </Svg>
  );
}

export function LinkIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1.5-1.5" />
    </Svg>
  );
}

export function QuestionIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7" />
      <path d="M12 17h.01" />
    </Svg>
  );
}
