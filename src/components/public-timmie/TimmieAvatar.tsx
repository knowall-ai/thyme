import Image from 'next/image';
import type { Persona } from './persona';

/** The persona's avatar in a circle: the small file up to 64px, the large one above that. */
export function AgentAvatar({
  persona,
  size = 40,
  className = '',
}: {
  persona: Persona;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={size > 64 ? persona.avatar.large : persona.avatar.small}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full ${className}`}
      unoptimized
    />
  );
}
