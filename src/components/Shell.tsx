import type { ReactNode } from 'react';
import { navigate, TAB_HASH, type Tab } from '../nav';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

const TABS: { id: Tab; label: string; icon: IconName; key: string }[] = [
  { id: 'today', label: 'Today', icon: 'today', key: '1' },
  { id: 'projects', label: 'Projects', icon: 'folder', key: '2' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', key: '3' },
  { id: 'routines', label: 'Routines', icon: 'repeat', key: '4' },
];

export const TAB_KEYS: Record<string, Tab> = Object.fromEntries(TABS.map((t) => [t.key, t.id]));

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

function TabLink({ tab, current, className }: { tab: (typeof TABS)[number]; current: Tab; className: string }) {
  const on = current === tab.id;
  return (
    <a
      href={TAB_HASH[tab.id]}
      className={`${className}${on ? ' is-current' : ''}`}
      aria-current={on ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(TAB_HASH[tab.id]);
      }}
    >
      <Icon name={tab.icon} size={className === 'bottom-tab' ? 20 : 16} />
      <span>{tab.label}</span>
    </a>
  );
}

export function Shell({ tab, onCapture, children }: { tab: Tab; onCapture: () => void; children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <a
          href="#/"
          className="logo"
          onClick={(e) => {
            e.preventDefault();
            navigate('#/');
          }}
        >
          <span className="logo-mark" aria-hidden="true" />
          pillow
        </a>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <TabLink key={t.id} tab={t} current={tab} className="tab" />
          ))}
        </nav>
        <button type="button" className="btn btn-sm btn-primary capture-btn" onClick={onCapture}>
          <Icon name="plus" size={15} strokeWidth={2.2} />
          Capture
          <kbd>N</kbd>
        </button>
      </header>

      <main className="main">{children}</main>

      <button type="button" className="fab" aria-label="Capture" onClick={onCapture}>
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>
      <nav className="bottom-tabs" aria-label="Sections">
        {TABS.map((t) => (
          <TabLink key={t.id} tab={t} current={tab} className="bottom-tab" />
        ))}
      </nav>
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['N'], 'Capture anything'],
  [['1', '2', '3', '4'], 'Today, Projects, Calendar, Routines'],
  [[MOD, 'Z'], 'Undo'],
  [[MOD, 'Shift', 'Z'], 'Redo'],
  [['T'], 'Calendar: jump to today'],
  [['←', '→'], 'Calendar: earlier or later'],
  [['?'], 'This list'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Shortcuts" onClose={onClose} width={440}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="shortcut-row">
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <p className="section-note">
        In the capture box: <code>#project</code> files it, a leading <code>wait</code> makes it a waiting item, <code>!today</code> or <code>!fri</code> sets a due day.
      </p>
    </Modal>
  );
}
