import { hrefFor, type Page } from './router.ts';

const TABS: { page: Page; label: string; icon: string }[] = [
  { page: 'home', label: 'Home', icon: '⌂' },
  { page: 'items', label: 'Items', icon: '☰' },
  { page: 'add', label: 'Add', icon: '＋' },
  { page: 'settings', label: 'Settings', icon: '⚙' },
];

export function TabBar({ current, onReselect }: { current: Page; onReselect: () => void }) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map((tab) => (
        <a
          key={tab.page}
          href={hrefFor(tab.page)}
          className="tab"
          aria-current={tab.page === current ? 'page' : undefined}
          onClick={(e) => {
            // Same URL means no hashchange, so handle a repeat tap ourselves.
            if (window.location.hash === hrefFor(tab.page) || (tab.page === 'home' && !window.location.hash)) {
              e.preventDefault();
              onReselect();
            }
          }}
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
