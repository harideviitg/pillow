import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { placeBlocks } from '../lib/layout';
import { clampStart, dayKey, dayLabel, formatHour, formatRange, hourOf, HOUR_PX, snap, SNAP, type DayKey } from '../lib/time';
import { uid } from '../store/reducer';
import { itemDone, itemTitle, refTitle, refTone, toneOfTask } from '../store/select';
import { useNow, useStore } from '../store/store';
import type { Tone, TrayRef } from '../store/types';
import { overTray, useDropZone } from '../ui/drag';
import { useToast } from '../ui/toast';
import { Chip, DuePill, FloatingChip, ItemPopover, toneVars } from './parts';

type Span = { day: DayKey; start: number; length: number };

type Gesture =
  | { kind: 'create'; day: DayKey; anchor: number; x: number; y: number }
  | { kind: 'move'; id: string; grab: number; x: number; y: number; offsetX: number; offsetY: number; width: number; height: number; moved: boolean }
  | { kind: 'resize'; id: string }
  | { kind: 'due'; ref: TrayRef; x: number; y: number; moved: boolean };

const setCursor = (c: string) => {
  document.documentElement.style.cursor = c;
};

interface Props {
  days: DayKey[];
  onDropHint: (hint: string | null) => void;
  onPickDay: (day: DayKey) => void;
}

