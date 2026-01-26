interface BitcoinLightningLogoProps {
  className?: string;
}

export function BitcoinLightningLogo({ className = 'h-8 w-8' }: BitcoinLightningLogoProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Bitcoin circle background */}
      <circle cx="32" cy="32" r="30" fill="#F7931A" />
      <circle cx="32" cy="32" r="26" fill="#F7931A" stroke="#FFF" strokeWidth="2" />

      {/* Bitcoin B symbol */}
      <path
        d="M41.5 27.5c0.8-3.2-2-4.9-5.3-6.1l1.1-4.4-2.7-0.7-1.1 4.3c-0.7-0.2-1.4-0.3-2.2-0.5l1.1-4.3-2.7-0.7-1.1 4.4c-0.6-0.1-1.2-0.3-1.7-0.4l0-0-3.7-0.9-0.7 2.9s2 0.5 2 0.5c1.1 0.3 1.3 1 1.3 1.6l-1.3 5.2c0.1 0 0.2 0 0.3 0.1l-0.3-0.1-1.8 7.3c-0.1 0.4-0.5 0.9-1.3 0.7 0 0-2-0.5-2-0.5l-1.4 3.1 3.5 0.9c0.7 0.2 1.3 0.3 1.9 0.5l-1.1 4.5 2.7 0.7 1.1-4.4c0.7 0.2 1.5 0.4 2.2 0.5l-1.1 4.4 2.7 0.7 1.1-4.5c4.6 0.9 8.1 0.5 9.5-3.6 1.2-3.3-0.1-5.2-2.4-6.5 1.7-0.4 3-1.5 3.4-3.9zm-6.1 8.5c-0.8 3.3-6.5 1.5-8.3 1.1l1.5-6c1.8 0.5 7.7 1.4 6.8 4.9zm0.9-8.6c-0.8 3-5.4 1.5-6.9 1.1l1.3-5.4c1.5 0.4 6.4 1.1 5.6 4.3z"
        fill="#FFF"
      />

      {/* Lightning bolt overlay */}
      <path
        d="M38 20L26 36h8l-4 12 14-18h-8l2-10z"
        fill="#FFE135"
        stroke="#FFF"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
