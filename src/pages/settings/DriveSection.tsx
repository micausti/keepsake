import { useEffect, useRef, useState } from 'react';
import { BackupError } from '../../backup/backup.ts';
import { saveSetting, type Settings } from '../../db/settings.ts';
import { formatDate } from '../../domain/dates.ts';
import {
  currentToken,
  forgetToken,
  peekSignInResult,
  startSignIn,
  takeSignInResult,
  type DriveAction,
} from '../../drive/auth.ts';
import { DriveAuthError, DriveClient, DriveError } from '../../drive/client.ts';
import { DriveConflictError, backupToDrive, openDriveBackup, type SyncProgress } from '../../drive/sync.ts';

type State =
  | { name: 'idle' }
  | { name: 'working'; text: string }
  | { name: 'conflict'; driveItems: number; localItems: number }
  | { name: 'message'; kind: 'success' | 'warning'; text: string };

const progressText = (p: SyncProgress) =>
  p.stage === 'checking'
    ? 'Checking Google Drive…'
    : p.stage === 'photos'
      ? p.total
        ? `Uploading photos… ${p.done} of ${p.total}`
        : 'Photos are up to date.'
      : p.stage === 'saving'
        ? 'Saving item details…'
        : 'Tidying up…';

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const failure = (error: unknown) =>
  error instanceof DriveError || error instanceof BackupError ? error.message : 'Something went wrong. Please try again.';

export function DriveSection({ settings }: { settings: Settings }) {
  // A sign-in that failed on Google's page shows its message straight away.
  const [state, setState] = useState<State>(() => {
    const arrival = peekSignInResult();
    return arrival && !arrival.ok ? { name: 'message', kind: 'warning', text: arrival.message } : { name: 'idle' };
  });
  const busy = useRef(false);
  const account = settings.driveAccount;

  /** Runs an action with a Google token, signing in first (by leaving the app) if needed. */
  const run = async (action: DriveAction, force = false) => {
    if (busy.current) return;
    const token = currentToken();
    if (!token) {
      startSignIn(action, account);
      return;
    }
    busy.current = true;
    const drive = new DriveClient(token);
    try {
      if (!account || action === 'connect') {
        setState({ name: 'working', text: 'Connecting…' });
        await saveSetting('driveAccount', (await drive.email()) || 'Google Drive');
      }
      if (action === 'connect') {
        setState({ name: 'message', kind: 'success', text: '✓ Google Drive connected. Tap “Back up now” to start.' });
      } else if (action === 'backup') {
        const summary = await backupToDrive(drive, __APP_VERSION__, {
          force,
          onProgress: (p) => setState({ name: 'working', text: progressText(p) }),
        });
        setState({
          name: 'message',
          kind: 'success',
          text: `✓ Backed up ${count(summary.items, 'item')} and ${count(summary.photos, 'photo')} to Google Drive.`,
        });
      } else {
        setState({ name: 'working', text: 'Looking for your backup…' });
        const backup = await openDriveBackup(drive);
        if (!backup) {
          setState({ name: 'message', kind: 'warning', text: 'There’s no Keepsake backup in this Google Drive yet.' });
          return;
        }
        const { summary } = backup;
        const ok = window.confirm(
          `Restore the Google Drive backup from ${formatDate(summary.exportedAt)}?\n\n` +
            `It has ${summary.items} items and ${summary.photos} photos, and will REPLACE everything currently in ` +
            `Keepsake on this phone. Your API key stays as it is.`,
        );
        if (!ok) {
          setState({ name: 'idle' });
          return;
        }
        await backup.restore((done, total) =>
          setState({ name: 'working', text: `Downloading photos… ${done} of ${total}` }),
        );
        setState({ name: 'message', kind: 'success', text: `✓ Restored ${count(summary.items, 'item')} from Google Drive.` });
      }
    } catch (error) {
      if (error instanceof DriveAuthError) {
        // Sign-ins last about an hour: sign in again and carry on where it left off.
        forgetToken();
        startSignIn(action, account);
      } else if (error instanceof DriveConflictError) {
        setState({ name: 'conflict', driveItems: error.driveItems, localItems: error.localItems });
      } else {
        setState({ name: 'message', kind: 'warning', text: failure(error) });
      }
    } finally {
      busy.current = false;
    }
  };

  // Back from Google's sign-in page: carry on with what was asked for.
  useEffect(() => {
    const result = takeSignInResult();
    // Started just after this render rather than during the effect itself.
    if (result?.ok) queueMicrotask(() => void run(result.action));
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Backups already in your Drive stay there.')) return;
    forgetToken();
    await saveSetting('driveAccount', undefined);
    await saveSetting('driveLastSyncAt', undefined);
    setState({ name: 'idle' });
  };

  const working = state.name === 'working';

  return (
    <section className="card" aria-labelledby="drive-heading">
      <h2 id="drive-heading">Google Drive backup</h2>
      {account ? (
        <>
          <p>
            Connected to <strong>{account}</strong>.
            <br />
            {settings.driveLastSyncAt
              ? `Last backed up ${formatDate(settings.driveLastSyncAt)}.`
              : 'Not backed up to Drive yet.'}
          </p>
          <div className="stack">
            <button type="button" disabled={working} onClick={() => void run('backup')}>
              Back up now
            </button>
            <button type="button" className="secondary outline" disabled={working} onClick={() => void run('restore')}>
              Restore from Google Drive
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Back up to a “Keepsake” folder in your own Google Drive. Only new or changed photos are sent each time.
            Keepsake can only see the files it puts there, nothing else in your Drive. Your API key is never included.
          </p>
          <button type="button" disabled={working} onClick={() => void run('connect')}>
            Connect Google Drive
          </button>
        </>
      )}

      {working && (
        <p role="status" className="muted">
          {state.text}
          <br />
          Keep the app open until it’s done.
        </p>
      )}
      {state.name === 'message' && (
        <p className={state.kind} role={state.kind === 'warning' ? 'alert' : 'status'}>
          {state.text}
        </p>
      )}
      {state.name === 'conflict' && (
        <div className="notice stack" role="alert">
          <p className="warning">
            Google Drive has a backup with {state.driveItems} items, but this phone only has {state.localItems}. Backing
            up now would replace it.
          </p>
          <button type="button" onClick={() => void run('restore')}>
            Restore from Google Drive instead
          </button>
          <button type="button" className="secondary danger" onClick={() => void run('backup', true)}>
            Replace the Drive backup
          </button>
        </div>
      )}
      {account && (
        <button type="button" className="secondary link" disabled={working} onClick={() => void disconnect()}>
          Disconnect Google Drive
        </button>
      )}
    </section>
  );
}
