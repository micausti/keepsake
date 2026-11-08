import { useObjectUrl } from './useObjectUrl.ts';

export function BlobImage({ blob, alt, className }: { blob?: Blob; alt: string; className?: string }) {
  const url = useObjectUrl(blob);
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`${className ?? ''} placeholder`} />;
}
