import { useCallback, useEffect, useState } from 'react';
import { typing } from '../lib/route';
import { addDays, dayKey, monthLabel, weekStart, type DayKey } from '../lib/time';
import { useViewState } from '../store/store';
import { ChevronIcon } from '../ui/icons';
import { useTrayDrag } from '../ui/drag';
import { TaskTray } from '../ui/TaskTray';
import { useMedia } from '../ui/useMedia';
import { WeekGrid } from './WeekGrid';

export function PlanPage() {
  const narrow = useMedia('(max-width: 760px)');
  const [anchor, setAnchor] = useState<DayKey>(() => dayKey(Date.now()));
  const [view, setView] = useViewState<'week' | 'day'>('plan-view', 'week');
  const [menu, setMenu] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const { dragging } = useTrayDrag();

  // On a phone the tray covers the page, so it gets out of the way once a drag starts.
  useEffect(() => {
    if (narrow && dragging) setTrayOpen(false);
  }, [narrow, dragging]);
  const mode = narrow ? 'day' : view;
  const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : [anchor];
  const step = mode === 'week' ? 7 : 1;

  const shift = useCallback((dir: number) => setAnchor((a) => addDays(a, dir * step)), [step]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.menu-wrap')) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') shift(-1);
      else if (e.key === 'ArrowRight') shift(1);
      else if (e.key === 't') setAnchor(dayKey(Date.now()));
      else if (e.key === 'w') setView('week');
      else if (e.key === 'd') setView('day');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [shift, setView]);

  return (
    <div className="page">
      <header className="page-bar">
        <div className="page-bar-left">
          {narrow && (
            <button type="button" className={`tool-btn${trayOpen ? ' is-active' : ''}`} onClick={() => setTrayOpen(!trayOpen)}>
              Tasks
            </button>
          )}
          <h1 className="page-title">{monthLabel(days[Math.floor(days.length / 2)])}</h1>
          <div className="nav-arrows">
            <button type="button" className="icon-btn" aria-label="Earlier" onClick={() => shift(-1)}>
              <ChevronIcon direction="left" />
            </button>
            <button type="button" className="icon-btn" aria-label="Later" onClick={() => shift(1)}>
              <ChevronIcon direction="right" />
            </button>
          </div>
        </div>
        <div className="tools">
          <button type="button" className="tool-btn" onClick={() => setAnchor(dayKey(Date.now()))}>
            Today
          </button>
          {!narrow && (
            <div className="menu-wrap">
              <button type="button" className={`tool-btn${menu ? ' is-active' : ''}`} onClick={() => setMenu(!menu)} aria-expanded={menu}>
                {view === 'week' ? 'Week' : 'Day'}
                <ChevronIcon direction="down" />
              </button>
              {menu && (
                <div className="view-menu">
                  {(['day', 'week'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setView(v);
                        setMenu(false);
                      }}
                      className={`view-option${view === v ? ' is-on' : ''}`}
                    >
                      {v === 'day' ? 'Day' : 'Week'}
                      <kbd>{v === 'day' ? 'D' : 'W'}</kbd>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="page-body">
        <TaskTray dropHint={hint} open={!narrow || trayOpen} />
        <WeekGrid
          days={days}
          onDropHint={setHint}
          onPickDay={(d) => {
            setAnchor(d);
            setView(mode === 'week' ? 'day' : 'week');
          }}
        />
      </div>
    </div>
  );
}
