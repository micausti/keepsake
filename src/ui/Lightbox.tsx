import { useEffect } from 'react';
import { BlobImage } from './BlobImage.tsx';

/** Full-screen photo viewer. Tap anywhere, the Close button or Escape to close. */
export function Lightbox({
  blob,
  alt,
  caption,
  onClose,
}: {
  blob: Blob;
  alt: string;
  caption?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <BlobImage blob={blob} alt={alt} className="lightbox-image" />
      {caption && <p className="lightbox-caption">{caption}</p>}
      <button type="button" className="lightbox-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
