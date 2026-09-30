import { useLayoutEffect, useRef, useState } from 'react';
import { navigate } from '../nav';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

const TABS: { id: 'builder' | 'calendar'; label: string; hash: string; icon: IconName; key: string }[] = [
  { id: 'builder', label: 'Flow', hash: '#/', icon: 'flow', key: '1' },
  { id: 'calendar', label: 'Calendar', hash: '#/calendar', icon: 'calendar', key: '2' },
];

/** Flow / Calendar switch with a pill that slides between the options. */
export function ViewSwitch({ current }: { current: 'builder' | 'calendar' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [current]);

  return (
    <nav className="view-switch hide-sm" aria-label="Views" ref={ref}>
      {pill && <span className="view-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />}
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={tab.hash}
          data-tab={tab.id}
          className={`view-tab${current === tab.id ? ' is-current' : ''}`}
          aria-current={current === tab.id ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            if (current !== tab.id) navigate(tab.hash);
          }}
        >
          <Icon name={tab.icon} size={15} />
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

/** Phones get the same switch as a bottom tab bar within thumb reach. */
export function BottomTabs({ current }: { current: 'builder' | 'calendar' }) {
  return (
    <nav className="bottom-tabs show-sm" aria-label="Views">
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={tab.hash}
          className={`bottom-tab${current === tab.id ? ' is-current' : ''}`}
          aria-current={current === tab.id ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            if (current !== tab.id) navigate(tab.hash);
          }}
        >
          <Icon name={tab.icon} size={20} />
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = IS_MAC ? '⌘' : 'Ctrl';

const SHORTCUTS: { group: string; items: [string[], string][] }[] = [
  {
    group: 'Everywhere',
    items: [
      [[MOD, 'Z'], 'Undo'],
      [[MOD, 'Shift', 'Z'], 'Redo'],
      [['1'], 'Flow'],
      [['2'], 'Calendar'],
      [['?'], 'This list'],
    ],
  },
  {
    group: 'Flow',
    items: [
      [['+'], 'Zoom in'],
      [['-'], 'Zoom out'],
      [['0'], 'Zoom to 100%'],
      [['F'], 'Fit the flow'],
      [['Alt', '↑ ↓'], 'Move the selected round'],
      [['Delete'], 'Remove the selected round'],
      [['Esc'], 'Cancel a drag or deselect'],
    ],
  },
  {
    group: 'Calendar',
    items: [
      [['N'], 'New meeting'],
      [['T'], 'Jump to today'],
      [['← →'], 'Previous or next'],
      [['D', 'W', 'M'], 'Day, week or month'],
      [['Alt', '↑ ↓'], 'Move the meeting 15 minutes'],
      [['Alt', '← →'], 'Move the meeting a day'],
      [['Delete'], 'Delete the meeting'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={560}>
      <div className="shortcut-grid">
        {SHORTCUTS.map((group) => (
          <section key={group.group} className="shortcut-group">
            <h3>{group.group}</h3>
            <dl>
              {group.items.map(([keys, label]) => (
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
          </section>
        ))}
      </div>
      <p className="form-help">Drag works everywhere: blocks, rounds, people and aspects on the flow; meetings and deadlines on the calendar. Hold a finger down to pick something up on a touch screen.</p>
    </Modal>
  );
}
