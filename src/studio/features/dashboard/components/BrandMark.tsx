import React from 'react';

/** The S1 patch mark from brand spec §2.2, coloured by tokens so it follows the theme. */
export const BrandMark = ({ className }: { className?: string }) => (
  <svg
    data-testid="brand-mark"
    className={className}
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g className="fill-logo-ink">
      <rect x="6" y="11" width="20" height="8" rx="4" />
      <rect x="29" y="11" width="29" height="8" rx="4" />
      <rect x="6" y="28" width="14" height="8" rx="4" />
      <rect x="25" y="31" width="29" height="2" rx="1" opacity=".5" />
      <rect x="6" y="45" width="23" height="8" rx="4" />
      <rect x="32" y="45" width="12" height="8" rx="4" />
    </g>
    <g transform="rotate(-7 39 32)">
      <rect className="fill-accent-shadow" x="24.5" y="24.5" width="30" height="15" rx="4.5" />
      <rect className="fill-accent" x="23" y="23" width="30" height="15" rx="4.5" />
    </g>
  </svg>
);
