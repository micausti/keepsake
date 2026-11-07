import { useState, type FormEvent } from 'react';
import { checkKeyAndModel, type KeyCheck } from '../../ai/client.ts';
import {
  DEFAULT_MODEL,
  looksLikeApiKey,
  maskApiKey,
  saveSetting,
  type Settings,
} from '../../db/settings.ts';

export function ApiKeySection({ settings }: { settings: Settings }) {
  const [draftKey, setDraftKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [draftModel, setDraftModel] = useState(settings.model);
  const [check, setCheck] = useState<KeyCheck | 'checking' | null>(null);
  const [keyWarning, setKeyWarning] = useState<string | null>(null);

  const saveKey = async (e: FormEvent) => {
    e.preventDefault();
    const key = draftKey.trim();
    if (!key) return;
    setKeyWarning(
      looksLikeApiKey(key) ? null : 'That doesn’t look like an Anthropic key (they start with sk-ant-). Saved anyway.',
    );
    await saveSetting('apiKey', key);
    setDraftKey('');
    setShowKey(false);
    setCheck(null);
  };

  const removeKey = async () => {
    if (!window.confirm('Remove the API key from this device?')) return;
    await saveSetting('apiKey', undefined);
    setCheck(null);
    setKeyWarning(null);
  };

  const saveModel = async (e: FormEvent) => {
    e.preventDefault();
    await saveSetting('model', draftModel.trim() || DEFAULT_MODEL);
    setDraftModel(draftModel.trim() || DEFAULT_MODEL);
    setCheck(null);
  };

  const resetModel = async () => {
    setDraftModel(DEFAULT_MODEL);
    await saveSetting('model', undefined);
    setCheck(null);
  };

  const test = async () => {
    if (!settings.apiKey) return;
    setCheck('checking');
    setCheck(await checkKeyAndModel(settings.apiKey, settings.model));
  };

  return (
    <section className="card" aria-labelledby="ai-heading">
      <h2 id="ai-heading">AI auto-fill</h2>
      <p className="muted">
        Photos are described by Claude using your own Anthropic API key. The key is stored only on
        this device and is only ever sent to api.anthropic.com.
      </p>

      {settings.apiKey ? (
        <div className="saved-key">
          <span>
            Key saved: <code>{maskApiKey(settings.apiKey)}</code>
          </span>
          <button type="button" className="secondary" onClick={() => void removeKey()}>
            Remove
          </button>
        </div>
      ) : (
        <p>
          <strong>No key saved.</strong>
        </p>
      )}

      <form onSubmit={(e) => void saveKey(e)} className="stack">
        <div className="field">
          <label htmlFor="api-key">{settings.apiKey ? 'Replace key' : 'API key'}</label>
          <div className="input-row">
            <input
              id="api-key"
              type={showKey ? 'text' : 'password'}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="button" className="secondary" onClick={() => setShowKey((s) => !s)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button type="submit" disabled={!draftKey.trim()}>
          Save key
        </button>
        {keyWarning && <p className="warning">{keyWarning}</p>}
      </form>

      <form onSubmit={(e) => void saveModel(e)} className="stack">
        <div className="field">
          <label htmlFor="model">Model</label>
          <input
            id="model"
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="muted">Default: {DEFAULT_MODEL}</small>
        </div>
        <div className="button-row">
          <button type="submit" disabled={draftModel.trim() === settings.model}>
            Save model
          </button>
          {settings.model !== DEFAULT_MODEL && (
            <button type="button" className="secondary" onClick={() => void resetModel()}>
              Use default
            </button>
          )}
        </div>
      </form>

      <div className="stack">
        <button
          type="button"
          className="secondary outline"
          onClick={() => void test()}
          disabled={!settings.apiKey || check === 'checking'}
        >
          {check === 'checking' ? 'Checking…' : 'Test key and model'}
        </button>
        {check && check !== 'checking' && (
          <p className={check.ok ? 'success' : 'warning'} role="status">
            {check.ok ? `✓ Working. Connected to ${check.modelName}.` : check.message}
          </p>
        )}
        <small className="muted">
          The test is free: it only looks the model up and doesn’t generate anything. Tip: create a
          key just for Keepsake in the Claude Console and set a monthly spend limit.
        </small>
      </div>
    </section>
  );
}
