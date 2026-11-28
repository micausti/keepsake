import { useState } from 'react';
import { saveFile } from '../ui/share.ts';
import { exportBackup, markBackedUp, type BackupSummary } from './backup.ts';

const sizeText = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type State =
  | { name: 'idle' }
  | { name: 'preparing'; done: number; total: number }
  | { name: 'ready'; file: File; summary: BackupSummary }
  | { name: 'done'; how: 'shared' | 'downloaded' }
  | { name: 'error'; message: string };

/**
 * Two taps on purpose: iOS only opens the share sheet straight after a tap,
 * and building a large backup can take longer than that allows.
 */
export function BackupControls({ onDone }: { onDone?: () => void }) {
  const [state, setState] = useState<State>({ name: 'idle' });

  const prepare = async () => {
    setState({ name: 'preparing', done: 0, total: 0 });
    try {
      const { file, summary } = await exportBackup(__APP_VERSION__, undefined, (done, total) =>
        setState({ name: 'preparing', done, total }),
      );
      setState({ name: 'ready', file, summary });
    } catch {
      setState({ name: 'error', message: 'Couldn’t make the backup. Please try again.' });
    }
  };

  const save = async (file: File, summary: BackupSummary) => {
    try {
      const result = await saveFile(file);
      if (result === 'cancelled') return; // share sheet closed: the Save button stays
      await markBackedUp(summary.exportedAt);
      setState({ name: 'done', how: result });
      onDone?.();
    } catch {
      setState({ name: 'error', message: 'Couldn’t save the file. Please try again.' });
    }
  };

  switch (state.name) {
    case 'idle':
    case 'error':
      return (
        <div className="stack backup-controls">
          <button type="button" onClick={() => void prepare()}>
            Prepare backup
          </button>
          {state.name === 'error' && (
            <p className="warning" role="alert">
              {state.message}
            </p>
          )}
        </div>
      );
    case 'preparing':
      return (
        <p className="muted" role="status">
          Preparing backup…{state.total > 0 ? ` ${state.done} of ${state.total} photos` : ''}
        </p>
      );
    case 'ready':
      return (
        <div className="stack backup-controls">
          <p role="status">
            Ready: {state.summary.items} items and {state.summary.photos} photos ({sizeText(state.file.size)}).
          </p>
          <button type="button" onClick={() => void save(state.file, state.summary)}>
            Save backup file
          </button>
          <p className="muted">Choose “Save to Files”, ideally in iCloud Drive or somewhere off this phone.</p>
        </div>
      );
    case 'done':
      return (
        <p className="success" role="status">
          {state.how === 'shared'
            ? '✓ Backup saved.'
            : '✓ Download started. Look for it in the Files app, under Downloads.'}
        </p>
      );
  }
}
