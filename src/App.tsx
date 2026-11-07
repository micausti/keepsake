import { HomePage } from './pages/HomePage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TabBar } from './ui/TabBar.tsx';
import { useRoute } from './ui/router.ts';

export function App() {
  const route = useRoute();
  return (
    <>
      <main className="app">{route === 'settings' ? <SettingsPage /> : <HomePage />}</main>
      <TabBar current={route} />
    </>
  );
}
