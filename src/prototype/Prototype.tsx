import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { BookingIcon, ChevronIcon, LinkIcon, PAINT_CURSOR, TasksIcon } from './icons';
import {
  DAYS,
  FIRST_HOUR,
  HOUR_PX,
  INITIAL_EVENTS,
  INITIAL_TASKS,
  INITIAL_WINDOWS,
  LAST_HOUR,
  NOW_HOUR,
  SHARE_LINK,
  SNAP,
  TODAY,
  TONES,
  clampStart,
  formatHour,
  formatRange,
  nextId,
  placeEvents,
  snap,
  type CalEvent,
  type FreeWindow,
  type Task,
} from './model';
import { BookingPanel, EventChip, EventPopover, FloatingChip, RailButton, SchedulePanel, TasksPanel, ToolbarButton } from './parts';

type Panel = 'tasks' | 'schedule' | 'booking';
type Span = { day: number; start: number; length: number };

type Gesture =
  | { kind: 'create'; paint: boolean; day: number; anchor: number; x: number; y: number }
  | { kind: 'move'; id: string; grab: number; x: number; y: number; offsetX: number; offsetY: number; width: number; height: number; moved: boolean }
  | { kind: 'resize'; id: string }
  | { kind: 'window'; id: string; grab: number; moved: boolean }
  | { kind: 'edge'; id: string; edge: 'start' | 'end' }
  | { kind: 'task'; id: string; x: number; y: number; moved: boolean };

const setCursor = (cursor: string) => {
  document.documentElement.style.cursor = cursor;
};

/** One band of the page: a top rule with a rivet at each end, content in the 1080px column. */
export function Band({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className="band">
      <div className={`band-inner ${className}`}>
        <span className="rivet is-left" />
        <span className="rivet is-right" />
        {children}
      </div>
    </div>
  );
}

