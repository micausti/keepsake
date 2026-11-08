import { useEffect, useState } from 'react';
import { AddItemPage } from './pages/AddItemPage.tsx';
import { BrowsePage } from './pages/BrowsePage.tsx';
import { EditItemPage } from './pages/EditItemPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ItemPage } from './pages/ItemPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { UpdateItemPage } from './pages/UpdateItemPage.tsx';
import { TabBar } from './ui/TabBar.tsx';
import { tabFor, useRoute, type Route } from './ui/router.ts';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'items':
      return <BrowsePage />;
    case 'item':
      return <ItemPage id={route.id} />;
    case 'edit':
      return <EditItemPage id={route.id} />;
    case 'update':
      return <UpdateItemPage id={route.id} />;
    case 'add':
      return <AddItemPage />;
    case 'settings':
      return <SettingsPage />;
    case 'home':
      return <HomePage />;
  }
}

export function App() {
  const route = useRoute();
  // Tapping the current tab again starts that screen afresh (e.g. "Add" after saving).
  const [visit, setVisit] = useState(0);
  const key = `${JSON.stringify(route)}#${visit}`;
  // New screen: start at the top.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [key]);
  return (
    <>
      <main className="app">
        <Screen key={key} route={route} />
      </main>
      <TabBar current={tabFor(route)} onReselect={() => setVisit((v) => v + 1)} />
    </>
  );
}
