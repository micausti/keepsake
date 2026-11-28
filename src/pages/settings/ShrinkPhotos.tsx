import { useEffect, useRef, useState } from 'react';
import { shrinkCandidates, shrinkPhotos, type ShrinkCandidates } from '../../db/shrink.ts';
import { formatBytes } from '../../db/storage.ts';

type State =
  | { name: 'idle' }
  | { name: 'running'; done: number; total: number }
  | { name: 'done'; shrunk: number; savedBytes: number; stopped: boolean }
  | { name: 'error' };

/** Offers to re-save photos taken at the old, larger size. Hidden when there are none. */
export function ShrinkPhotos({ onChanged }: { onChanged?: () => void }) {
  const [candidates, setCandidates] = useState<ShrinkCandidates | null>(null);
  const [state, setState] = useState<State>({ name: 'idle' });
  const stop = useRef(false);

  useEffect(() => {
    void shrinkCandidates().then(setCandidates);
  }, []);

  const run = async () => {
    if (!candidates) return;
    const ok = window.confirm(
      `Re-save ${candidates.count} photos at 1600px? They’ll still look sharp, but this can’t be undone.`,
    );
    if (!ok) return;
    stop.current = false;
    setState({ name: 'running', done: 0, total: candidates.count });
    try {
      const result = await shrinkPhotos((done, total) => setState({ name: 'running', done, total }), {
        shouldStop: () => stop.current,
      });
      setState({ name: 'done', ...result, stopped: stop.current });
    } catch {
      setState({ name: 'error' });
    }
    setCandidates(await shrinkCandidates());
    onChanged?.();
  };

  if (state.name === 'running') {
    return (
      <div className="stack">
        <p role="status">
          Making photos smaller… {state.done} of {state.total}
        </p>
        <button type="button" className="secondary outline" onClick={() => (stop.current = true)}>
          Stop
        </button>
        <p className="muted">Keep the app open. You can stop and carry on later.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {state.name === 'done' && (
        <p className="success" role="status">
          ✓ {state.shrunk} photos made smaller, saving {formatBytes(state.savedBytes)}.
          {state.stopped ? ' Stopped: you can carry on any time.' : ''}
        </p>
      )}
      {state.name === 'error' && (
        <p className="warning" role="alert">
          Something went wrong part way. Photos done so far are saved; try again to carry on.
        </p>
      )}
      {candidates && candidates.count > 0 && (
        <>
          <p>
            {candidates.count} photos are saved at the old, larger size ({formatBytes(candidates.bytes)}). Re-saving
            them at 1600px frees about half of that and makes backups smaller.
          </p>
          <button type="button" onClick={() => void run()}>
            Make photos smaller
          </button>
        </>
      )}
    </div>
  );
}
