interface ThymeLogoProps {
  className?: string;
}

export function ThymeLogo({ className = 'h-5 w-5' }: ThymeLogoProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Thyme sprig logo - stylized herb leaf design */}
      {/* Central stem */}
      <path
        d="M16 28C16 28 16 8 16 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Leaf pairs - bottom to top */}
      {/* Bottom pair */}
      <ellipse
        cx="10"
        cy="22"
        rx="4.5"
        ry="2.8"
        fill="currentColor"
        transform="rotate(-35 10 22)"
      />
      <ellipse cx="22" cy="22" rx="4.5" ry="2.8" fill="currentColor" transform="rotate(35 22 22)" />

      {/* Second pair */}
      <ellipse cx="11" cy="16" rx="4" ry="2.2" fill="currentColor" transform="rotate(-40 11 16)" />
      <ellipse cx="21" cy="16" rx="4" ry="2.2" fill="currentColor" transform="rotate(40 21 16)" />

      {/* Third pair */}
      <ellipse
        cx="12.5"
        cy="11"
        rx="3.2"
        ry="1.8"
        fill="currentColor"
        transform="rotate(-45 12.5 11)"
      />
      <ellipse
        cx="19.5"
        cy="11"
        rx="3.2"
        ry="1.8"
        fill="currentColor"
        transform="rotate(45 19.5 11)"
      />

      {/* Top pair */}
      <ellipse cx="14" cy="7" rx="2.5" ry="1.4" fill="currentColor" transform="rotate(-50 14 7)" />
      <ellipse cx="18" cy="7" rx="2.5" ry="1.4" fill="currentColor" transform="rotate(50 18 7)" />

      {/* Tip leaf */}
      <ellipse cx="16" cy="4.5" rx="2" ry="1.2" fill="currentColor" />
    </svg>
  );
}
