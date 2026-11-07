import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { getSettings } from '../db/settings.ts';
import { ApiKeySection } from './settings/ApiKeySection.tsx';
import { ChildrenSection } from './settings/ChildrenSection.tsx';
import { StorageSection } from './settings/StorageSection.tsx';

export function SettingsPage() {
  const settings = useLiveQuery(() => getSettings());
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());

  if (!settings || !children) return null;

  return (
    <>
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <ChildrenSection items={children} />
      <ApiKeySection settings={settings} />
      <StorageSection />
      <footer className="app-footer">
        <small>Version {__APP_VERSION__}</small>
      </footer>
    </>
  );
}