export function WeekGrid({ days, onDropHint, onPickDay }: Props) {
  const { data, dispatch, undo } = useStore();
  const toast = useToast();
  const now = useNow();
  const today = dayKey(now);

  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Span | null>(null);
  const [slot, setSlot] = useState<Span | null>(null);
  const [dueHover, setDueHover] = useState<DayKey | null>(null);
  const [dueGhost, setDueGhost] = useState<{ title: string; tone: Tone; x: number; y: number } | null>(null);
  const [duePop, setDuePop] = useState<{ ref: TrayRef } | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [float, setFloat] = useState<{ id: string; width: number; height: number; x: number; y: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const landing = useRef<{ id: string; left: number; top: number } | null>(null);
  const trayHint = useRef<string | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const edge = useRef({ v: 0, frame: 0 });

  const items = data.items.filter((i) => days.includes(i.day));

  const hint = (h: string | null) => {
    if (trayHint.current === h) return;
    trayHint.current = h;
    onDropHint(h);
  };

  /** Which day and hour a point is over. */
  const hit = (x: number, y: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const r = grid.getBoundingClientRect();
    const col = Math.min(days.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * days.length)));
    const scroller = scrollRef.current?.getBoundingClientRect();
    const inside = x >= r.left && x <= r.right && y >= Math.max(r.top, scroller?.top ?? r.top) && y <= Math.min(r.bottom, scroller?.bottom ?? r.bottom);
    return { day: days[col], hour: (y - r.top) / HOUR_PX, inside };
  };

  /** Which day's Due strip a point is over, if any. */
  const laneHit = (x: number, y: number): DayKey | null => {
    const lane = laneRef.current;
    if (!lane) return null;
    const r = lane.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    return days[Math.min(days.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * days.length)))];
  };

  const setDue = (ref: TrayRef, due: DayKey | null) => {
    dispatch({ type: 'setDue', ref, due });
    toast(due ? `Due ${dayLabel(due)}` : 'Deadline cleared', { label: 'Undo', run: undo });
  };

  const addSession = (ref: TrayRef, span: Span) => {
    const tone = refTone(data, ref);
    dispatch({
      type: 'addItem',
      item: { id: uid('s'), kind: 'session', taskId: ref.kind === 'task' ? ref.id : null, projectId: ref.kind === 'project' ? ref.id : null, title: '', ...span, tone },
    });
  };

  // Things dragged out of the tray: onto the grid makes a session, onto the Due strip sets a deadline.
  useDropZone({
    move: (_ref, x, y) => {
      const lane = laneHit(x, y);
      if (lane) {
        setDueHover(lane);
        setSlot(null);
        return true;
      }
      const at = hit(x, y);
      if (at?.inside) {
        setDueHover(null);
        const next = { day: at.day, start: clampStart(snap(at.hour - 0.5), 1), length: 1 };
        setSlot((s) => (s && s.day === next.day && s.start === next.start ? s : next));
        return true;
      }
      return false;
    },
    drop: (ref, x, y) => {
      const lane = laneHit(x, y);
      const at = hit(x, y);
      setSlot(null);
      setDueHover(null);
      if (lane) setDue(ref, lane);
      else if (at?.inside) addSession(ref, { day: at.day, start: clampStart(snap(at.hour - 0.5), 1), length: 1 });
    },
    leave: () => {
      setSlot(null);
      setDueHover(null);
    },
  });

  const moveTo = (x: number, y: number) => {
    const g = gesture.current;
    if (!g) return;
    const at = hit(x, y);
    if (!at) return;

    if (g.kind === 'create') {
      const end = snap(at.hour);
      const start = Math.min(g.anchor, end);
      const length = Math.max(SNAP, Math.abs(end - g.anchor));
      setDraft({ day: g.day, start: clampStart(start, length), length: Math.min(length, 12) });
      return;
    }

    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(x - g.x, y - g.y) < 4) return;
      const fx = x - g.offsetX;
      const fy = y - g.offsetY;
      if (!g.moved) {
        g.moved = true;
        setCursor('grabbing');
        setLifted(g.id);
        setSelected(null);
        setFloat({ id: g.id, width: g.width, height: g.height, x: fx, y: fy });
      }
      if (floatRef.current) floatRef.current.style.translate = `${fx}px ${fy}px`;
      const item = data.items.find((i) => i.id === g.id);
      if (!item) return;
      if (overTray(x, y)) {
        hint(item.kind === 'session' ? 'Drop to unschedule' : 'Drop to turn it into a task');
        return;
      }
      hint(null);
      if (!at.inside) return;
      const start = clampStart(snap(at.hour - g.grab), item.length);
      if (item.day === at.day && item.start === start) return;
      dispatch({ type: 'updateItem', id: g.id, patch: { day: at.day, start } }, `move:${g.id}`);
      return;
    }

    if (g.kind === 'resize') {
      const item = data.items.find((i) => i.id === g.id);
      if (!item) return;
      const end = Math.min(24, snap(at.hour));
      dispatch({ type: 'updateItem', id: g.id, patch: { length: Math.max(SNAP, end - item.start) } }, `resize:${g.id}`);
      return;
    }

    // A deadline flag being dragged to another day.
    if (!g.moved && Math.hypot(x - g.x, y - g.y) < 4) return;
    if (!g.moved) {
      g.moved = true;
      setCursor('grabbing');
      setDuePop(null);
    }
    setDueGhost({ title: refTitle(data, g.ref), tone: refTone(data, g.ref), x, y });
    setDueHover(laneHit(x, y));
    hint(overTray(x, y) ? 'Drop to clear the deadline' : null);
  };

  const finish = (x: number, y: number) => {
    const g = gesture.current;
    gesture.current = null;
    stopEdge();
    if (!g) return;
    setCursor('');
    const wasTray = trayHint.current !== null;
    hint(null);

    if (g.kind === 'create') {
      const span = Math.hypot(x - g.x, y - g.y) < 4 || !draft ? { day: g.day, start: clampStart(g.anchor, 1), length: 1 } : draft;
      setDraft(null);
      const id = uid('e');
      dispatch({ type: 'addItem', item: { id, kind: 'event', taskId: null, projectId: null, title: '', ...span, tone: 'green' } });
      setEditing(id);
      return;
    }

    if (g.kind === 'move') {
      setLifted(null);
      if (!g.moved) {
        setSelected((s) => (s === g.id ? null : g.id));
        return;
      }
      const item = data.items.find((i) => i.id === g.id);
      if (wasTray && item) {
        setFloat(null);
        if (item.kind === 'session') {
          dispatch({ type: 'removeItem', id: item.id });
          toast('Unscheduled. The task is still in your list.', { label: 'Undo', run: undo });
        } else {
          dispatch({
            type: 'batch',
            actions: [
              { type: 'removeItem', id: item.id },
              { type: 'addTask', at: 0, task: { id: uid('t'), title: item.title || 'Untitled', done: false, projectId: null, due: null, createdAt: Date.now() } },
            ],
          });
          toast('Moved to your tasks', { label: 'Undo', run: undo });
        }
        return;
      }
      const box = floatRef.current?.getBoundingClientRect();
      if (box) landing.current = { id: g.id, left: box.left, top: box.top };
      setFloat(null);
      return;
    }

    if (g.kind === 'due') {
      const target = laneHit(x, y);
      setDueGhost(null);
      setDueHover(null);
      if (!g.moved) {
        setDuePop((p) => (p && p.ref.id === g.ref.id ? null : { ref: g.ref }));
        return;
      }
      if (wasTray) setDue(g.ref, null);
      else if (target) dispatch({ type: 'setDue', ref: g.ref, due: target });
    }
  };

  const moveRef = useRef(moveTo);
  const finishRef = useRef(finish);
  moveRef.current = moveTo;
  finishRef.current = finish;

  // Scrolls the week while a drag sits near its top or bottom edge.
  const stopEdge = () => {
    cancelAnimationFrame(edge.current.frame);
    edge.current = { v: 0, frame: 0 };
  };
  const runEdge = () => {
    if (edge.current.frame || !edge.current.v) return;
    const step = () => {
      const el = scrollRef.current;
      if (!el || !gesture.current || !edge.current.v) {
        edge.current.frame = 0;
        return;
      }
      el.scrollTop += edge.current.v;
      moveRef.current(pointer.current.x, pointer.current.y);
      edge.current.frame = requestAnimationFrame(step);
    };
    edge.current.frame = requestAnimationFrame(step);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!gesture.current) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      const el = scrollRef.current;
      if (el && gesture.current.kind !== 'due') {
        const r = el.getBoundingClientRect();
        const zone = 44;
        const speed = (d: number) => Math.min(1, (zone - d) / zone) * 14;
        edge.current.v = e.clientY < r.top + zone ? -speed(e.clientY - r.top) : e.clientY > r.bottom - zone ? speed(r.bottom - e.clientY) : 0;
        runEdge();
      }
      moveRef.current(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => finishRef.current(e.clientX, e.clientY);
    const onCancel = () => {
      gesture.current = null;
      stopEdge();
      setCursor('');
      setDraft(null);
      setLifted(null);
      setFloat(null);
      setDueGhost(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      stopEdge();
    };
  }, []);

  // Open on the morning, or just before now when today is on screen.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = days.includes(today) ? Math.max(0, Math.min(hourOf(now) - 1.5, 15)) : 7.5;
    el.scrollTop = hour * HOUR_PX;
    // Only when the range changes.
  }, [days[0], days.length]);

  // The picked-up block tips over as it lifts...
  const floatId = float?.id ?? null;
  useLayoutEffect(() => {
    const inner = floatRef.current?.firstElementChild;
    if (!floatId || !inner || typeof inner.animate !== 'function') return;
    inner.animate([{ rotate: '0deg' }, { rotate: '-2deg' }], { duration: 180, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  }, [floatId]);

  // ...and on drop it flies into its slot and straightens out.
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

  // A selected block: Escape lets go, Delete removes it, a click elsewhere closes it.
  useEffect(() => {
    if (!selected && !duePop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setDuePop(null);
        return;
      }
      if (selected && (e.key === 'Backspace' || e.key === 'Delete') && !(e.target as HTMLElement)?.closest?.('input, textarea')) {
        e.preventDefault();
        dispatch({ type: 'removeItem', id: selected });
        toast('Deleted', { label: 'Undo', run: undo });
        setSelected(null);
      }
    };
    const onDown = () => {
      setSelected(null);
      setDuePop(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [selected, duePop, dispatch, toast, undo]);

  const startCreate = (e: React.PointerEvent) => {
    if (e.button !== 0 || editing) return;
    const at = hit(e.clientX, e.clientY);
    if (!at) return;
    const anchor = Math.floor(at.hour / SNAP) * SNAP;
    gesture.current = { kind: 'create', day: at.day, anchor, x: e.clientX, y: e.clientY };
    setDraft({ day: at.day, start: clampStart(anchor, SNAP), length: SNAP });
  };

  // Deadlines per day, for the Due strip.
  const dues = (day: DayKey) => [
    ...data.projects.filter((p) => p.due === day).map((p) => ({ ref: { kind: 'project', id: p.id } as TrayRef, title: p.name, tone: p.tone, done: false })),
    ...data.tasks.filter((t) => t.due === day).map((t) => ({ ref: { kind: 'task', id: t.id } as TrayRef, title: t.title, tone: toneOfTask(data, t), done: t.done })),
  ];

  const selectedItem = items.find((i) => i.id === selected) ?? null;
  const floatItem = float ? data.items.find((i) => i.id === float.id) : undefined;
  const nowHour = hourOf(now);

  return (
    <div className="week" style={{ '--days': days.length } as CSSProperties}>
      <div className="week-head">
        <div className="gutter-cell" />
        <div className="week-cols">
          {days.map((d) => (
            <button key={d} type="button" className={`day-head${d === today ? ' is-today' : ''}`} onClick={() => onPickDay(d)} title="Show this day">
              {dayLabel(d)}
            </button>
          ))}
        </div>
      </div>

      <div className="due-row">
        <div className="gutter-cell due-label">Due</div>
        <div className="week-cols" ref={laneRef}>
          {days.map((d) => (
            <div key={d} className={`due-cell${dueHover === d ? ' is-over' : ''}`}>
              {dues(d).map((x) => (
                <div key={`${x.ref.kind}:${x.ref.id}`} className="due-wrap">
                  <DuePill
                    title={x.title}
                    tone={x.tone}
                    done={x.done}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0) return;
                      gesture.current = { kind: 'due', ref: x.ref, x: e.clientX, y: e.clientY, moved: false };
                    }}
                  />
                  {duePop && duePop.ref.id === x.ref.id && (
                    <div className="due-pop" onPointerDown={(e) => e.stopPropagation()}>
                      <p className="popover-title">{x.title}</p>
                      <p className="due-pop-when">Due {dayLabel(d)}</p>
                      <div className="due-pop-actions">
                        {x.ref.kind === 'task' && (
                          <button
                            type="button"
                            className="pill-btn"
                            onClick={() => {
                              dispatch({ type: 'updateTask', id: x.ref.id, patch: { done: !x.done } });
                              setDuePop(null);
                            }}
                          >
                            {x.done ? 'Not done' : 'Mark done'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="pill-btn"
                          onClick={() => {
                            setDue(x.ref, null);
                            setDuePop(null);
                          }}
                        >
                          Clear deadline
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="week-scroll" ref={scrollRef}>
        <div className="week-body">
          <div className="gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <p key={h} className="gutter-hour" style={{ height: HOUR_PX }}>
                {h === 0 ? '' : formatHour(h)}
              </p>
            ))}
          </div>
          <div ref={gridRef} onPointerDown={startCreate} className="grid" style={{ height: 24 * HOUR_PX }}>
            {days.map((d) => {
              const dayItems = items.filter((i) => i.day === d);
              const places = placeBlocks(dayItems);
              return (
                <div key={d} className={`day${d === today ? ' is-today' : ''}`}>
                  {dayItems.map((item) => (
                    <Chip
                      key={item.id}
                      item={item}
                      title={itemTitle(data, item)}
                      done={itemDone(data, item)}
                      place={places.get(item.id) ?? { depth: 0, lane: 0, lanes: 1 }}
                      selected={selected === item.id}
                      editing={editing === item.id}
                      lifted={lifted === item.id}
                      busy={lifted !== null}
                      onMoveStart={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0 || editing === item.id) return;
                        const at = hit(e.clientX, e.clientY);
                        const r = e.currentTarget.getBoundingClientRect();
                        gesture.current = {
                          kind: 'move',
                          id: item.id,
                          grab: (at?.hour ?? item.start) - item.start,
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
                        gesture.current = { kind: 'resize', id: item.id };
                        setCursor('ns-resize');
                        setSelected(null);
                      }}
                      onEdit={() => setEditing(item.id)}
                      onTitleDone={(title) => {
                        setEditing(null);
                        if (title === null) dispatch({ type: 'removeItem', id: item.id });
                        else dispatch({ type: 'updateItem', id: item.id, patch: { title } });
                      }}
                    />
                  ))}

                  {selectedItem && selectedItem.day === d && (
                    <ItemPopover
                      item={selectedItem}
                      title={itemTitle(data, selectedItem)}
                      done={itemDone(data, selectedItem)}
                      flip={days.length > 1 && days.indexOf(d) >= days.length - 2}
                      onTone={(tone) => dispatch({ type: 'updateItem', id: selectedItem.id, patch: { tone } })}
                      onToggleDone={() => {
                        const done = !itemDone(data, selectedItem);
                        if (selectedItem.taskId) dispatch({ type: 'updateTask', id: selectedItem.taskId, patch: { done } });
                        else if (selectedItem.projectId)
                          dispatch({
                            type: 'batch',
                            actions: data.tasks.filter((t) => t.projectId === selectedItem.projectId).map((t) => ({ type: 'updateTask' as const, id: t.id, patch: { done } })),
                          });
                      }}
                      onDelete={() => {
                        dispatch({ type: 'removeItem', id: selectedItem.id });
                        toast('Deleted', { label: 'Undo', run: undo });
                        setSelected(null);
                      }}
                    />
                  )}

                  {draft && draft.day === d && (
                    <div className="draft" style={{ top: draft.start * HOUR_PX + 1, height: draft.length * HOUR_PX - 3 }}>
                      <p>{formatRange(draft.start, draft.length)}</p>
                    </div>
                  )}

                  {slot && slot.day === d && (
                    <div className="slot" style={{ top: slot.start * HOUR_PX + 1, height: slot.length * HOUR_PX - 3 }}>
                      <p>{formatRange(slot.start, slot.length)}</p>
                    </div>
                  )}

                  {d === today && (
                    <div className="now" style={{ top: nowHour * HOUR_PX }}>
                      <span />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dueGhost && (
        <div className="tray-ghost is-due" style={{ left: dueGhost.x + 12, top: dueGhost.y + 8, ...toneVars(dueGhost.tone) }}>
          <span className="chip-bar" />
          <p>{dueGhost.title}</p>
        </div>
      )}
      {float && floatItem && <FloatingChip item={floatItem} title={itemTitle(data, floatItem)} width={float.width} height={float.height} x={float.x} y={float.y} floatRef={floatRef} />}
    </div>
  );
}
