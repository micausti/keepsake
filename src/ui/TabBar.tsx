import { hrefFor, type Route } from './router.ts';

const TABS: { route: Route; label: string; icon: string }[] = [
  { route: 'home', label: 'Home', icon: '⌂' },
  { route: 'add', label: 'Add', icon: '＋' },
  { route: 'settings', label: 'Settings', icon: '⚙' },
];

export function TabBar({ current }: { current: Route }) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map((tab) => (
        <a
          key={tab.route}
          href={hrefFor(tab.route)}
          className="tab"
          aria-current={tab.route === current ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
