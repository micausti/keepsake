import { useRef, useState, type ChangeEvent } from 'react';
import { BackupControls } from '../../backup/BackupControls.tsx';
import { BackupError, daysSinceBackup, openBackup } from '../../backup/backup.ts';
import { formatDate } from '../../domain/dates.ts';

function lastBackupText(lastBackupAt?: string): string {
  const days = daysSinceBackup(lastBackupAt);
  if (days === null || !lastBackupAt) return 'No backup yet.';
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `Last backup: ${when} (${formatDate(lastBackupAt)}).`;
}

export function BackupSection({ lastBackupAt }: { lastBackupAt?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    setRestoring(true);
    try {
      const backup = await openBackup(file);
      const { summary } = backup;
      const ok = window.confirm(
        `Restore the backup from ${formatDate(summary.exportedAt)}?\n\n` +
          `It has ${summary.children} children, ${summary.items} items and ${summary.photos} photos, and ` +
          `will REPLACE everything currently in Keepsake on this phone. Your API key stays as it is.`,
      );
      if (!ok) return;
      await backup.restore();
      setMessage({ kind: 'success', text: `✓ Restored ${summary.items} items from ${formatDate(summary.exportedAt)}.` });
    } catch (error) {
      setMessage({
        kind: 'warning',
        text: error instanceof BackupError ? error.message : 'Couldn’t restore that file.',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section className="card" aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup</h2>
      <p className="muted">
        Everything lives only on this phone, so keep a backup file somewhere else. It includes all items, photos and
        history, but not your API key.
      </p>
      <p>{lastBackupText(lastBackupAt)}</p>
      <BackupControls />
      <div className="stack">
        <button
          type="button"
          className="secondary outline"
          disabled={restoring}
          onClick={() => input.current?.click()}
        >
          {restoring ? 'Restoring…' : 'Restore from a backup file'}
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => void restore(e)}
          data-testid="restore-input"
        />
        {message && (
          <p className={message.kind} role="alert">
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
