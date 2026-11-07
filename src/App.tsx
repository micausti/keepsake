export function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>Keepsake</h1>
        <p className="tagline">Kids&rsquo; clothes and toys, all in one place.</p>
      </header>

      <section className="card" aria-labelledby="status-heading">
        <h2 id="status-heading">Coming soon</h2>
        <p>
          This is the first build. Next up: settings, then snap a photo and let AI fill in the
          details.
        </p>
        <p className="hint">
          Tip: in Safari tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to
          install Keepsake. It works offline.
        </p>
      </section>

      <footer className="app-footer">
        <small>
          Version {__APP_VERSION__} · Everything stays on this device.
        </small>
      </footer>
    </main>
  );
}