export function Prototype() {
  const [events, setEvents] = useState<CalEvent[]>(INITIAL_EVENTS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [panel, setPanel] = useState<Panel>('tasks');
  const [panelOpen, setPanelOpen] = useState(true);
  const [view, setView] = useState<'week' | 'day'>('week');
  const [viewMenu, setViewMenu] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Span | null>(null);
  const [taskDrag, setTaskDrag] = useState<{ title: string; x: number; y: number; over: Span | null } | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [float, setFloat] = useState<{ id: string; width: number; height: number; x: number; y: number } | null>(null);
  const [pulse, setPulse] = useState(0);
  const [windows, setWindows] = useState<FreeWindow[]>(INITIAL_WINDOWS);
  const [activeWindow, setActiveWindow] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [overTasks, setOverTasks] = useState(false);
  const [changed, setChanged] = useState(false);

  const floatRef = useRef<HTMLDivElement>(null);
  const landing = useRef<{ id: string; left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overTasksRef = useRef(false);
  const focusInside = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  const days = view === 'week' ? [0, 1, 2, 3, 4] : [TODAY];
  const painting = panelOpen && panel === 'schedule';

  const editEvents = (update: (list: CalEvent[]) => CalEvent[]) => {
    setEvents(update);
    setChanged(true);
  };

  const copyLink = () => {
    if (windows.length === 0) return;
    setCopied(true);
    navigator.clipboard?.writeText(`https://${SHARE_LINK}`).catch(() => {});
  };

  /** Where a pointer is on the grid: which day column and which hour. */
  const hit = (x: number, y: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const r = grid.getBoundingClientRect();
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const col = Math.min(days.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * days.length)));
    return { day: days[col], hour: FIRST_HOUR + (y - r.top) / HOUR_PX, inside };
  };

  // Keyboard for the free-time windows, live only while one-off scheduling is open and you're using the prototype.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const section = gridRef.current?.closest('section');
      focusInside.current = !!(section && e.target instanceof Node && section.contains(e.target));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!painting || !focusInside.current) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        copyLink();
        return;
      }
      const sorted = [...windows].sort((a, b) => a.day - b.day || a.start - b.start);
      if (e.key === 'Tab') {
        if (sorted.length === 0) return;
        e.preventDefault();
        const index = sorted.findIndex((w) => w.id === activeWindow);
        setActiveWindow(sorted[(index + (e.shiftKey ? -1 : 1) + sorted.length) % sorted.length].id);
        return;
      }
      if (!activeWindow) return;
      if (e.key === 'Escape') {
        setActiveWindow(null);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setWindows((list) => list.filter((w) => w.id !== activeWindow));
        setActiveWindow(null);
        setChanged(true);
        return;
      }
      const step = ({ ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, [number, number]>)[e.key];
      if (!step) return;
      e.preventDefault();
      setChanged(true);
      setCopied(false);
      setWindows((list) =>
        list.map((w) => {
          if (w.id !== activeWindow) return w;
          if (e.shiftKey && step[1] !== 0) return { ...w, length: Math.min(LAST_HOUR - w.start, Math.max(SNAP * 2, w.length + step[1])) };
          const day = Math.min(4, Math.max(0, w.day + step[0]));
          return { ...w, day: view === 'week' ? day : w.day, start: clampStart(w.start + step[1], w.length) };
        }),
      );
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  // Every drag on the prototype runs through here.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const at = hit(e.clientX, e.clientY);
      if (!at) return;

      if (g.kind === 'create') {
        const end = snap(at.hour);
        const start = Math.min(g.anchor, end);
        const length = Math.max(SNAP, Math.abs(end - g.anchor));
        setDraft({ day: g.day, start: clampStart(start, length), length: Math.min(length, 10) });
        return;
      }

      if (g.kind === 'move') {
        if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
        const x = e.clientX - g.offsetX;
        const y = e.clientY - g.offsetY;
        if (!g.moved) {
          g.moved = true;
          setCursor('grabbing');
          setLifted(g.id);
          setSelected(null);
          setFloat({ id: g.id, width: g.width, height: g.height, x, y });
        }
        if (floatRef.current) floatRef.current.style.translate = `${x}px ${y}px`;
        const box = panelRef.current?.getBoundingClientRect();
        const over =
          panelOpen && panel === 'tasks' && box !== undefined && box.width > 0 && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
        if (over !== overTasksRef.current) {
          overTasksRef.current = over;
          setOverTasks(over);
        }
        if (over) return;
        const ev = events.find((x) => x.id === g.id);
        if (!ev) return;
        const start = clampStart(snap(at.hour - g.grab), ev.length);
        if (ev.day === at.day && ev.start === start) return;
        editEvents((list) => list.map((x) => (x.id === g.id ? { ...x, day: at.day, start } : x)));
        return;
      }

      if (g.kind === 'window') {
        if (!g.moved) {
          g.moved = true;
          setCursor('grabbing');
        }
        setWindows((list) =>
          list.map((w) => {
            if (w.id !== g.id) return w;
            const start = clampStart(snap(at.hour - g.grab), w.length);
            return w.day === at.day && w.start === start ? w : { ...w, day: at.day, start };
          }),
        );
        setCopied(false);
        setChanged(true);
        return;
      }

      if (g.kind === 'edge') {
        setWindows((list) =>
          list.map((w) => {
            if (w.id !== g.id) return w;
            const end = w.start + w.length;
            if (g.edge === 'start') {
              const start = Math.min(end - SNAP * 2, Math.max(FIRST_HOUR, snap(at.hour)));
              return { ...w, start, length: end - start };
            }
            const next = Math.max(w.start + SNAP * 2, Math.min(LAST_HOUR, snap(at.hour)));
            return { ...w, length: next - w.start };
          }),
        );
        setCopied(false);
        setChanged(true);
        return;
      }

      if (g.kind === 'resize') {
        editEvents((list) =>
          list.map((x) => {
            if (x.id !== g.id) return x;
            const end = Math.min(LAST_HOUR, snap(at.hour));
            return { ...x, length: Math.max(SNAP, end - x.start) };
          }),
        );
        return;
      }

      // Dragging a task out of the list.
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
      g.moved = true;
      setCursor('grabbing');
      const task = tasks.find((t) => t.id === g.id);
      setTaskDrag({
        title: task?.title ?? '',
        x: e.clientX,
        y: e.clientY,
        over: at.inside ? { day: at.day, start: clampStart(snap(at.hour - 0.5), 1), length: 1 } : null,
      });
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      setCursor('');

      if (g.kind === 'create') {
        const span = Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4 || !draft ? { day: g.day, start: clampStart(g.anchor, 1), length: 1 } : draft;
        setDraft(null);
        if (g.paint) {
          const id = nextId('w');
          setWindows((list) => [...list, { id, ...span }]);
          setActiveWindow(id);
          setCopied(false);
          setChanged(true);
          return;
        }
        const id = nextId('n');
        editEvents((list) => [...list, { id, ...span, title: '', tone: 'green' }]);
        setEditing(id);
        return;
      }

      if (g.kind === 'move') {
        setLifted(null);
        if (!g.moved) {
          setSelected((s) => (s === g.id ? null : g.id));
          return;
        }
        if (overTasksRef.current) {
          overTasksRef.current = false;
          setOverTasks(false);
          const ev = events.find((x) => x.id === g.id);
          editEvents((list) => list.filter((x) => x.id !== g.id));
          if (ev) setTasks((list) => [{ id: nextId('t'), title: ev.title, done: false, list: 'today' }, ...list]);
          setFloat(null);
          return;
        }
        const box = floatRef.current?.getBoundingClientRect();
        if (box) landing.current = { id: g.id, left: box.left, top: box.top };
        setFloat(null);
        return;
      }

      if (g.kind === 'task') {
        const over = taskDrag?.over;
        setTaskDrag(null);
        if (!g.moved || !over) return;
        const task = tasks.find((t) => t.id === g.id);
        if (!task) return;
        editEvents((list) => [...list, { id: nextId('n'), ...over, title: task.title, tone: 'amber' }]);
        setTasks((list) => list.filter((t) => t.id !== g.id));
      }
    };

    const onCancel = () => {
      gesture.current = null;
      setCursor('');
      setDraft(null);
      setTaskDrag(null);
      setLifted(null);
      setFloat(null);
      overTasksRef.current = false;
      setOverTasks(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  });

  // The picked-up chip tips over as it lifts.
  const floatId = float?.id ?? null;
  useLayoutEffect(() => {
    const inner = floatRef.current?.firstElementChild;
    if (!floatId || !inner || typeof inner.animate !== 'function') return;
    inner.animate([{ rotate: '0deg' }, { rotate: '-2deg' }], { duration: 180, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  }, [floatId]);

  // On drop, the chip flies from where the floating copy was into its slot and straightens out.
  useLayoutEffect(() => {
    const from = landing.current;
    if (float || !from) return;
    landing.current = null;
    const chip = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-chip]') ?? [])].find((el) => el.dataset.chip === from.id);
    if (!chip || typeof chip.animate !== 'function') return;
    const to = chip.getBoundingClientRect();
    chip.animate(
      [
        { translate: `${from.left - to.left}px ${from.top - to.top}px`, rotate: '-2deg', boxShadow: '0 18px 36px -12px rgba(20,20,20,0.35)' },
        { translate: '0 0', rotate: '0deg' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' },
    );
  }, [float]);

  // A selected event: Escape lets go, Delete removes it, a click anywhere else closes it.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setEvents((list) => list.filter((x) => x.id !== selected));
        setChanged(true);
        setSelected(null);
      }
    };
    const onDown = () => setSelected(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [selected]);

  // "Today" makes the now line pulse.
  useEffect(() => {
    const line = nowRef.current;
    if (!line || pulse === 0 || typeof line.animate !== 'function') return;
    line.animate(
      [
        { transform: 'scaleY(1)', opacity: 1 },
        { transform: 'scaleY(3)', opacity: 0.6 },
        { transform: 'scaleY(1)', opacity: 1 },
      ],
      { duration: 600, easing: 'ease-out' },
    );
  }, [pulse]);

  const startCreate = (e: ReactPointerEvent) => {
    if (e.button !== 0 || editing) return;
    const at = hit(e.clientX, e.clientY);
    if (!at) return;
    const anchor = Math.floor(at.hour / SNAP) * SNAP;
    gesture.current = { kind: 'create', paint: painting, day: at.day, anchor, x: e.clientX, y: e.clientY };
    setDraft({ day: at.day, start: clampStart(anchor, SNAP), length: SNAP });
  };

  const reset = () => {
    setEvents(INITIAL_EVENTS);
    setTasks(INITIAL_TASKS);
    setWindows(INITIAL_WINDOWS);
    setActiveWindow(null);
    setCopied(false);
    setSelected(null);
    setEditing(null);
    setView('week');
    setPanel('tasks');
    setPanelOpen(true);
    setChanged(false);
  };

  const openPanel = (next: Panel) => {
    if (panel === next) {
      setPanelOpen(!panelOpen);
      return;
    }
    setPanel(next);
    setPanelOpen(true);
  };

  const selectedEvent = events.find((x) => x.id === selected) ?? null;
  const floatEvent = float ? (events.find((x) => x.id === float.id) ?? events[0]) : null;

  return (
    <section className="proto">
      <Band className="try-bar">
        <span className="try-pill">Try it</span>
        {painting ? 'Drag on the week to paint when you are free, then use the keys to adjust.' : 'Drag on the grid to make an event, move it between days or back to your tasks.'}
        {changed && (
          <button type="button" onClick={reset} className="reset">
            Reset
          </button>
        )}
      </Band>

      <Band>
        <div className="window" style={{ '--cal-text': '#1f1f1f', '--cal-muted': '#8d877f', '--cal-bg': '#ffffff' } as CSSProperties}>
          <div className="titlebar">
            <span className="light is-red" />
            <span className="light is-yellow" />
            <span className="light is-green" />
            <span className="titlebar-name">pillow</span>
            <span className="titlebar-spacer" />
          </div>

          <div className="app">
            <div className="rail">
              <RailButton label="Tasks" current={panel === 'tasks'} open={panelOpen && panel === 'tasks'} onClick={() => openPanel('tasks')}>
                <TasksIcon size={20} />
              </RailButton>
              <RailButton label="One-off scheduling" current={panel === 'schedule'} open={panelOpen && panel === 'schedule'} onClick={() => openPanel('schedule')}>
                <LinkIcon size={20} />
              </RailButton>
              <RailButton label="Booking page" current={panel === 'booking'} open={panelOpen && panel === 'booking'} onClick={() => openPanel('booking')}>
                <BookingIcon size={20} />
              </RailButton>
            </div>

            <div ref={panelRef} className={`side${panelOpen ? ' is-open' : ''}${overTasks ? ' is-drop' : ''}`}>
              <div className={`drop-hint${overTasks ? ' is-on' : ''}`}>Drop to move it to your tasks</div>
              <div className="side-inner">
                {panel === 'tasks' && (
                  <TasksPanel
                    tasks={tasks}
                    onToggle={(id) => {
                      setTasks((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
                      setChanged(true);
                    }}
                    onAdd={(title) => {
                      setTasks((list) => [...list, { id: nextId('t'), title, done: false, list: 'today' }]);
                      setChanged(true);
                    }}
                    onDragStart={(id, e) => {
                      if (e.button === 0) gesture.current = { kind: 'task', id, x: e.clientX, y: e.clientY, moved: false };
                    }}
                  />
                )}
                {panel === 'schedule' && (
                  <SchedulePanel
                    windows={windows}
                    active={activeWindow}
                    copied={copied}
                    onSelect={(id) => {
                      focusInside.current = true;
                      setActiveWindow(id);
                    }}
                    onRemove={(id) => {
                      setWindows((list) => list.filter((w) => w.id !== id));
                      setActiveWindow(null);
                      setChanged(true);
                    }}
                    onCopy={copyLink}
                  />
                )}
                {panel === 'booking' && <BookingPanel />}
              </div>
            </div>

            <div className="main">
              <div className="toolbar">
                <p className="month">
                  September 2026
                  <span className="month-chevron">
                    <ChevronIcon direction="down" />
                  </span>
                </p>
                <div className="tools">
                  <ToolbarButton
                    onClick={() => {
                      setView('week');
                      setPulse((p) => p + 1);
                    }}
                  >
                    Today
                  </ToolbarButton>
                  <ToolbarButton active={viewMenu} onClick={() => setViewMenu(!viewMenu)}>
                    {view === 'week' ? 'Week' : 'Day'}
                    <ChevronIcon direction="down" />
                  </ToolbarButton>
                </div>
                {viewMenu && (
                  <div className="view-menu">
                    {(['day', 'week'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setView(v);
                          setViewMenu(false);
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

              <div className="cal">
                <div className="gutter">
                  {Array.from({ length: 10 }, (_, i) => (
                    <p key={i} className="gutter-hour" style={{ height: HOUR_PX }}>
                      {i === 0 ? '' : formatHour(FIRST_HOUR + i)}
                    </p>
                  ))}
                </div>
                <div className="cal-days">
                  <div className="day-heads">
                    {days.map((d) => (
                      <p key={d} className={`day-head${d === TODAY ? ' is-today' : ''}`}>
                        {DAYS[d]}
                      </p>
                    ))}
                  </div>
                  <div ref={gridRef} onPointerDown={startCreate} className="grid" style={{ height: 600, cursor: painting ? PAINT_CURSOR : undefined }}>
                    {painting && <div className="hatch" />}
                    {days.map((d) => {
                      const dayEvents = events.filter((x) => x.day === d);
                      const places = placeEvents(dayEvents);
                      return (
                        <div key={d} className="day">
                          {dayEvents.map((ev) => (
                            <EventChip
                              key={ev.id}
                              event={ev}
                              place={places.get(ev.id) ?? { depth: 0, lane: 0, lanes: 1 }}
                              selected={selected === ev.id}
                              editing={editing === ev.id}
                              lifted={lifted === ev.id}
                              muted={painting}
                              busy={lifted !== null || taskDrag !== null}
                              onMoveStart={(e) => {
                                e.stopPropagation();
                                if (e.button !== 0 || editing === ev.id) return;
                                const at = hit(e.clientX, e.clientY);
                                const r = e.currentTarget.getBoundingClientRect();
                                gesture.current = {
                                  kind: 'move',
                                  id: ev.id,
                                  grab: (at?.hour ?? ev.start) - ev.start,
                                  x: e.clientX,
                                  y: e.clientY,
                                  offsetX: e.clientX - r.left,
                                  offsetY: e.clientY - r.top,
                                  width: r.width,
                                  height: r.height,
                                  moved: false,
                                };
                              }}
                              onResizeStart={(e) => {
                                e.stopPropagation();
                                gesture.current = { kind: 'resize', id: ev.id };
                                setCursor('ns-resize');
                                setSelected(null);
                              }}
                              onTitleDone={(title) => {
                                setEditing(null);
                                if (title === null) {
                                  editEvents((list) => list.filter((x) => x.id !== ev.id));
                                  return;
                                }
                                editEvents((list) => list.map((x) => (x.id === ev.id ? { ...x, title } : x)));
                              }}
                            />
                          ))}

                          {selectedEvent && selectedEvent.day === d && (
                            <EventPopover
                              event={selectedEvent}
                              flip={view === 'week' && d >= 3}
                              onTone={(tone) => editEvents((list) => list.map((x) => (x.id === selectedEvent.id ? { ...x, tone } : x)))}
                              onDelete={() => {
                                editEvents((list) => list.filter((x) => x.id !== selectedEvent.id));
                                setSelected(null);
                              }}
                            />
                          )}

                          {painting &&
                            windows
                              .filter((w) => w.day === d)
                              .map((w) => (
                                <div
                                  key={w.id}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    if (e.button !== 0) return;
                                    const at = hit(e.clientX, e.clientY);
                                    focusInside.current = true;
                                    setActiveWindow(w.id);
                                    gesture.current = { kind: 'window', id: w.id, grab: (at?.hour ?? w.start) - w.start, moved: false };
                                  }}
                                  style={{ top: (w.start - FIRST_HOUR) * HOUR_PX + 1, height: w.length * HOUR_PX - 3 }}
                                  className={`free${activeWindow === w.id ? ' is-active' : ''}`}
                                >
                                  <div
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      focusInside.current = true;
                                      setActiveWindow(w.id);
                                      setCursor('ns-resize');
                                      gesture.current = { kind: 'edge', id: w.id, edge: 'start' };
                                    }}
                                    className="free-edge is-top"
                                  />
                                  <p className="free-title">Free</p>
                                  <p className="free-time">{formatRange(w.start, w.length)}</p>
                                  <button
                                    type="button"
                                    aria-label="Remove window"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => {
                                      setWindows((list) => list.filter((x) => x.id !== w.id));
                                      setActiveWindow(null);
                                      setChanged(true);
                                    }}
                                    className="free-x"
                                  >
                                    ×
                                  </button>
                                  <div
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      focusInside.current = true;
                                      setActiveWindow(w.id);
                                      setCursor('ns-resize');
                                      gesture.current = { kind: 'edge', id: w.id, edge: 'end' };
                                    }}
                                    className="free-edge is-bottom"
                                  />
                                </div>
                              ))}

                          {draft && draft.day === d && (
                            <div className="draft" style={{ top: (draft.start - FIRST_HOUR) * HOUR_PX + 1, height: draft.length * HOUR_PX - 3 }}>
                              <p>{formatRange(draft.start, draft.length)}</p>
                            </div>
                          )}

                          {taskDrag?.over && taskDrag.over.day === d && <div className="task-slot" style={{ top: (taskDrag.over.start - FIRST_HOUR) * HOUR_PX + 1, height: 57 }} />}

                          {d === TODAY && (
                            <div ref={nowRef} className="now" style={{ top: (NOW_HOUR - FIRST_HOUR) * HOUR_PX }}>
                              <span />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Band>

      {taskDrag && (
        <div
          className="task-ghost"
          style={{ left: taskDrag.x + 12, top: taskDrag.y + 8, '--bar': TONES.amber.bar, '--fill': TONES.amber.fill, '--ink': TONES.amber.ink } as CSSProperties}
        >
          <span className="chip-bar" />
          <p>{taskDrag.title}</p>
        </div>
      )}
      {float && floatEvent && <FloatingChip event={floatEvent} width={float.width} height={float.height} x={float.x} y={float.y} floatRef={floatRef} />}
    </section>
  );
}
