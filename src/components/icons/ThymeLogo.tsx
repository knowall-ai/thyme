interface ThymeLogoProps {
  className?: string;
}

export function ThymeLogo({ className = 'h-5 w-5' }: ThymeLogoProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Thyme sprig - angled 45 degrees */}
      <g transform="rotate(-45 16 16)">
        <path
          d="M16 28 Q14 20 16 11 Q17 6 20 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="13" cy="23" r="2.8" fill="currentColor" />
        <circle cx="19" cy="20" r="2.3" fill="currentColor" />
        <circle cx="13" cy="16" r="2.3" fill="currentColor" />
        <circle cx="18" cy="12" r="2" fill="currentColor" />
        <circle cx="14" cy="8" r="1.7" fill="currentColor" />
        <circle cx="19" cy="5" r="1.4" fill="currentColor" />
      </g>
    </svg>
  );
}
