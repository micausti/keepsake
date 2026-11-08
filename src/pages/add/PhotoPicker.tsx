import { useRef, useState, type ChangeEvent } from 'react';
import { processPhoto, type ProcessedPhoto } from '../../photos/process.ts';
import { BlobImage } from '../../ui/BlobImage.tsx';

export const MAX_PHOTOS = 4;

export interface PickedPhoto extends ProcessedPhoto {
  key: string;
}

interface Props {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
}

export function PhotoPicker({ photos, onChange }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = MAX_PHOTOS - photos.length;

  const add = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, room);
    e.target.value = ''; // allow picking the same file again
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const processed = await Promise.all(files.map(processPhoto));
      onChange([...photos, ...processed.map((p) => ({ ...p, key: crypto.randomUUID() }))]);
    } catch {
      setError('That photo couldn’t be read. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-picker">
      {photos.length > 0 && (
        <ul className="photo-strip">
          {photos.map((p, i) => (
            <li key={p.key}>
              <BlobImage blob={p.thumb} alt={`Photo ${i + 1}`} className="photo-thumb" />
              <button
                type="button"
                className="photo-remove"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => onChange(photos.filter((x) => x.key !== p.key))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {busy && <p className="muted">Preparing photo…</p>}
      {error && <p className="warning">{error}</p>}
      {room > 0 && (
        <div className="button-row">
          <button type="button" onClick={() => camera.current?.click()} disabled={busy}>
            {photos.length ? 'Take another photo' : 'Take photo'}
          </button>
          <button
            type="button"
            className="secondary outline"
            onClick={() => library.current?.click()}
            disabled={busy}
          >
            Choose from library
          </button>
        </div>
      )}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void add(e)}
        data-testid="camera-input"
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void add(e)}
        data-testid="library-input"
      />
    </div>
  );
}
