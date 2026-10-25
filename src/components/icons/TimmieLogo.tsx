interface TimmieLogoProps {
  className?: string;
}

export function TimmieLogo({ className = 'h-5 w-5' }: TimmieLogoProps) {
  return (
    <svg
      viewBox="2 2 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* A smiling stopwatch */}
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="16" cy="18" r="10" />
        <path d="M16 8V5.5M13.5 4.5h5" />
        <path d="M11.8 20.6Q16 24.6 20.2 20.6" strokeWidth="2.4" />
      </g>
      <circle cx="12.6" cy="16.2" r="1.7" fill="currentColor" />
      <circle cx="19.4" cy="16.2" r="1.7" fill="currentColor" />
    </svg>
  );
}
