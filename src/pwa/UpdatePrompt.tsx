import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker and offers a "Reload" button when a new
 * version has been downloaded. We prompt rather than auto-reload so an
 * update never discards something half-entered.
 */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // iOS keeps home-screen apps alive for a long time; check for updates hourly.
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
  });

  // "Ready to work offline" is just news: hide it after a few seconds.
  // The update prompt stays until it's answered.
  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const timer = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(timer);
  }, [offlineReady, needRefresh, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="toast" role="status">
      <span>{needRefresh ? 'A new version is available.' : 'Ready to work offline.'}</span>
      {needRefresh && (
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
      )}
      <button type="button" className="secondary" onClick={close}>
        Close
      </button>
    </div>
  );
}
