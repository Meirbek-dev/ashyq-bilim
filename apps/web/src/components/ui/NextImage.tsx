import type { ImageProps } from 'next/image';
import Image from 'next/image';

const isBrowserOnlyImage = (src: ImageProps['src']) =>
  typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:'));

export default function NextImage({ src, alt, unoptimized, ...props }: ImageProps) {
  return (
    <Image
      src={src}
      alt={alt ?? ''}
      unoptimized={unoptimized ?? isBrowserOnlyImage(src)}
      {...props}
    />
  );
}
