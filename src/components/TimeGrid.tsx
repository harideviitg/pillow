import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { atMinutes, formatDuration, formatHour, formatTime, minutesIntoDay, MINUTE, placeOverlaps, sameDay, snap, startOfDay, weekdayName } from '../domain/dates';
import type { Block, Project } from '../domain/types';
import { projectColor } from './ui';

const SNAP = 15;
const LONG_PRESS = 260;

type Gesture =
  | { mode: 'create'; day: number; anchor: number; start: number; end: number }
  | { mode: 'move'; id: string; day: number; start: number; end: number; grabDay: number; grabMin: number; origDay: number; origStart: number; dur: number }
  | { mode: 'resize'; id: string; day: number; start: number; end: number };

export interface TimeGridProps {
  days: number[];
  blocks: Block[];
  projects: Project[];
  now: number;
  selectedId: string | null;
  hourHeight: number;
  onSelect: (id: string | null) => void;
  onCreate: (start: number, end: number) => void;
  onChange: (id: string, start: number, end: number) => void;
}

/** Days side by side on an hour grid: drag empty space to add a block, drag a block to move it, drag its bottom edge to resize. */
export function TimeGrid(props: TimeGridProps) {
  const { days, blocks, now, hourHeight: H } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const autoScroll = useRef({ v: 0, frame: 0, last: { x: 0, y: 0 } });

  const setG = (g: Gesture | null) => {
    gestureRef.current = g;
    setGesture(g);
  };

  // Open at 8 AM, or a little before now when today is on screen.
  const firstDay = days[0];
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = days.some((d) => sameDay(d, now));
    el.scrollTop = (showsToday ? Math.max(0, Math.min(minutesIntoDay(now) / 60 - 1.5, 16)) : 7.5) * H;
    // Only when the range changes, not on every tick.
  }, [firstDay, days.length, H]);

  const point = (x: number, y: number) => {
    const rect = colsRef.current!.getBoundingClientRect();
    const day = Math.min(days.length - 1, Math.max(0, Math.floor((x - rect.left) / (rect.width / days.length))));
    return { day, minutes: ((y - rect.top) / H) * 60 };
  };

  const clamp = (m: number, lo = 0, hi = 24 * 60) => Math.min(hi, Math.max(lo, m));

  const update = (x: number, y: number) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = point(x, y);
    if (g.mode === 'create') {
      const cur = clamp(snap(p.minutes, SNAP));
      const start = Math.min(g.anchor, cur);
      setG({ ...g, start, end: clamp(Math.max(g.anchor + SNAP, cur, start + SNAP)) });
    } else if (g.mode === 'move') {
      const day = Math.min(days.length - 1, Math.max(0, g.origDay + (p.day - g.grabDay)));
      const start = clamp(snap(g.origStart + (p.minutes - g.grabMin), SNAP), 0, 24 * 60 - g.dur);
      setG({ ...g, day, start, end: start + g.dur });
    } else {
      setG({ ...g, end: clamp(snap(p.minutes, SNAP), g.start + SNAP) });
    }
  };

  const runAutoScroll = () => {
    const a = autoScroll.current;
    if (a.frame || !a.v) return;
    const step = () => {
      const el = scrollRef.current;
      if (!el || !gestureRef.current || !a.v) {
        a.frame = 0;
        return;
      }
      el.scrollTop += a.v;
      update(a.last.x, a.last.y);
      a.frame = requestAnimationFrame(step);
    };
    a.frame = requestAnimationFrame(step);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    const target = e.target as HTMLElement;
    const blockEl = target.closest<HTMLElement>('[data-block-id]');
    const resize = !!target.closest('.cal-resize');
    const start = { x: e.clientX, y: e.clientY };
    const p = point(e.clientX, e.clientY);
    const isTouch = e.pointerType === 'touch';
    let active = false;
    let timer = 0;

    const begin = () => {
      active = true;
      if (isTouch && navigator.vibrate) navigator.vibrate(8);
      if (blockEl) {
        const b = blocks.find((x) => x.id === blockEl.dataset.blockId);
        if (!b) return;
        props.onSelect(b.id);
        const dayIndex = days.findIndex((d) => sameDay(d, b.start));
        const s = minutesIntoDay(b.start);
        const dur = Math.max(SNAP, Math.round((b.end - b.start) / MINUTE));
        if (resize) setG({ mode: 'resize', id: b.id, day: dayIndex, start: s, end: s + dur });
        else setG({ mode: 'move', id: b.id, day: dayIndex, start: s, end: s + dur, grabDay: p.day, grabMin: p.minutes, origDay: dayIndex, origStart: s, dur });
      } else {
        const anchor = Math.floor(p.minutes / SNAP) * SNAP;
        setG({ mode: 'create', day: p.day, anchor, start: anchor, end: anchor + SNAP * 2 });
      }
      document.documentElement.classList.add('is-dragging');
    };

    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!active) {
        if (isTouch) {
          if (dist > 8) cleanup();
          return;
        }
        if (dist < 3) return;
        begin();
      }
      autoScroll.current.last = { x: ev.clientX, y: ev.clientY };
      const rect = scrollRef.current!.getBoundingClientRect();
      const edge = 40;
      const top = ev.clientY - rect.top;
      const bottom = rect.bottom - ev.clientY;
      const speed = (d: number) => Math.min(1.4, (edge - d) / edge) * 14;
      autoScroll.current.v = top < edge ? -speed(top) : bottom < edge ? speed(bottom) : 0;
      runAutoScroll();
      update(ev.clientX, ev.clientY);
    };

    const stopClick = (ev: MouseEvent) => ev.stopPropagation();

    const up = () => {
      const g = gestureRef.current;
      cleanup();
      if (!active) {
        props.onSelect(blockEl ? blockEl.dataset.blockId! : null);
        return;
      }
      // The release would otherwise click whatever it landed on.
      window.addEventListener('click', stopClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0);
      if (!g) return;
      const day = days[g.day];
      if (g.mode === 'create') props.onCreate(atMinutes(day, g.start), atMinutes(day, g.end));
      else props.onChange(g.id, atMinutes(day, g.start), atMinutes(day, g.end));
      setG(null);
    };

    const cancel = () => {
      cleanup();
      setG(null);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && active) {
        ev.preventDefault();
        ev.stopPropagation();
        cancel();
      }
    };
    const blockTouch = (ev: TouchEvent) => {
      if (active) ev.preventDefault();
    };

    function cleanup() {
      window.clearTimeout(timer);
      cancelAnimationFrame(autoScroll.current.frame);
      autoScroll.current = { v: 0, frame: 0, last: { x: 0, y: 0 } };
      document.documentElement.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('touchmove', blockTouch);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    if (isTouch) {
      document.addEventListener('touchmove', blockTouch, { passive: false });
      timer = window.setTimeout(begin, LONG_PRESS);
    }
  };

  useEffect(() => () => cancelAnimationFrame(autoScroll.current.frame), []);

  const today = startOfDay(now);
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className={`tg${gesture ? ' is-gesturing' : ''}`} style={{ ['--hour' as string]: `${H}px`, ['--days' as string]: days.length }}>
      <div className="tg-head">
        <div className="tg-gutter-head" />
        {days.map((d) => (
          <div key={d} className={`tg-day-head${sameDay(d, today) ? ' is-today' : ''}`}>
            <span className="tg-weekday">{weekdayName(d)}</span>
            <span className="tg-date">{new Date(d).getDate()}</span>
          </div>
        ))}
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ height: 24 * H }}>
          <div className="tg-gutter" aria-hidden="true">
            {hours.map((h) =>
              h > 0 ? (
                <div key={h} className="tg-hour" style={{ top: h * H }}>
                  {formatHour(atMinutes(days[0], h * 60))}
                </div>
              ) : null,
            )}
          </div>
          <div
            className="tg-cols"
            ref={colsRef}
            onPointerDown={onPointerDown}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('[data-block-id]')) return;
              const p = point(e.clientX, e.clientY);
              const start = Math.floor(p.minutes / 30) * 30;
              props.onCreate(atMinutes(days[p.day], start), atMinutes(days[p.day], start + 60));
            }}
          >
            {days.map((d, i) => (
              <DayColumn key={d} day={d} index={i} {...props} gesture={gesture} isToday={sameDay(d, now)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({ day, index, blocks, projects, now, selectedId, hourHeight: H, gesture, isToday }: TimeGridProps & { day: number; index: number; gesture: Gesture | null; isToday: boolean }) {
  // The block being dragged shows where it would land.
  const moving = gesture && gesture.mode !== 'create' ? gesture : null;
  const list = blocks
    .filter((b) => (moving?.id === b.id ? moving.day === index : sameDay(b.start, day)))
    .map((b) => (moving?.id === b.id ? { ...b, start: atMinutes(day, moving.start), end: atMinutes(day, moving.end) } : b));
  const placed = placeOverlaps(list);

  return (
    <div className={`tg-col${isToday ? ' is-today' : ''}`}>
      {list.map((b) => {
        const pos = placed.get(b.id) ?? { col: 0, cols: 1 };
        const project = projects.find((p) => p.id === b.projectId) ?? null;
        const short = b.end - b.start <= 30 * MINUTE;
        return (
          <button
            key={b.id}
            type="button"
            data-block-id={b.id}
            className={`cal-block${selectedId === b.id ? ' is-selected' : ''}${moving?.id === b.id ? ' is-dragging' : ''}${short ? ' is-short' : ''}`}
            style={{
              top: (minutesIntoDay(b.start) / 60) * H,
              height: Math.max(18, ((b.end - b.start) / (60 * MINUTE)) * H - 2),
              left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`,
              width: `calc(${100 / pos.cols}% - 5px)`,
              ['--block' as string]: projectColor(b.projectId),
            }}
            aria-label={`${b.title || 'Untitled block'}, ${formatTime(b.start)} to ${formatTime(b.end)}`}
          >
            {/* Buttons centre overflowing content, so the contents are pinned to the top. */}
            <span className="cal-block-inner">
              <span className="cal-block-title">{b.title || 'Untitled'}</span>
              {!short && (
                <span className="cal-block-time">
                  {formatTime(b.start)}, {formatDuration(b.end - b.start)}
                  {project ? ` · ${project.name}` : ''}
                </span>
              )}
            </span>
            <span className="cal-resize" aria-hidden="true" />
          </button>
        );
      })}

      {gesture?.mode === 'create' && gesture.day === index && (
        <div className="cal-block is-draft" style={{ top: (gesture.start / 60) * H, height: ((gesture.end - gesture.start) / 60) * H - 2, left: 2, width: 'calc(100% - 5px)' }} aria-hidden="true">
          <span className="cal-block-inner">
            <span className="cal-block-title">New block</span>
            <span className="cal-block-time">
              {formatTime(atMinutes(day, gesture.start))} to {formatTime(atMinutes(day, gesture.end))}
            </span>
          </span>
        </div>
      )}

      {isToday && (
        <div className="tg-now" style={{ top: (minutesIntoDay(now) / 60) * H }} aria-hidden="true">
          <span className="tg-now-dot" />
        </div>
      )}
    </div>
  );
}
