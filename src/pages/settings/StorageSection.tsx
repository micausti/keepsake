import { useEffect, useState } from 'react';
import {
  formatBytes,
  getStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from '../../db/storage.ts';

export function StorageSection() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    void getStorageStatus().then(setStatus);
  }, []);

  const request = async () => {
    const granted = await requestPersistentStorage();
    setDenied(!granted);
    setStatus(await getStorageStatus());
  };

  return (
    <section className="card" aria-labelledby="storage-heading">
      <h2 id="storage-heading">Storage on this device</h2>
      {!status ? null : !status.supported ? (
        <p className="muted">This browser doesn’t report storage details.</p>
      ) : (
        <>
          <p>
            Using {formatBytes(status.usageBytes)}
            {status.quotaBytes ? ` of ${formatBytes(status.quotaBytes)} available` : ''}.
          </p>
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
      <p className="muted">
        Everything is stored only on this device. Keep a backup file too (see Backup above).
      </p>
    </section>
  );
}
