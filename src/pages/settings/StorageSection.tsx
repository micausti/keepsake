import { useEffect, useState } from 'react';
import {
  appUsage,
  formatBytes,
  getStorageStatus,
  requestPersistentStorage,
  type AppUsage,
  type StorageStatus,
} from '../../db/storage.ts';
import { ShrinkPhotos } from './ShrinkPhotos.tsx';

export function StorageSection() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [usage, setUsage] = useState<AppUsage | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = () => {
    void getStorageStatus().then(setStatus);
    void appUsage().then(setUsage);
  };
  useEffect(refresh, []);

  const request = async () => {
    const granted = await requestPersistentStorage();
    setDenied(!granted);
    setStatus(await getStorageStatus());
  };

  return (
    <section className="card" aria-labelledby="storage-heading">
      <h2 id="storage-heading">Storage on this device</h2>
      {usage && (
        <p>
          Keepsake is using {formatBytes(usage.bytes)} ({usage.photos} {usage.photos === 1 ? 'photo' : 'photos'},{' '}
          {usage.items} {usage.items === 1 ? 'item' : 'items'}).
        </p>
      )}
      {!status ? null : !status.supported ? (
        <p className="muted">This browser doesn’t report storage details.</p>
      ) : (
        <>
          {status.quotaBytes ? (
            <p className="muted">The phone lets Keepsake use up to {formatBytes(status.quotaBytes)}.</p>
          ) : null}
          {status.persisted ? (
            <p className="success">✓ Protected: the browser won’t clear this data to free space.</p>
          ) : (
            <>
              <p className="warning">
                Not protected yet. The browser could clear the data if the phone runs low on space.
              </p>
              <button type="button" onClick={() => void request()}>
                Protect my data
              </button>
              {denied && (
                <p className="muted">
                  The browser said no for now. Add Keepsake to your Home Screen and try again from
                  there.
                </p>
              )}
            </>
          )}
        </>
      )}
      <ShrinkPhotos onChanged={refresh} />
      <p className="muted">
        Everything is stored only on this device. Keep a backup file too (see Backup above).
      </p>
    </section>
  );
}
