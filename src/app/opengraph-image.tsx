import { ImageResponse } from 'next/og';
import { SocialImageContent } from '@/components/social';

export const runtime = 'edge';

export const alt = 'Thyme - Time Tracking for Business Central';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(<SocialImageContent />, {
    ...size,
  });
}
