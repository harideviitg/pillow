import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addDays,
  atMinutes,
  formatDuration,
  formatHour,
  formatTime,
  minutesIntoDay,
  MINUTE,
  placeOverlaps,
  sameDay,
  snap,
  startOfDay,
  weekdayName,
  zoneName,
  type RoundEvent,
} from '../../domain/calendar';
import type { Meeting, Person } from '../../domain/types';
import { useDropTarget } from '../../dnd/DragProvider';
import { Icon } from '../Icon';
import { initials } from '../ui';

const SNAP = 15;
const LONG_PRESS = 260;

type Gesture =
  | { mode: 'create'; day: number; anchor: number; start: number; end: number }
  | { mode: 'move'; id: string; day: number; start: number; end: number; grabDay: number; grabMin: number; origDay: number; origStart: number; dur: number }
  | { mode: 'resize'; id: string; day: number; start: number; end: number }
  | { mode: 'deadline'; id: string; day: number; start: number; end: number };

export interface TimeGridProps {
  days: number[];
  meetings: Meeting[];
  events: RoundEvent[];
  people: Person[];
  now: number;
  selectedId: string | null;
  hourHeight: number;
  secondaryZone: string | null;
  projectColor: (projectId: string | null) => string;
  onSelect: (id: string | null) => void;
  onCreate: (start: number, end: number, attendeeIds?: string[]) => void;
  onChange: (id: string, start: number, end: number) => void;
  onDeadline: (eventId: string, due: number) => void;
  onAddAttendee: (meetingId: string, personId: string) => void;
}

export function TimeGrid(props: TimeGridProps) {
  const { days, meetings, events, now, selectedId, hourHeight: H, secondaryZone } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const autoScroll = useRef({ v: 0, frame: 0, last: { x: 0, y: 0 } });

  const setG = (g: Gesture | null) => {
    gestureRef.current = g;
    setGesture(g);
  };

  // Start the day at 8 AM, or an hour before now when today is on screen.
  const firstDay = days[0];
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = days.some((d) => sameDay(d, now));
    const hour = showsToday ? Math.max(0, Math.min(minutesIntoDay(now) / 60 - 1.5, 16)) : 7.5;
    el.scrollTop = hour * H;
    // Only when the range changes, not on every tick.
  }, [firstDay, days.length, H]);

  // Bring a meeting opened from elsewhere (a link, the agenda) into view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!selectedId || !el) return;
    const id = requestAnimationFrame(() => {
      const block = [...el.querySelectorAll<HTMLElement>('[data-meeting-id]')].find((b) => b.dataset.meetingId === selectedId);
      if (!block || typeof el.scrollTo !== 'function') return;
      const top = block.offsetTop;
      const bottom = top + block.offsetHeight;
      if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight) {
        el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selectedId, firstDay]);

  const point = (x: number, y: number) => {
    const rect = colsRef.current!.getBoundingClientRect();
    const colW = rect.width / days.length;
    const day = Math.min(days.length - 1, Math.max(0, Math.floor((x - rect.left) / colW)));
    const minutes = ((y - rect.top) / H) * 60;
    return { day, minutes };
  };

  const clampMin = (m: number, lo = 0, hi = 24 * 60) => Math.min(hi, Math.max(lo, m));

  const update = (x: number, y: number) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = point(x, y);
    if (g.mode === 'create') {
      const cur = clampMin(snap(p.minutes, SNAP));
      const start = Math.min(g.anchor, cur);
      const end = Math.max(g.anchor + SNAP, cur, start + SNAP);
      setG({ ...g, start, end: clampMin(end) });
    } else if (g.mode === 'move') {
      const day = Math.min(days.length - 1, Math.max(0, g.origDay + (p.day - g.grabDay)));
      const start = clampMin(snap(g.origStart + (p.minutes - g.grabMin), SNAP), 0, 24 * 60 - g.dur);
      setG({ ...g, day, start, end: start + g.dur });
    } else if (g.mode === 'resize') {
      const end = clampMin(snap(p.minutes, SNAP), g.start + SNAP);
      setG({ ...g, end });
    } else {
      const start = clampMin(snap(p.minutes, 60), 60, 24 * 60 - 60);
      setG({ ...g, day: p.day, start, end: start });
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
    if (!colsRef.current?.contains(target)) return;
    const eventEl = target.closest<HTMLElement>('[data-meeting-id]');
    const deadlineEl = target.closest<HTMLElement>('[data-deadline-id]');
    const resize = !!target.closest('.cal-resize');
    const start = { x: e.clientX, y: e.clientY };
    const p = point(e.clientX, e.clientY);
    const isTouch = e.pointerType === 'touch';
    let active = false;
    let timer = 0;

    const begin = () => {
      active = true;
      if (isTouch && navigator.vibrate) navigator.vibrate(8);
      if (deadlineEl) {
        const ev = events.find((x) => x.id === deadlineEl.dataset.deadlineId);
        if (!ev || ev.kind !== 'deadline') return;
        const m = minutesIntoDay(ev.at);
        setG({ mode: 'deadline', id: ev.id, day: p.day, start: m, end: m });
      } else if (eventEl) {
        const m = meetings.find((x) => x.id === eventEl.dataset.meetingId);
        if (!m) return;
        props.onSelect(m.id);
        const dayIndex = days.findIndex((d) => sameDay(d, m.start));
        const s = minutesIntoDay(m.start);
        const dur = Math.max(SNAP, Math.round((m.end - m.start) / MINUTE));
        if (resize) setG({ mode: 'resize', id: m.id, day: dayIndex, start: s, end: s + dur });
        else setG({ mode: 'move', id: m.id, day: dayIndex, start: s, end: s + dur, grabDay: p.day, grabMin: p.minutes, origDay: dayIndex, origStart: s, dur });
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

    const up = () => {
      const g = gestureRef.current;
      cleanup();
      if (!active) {
        if (eventEl) props.onSelect(eventEl.dataset.meetingId!);
        else if (!deadlineEl) props.onSelect(null);
        return;
      }
      // The release would otherwise click whatever it landed on.
      window.addEventListener('click', stopClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0);
      if (!g) return;
      const day = days[g.day];
      if (g.mode === 'create') props.onCreate(atMinutes(day, g.start), atMinutes(day, g.end));
      else if (g.mode === 'move' || g.mode === 'resize') props.onChange(g.id, atMinutes(day, g.start), atMinutes(day, g.end));
      else props.onDeadline(g.id, atMinutes(day, g.start));
      setG(null);
    };
    const stopClick = (ev: MouseEvent) => ev.stopPropagation();

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
  const allDay = allDayRows(days, events);

  return (
    <div className={`tg${gesture ? ' is-gesturing' : ''}`} style={{ ['--hour' as string]: `${H}px`, ['--days' as string]: days.length }}>
      <div className="tg-head">
        <div className="tg-gutter-head">
          {secondaryZone && <span className="tz-label">{zoneName(secondaryZone, days[0])}</span>}
          <span className="tz-label">{zoneName(Intl.DateTimeFormat().resolvedOptions().timeZone, days[0])}</span>
        </div>
        {days.map((d) => (
          <div key={d} className={`tg-day-head${sameDay(d, today) ? ' is-today' : ''}`}>
            <span className="tg-weekday">{weekdayName(d)}</span>
            <span className="tg-date">{new Date(d).getDate()}</span>
          </div>
        ))}
      </div>

      {allDay.rows > 0 && (
        <div className="tg-allday" style={{ height: allDay.rows * 26 + 8 }}>
          <div className="tg-gutter-head tg-allday-label">All day</div>
          <div className="tg-allday-lane">
            {allDay.items.map((item) => (
              <div
                key={item.ev.id}
                className={`allday-item kind-${item.ev.kind}`}
                style={{
                  left: `calc(${(item.from / days.length) * 100}% + 2px)`,
                  width: `calc(${((item.to - item.from + 1) / days.length) * 100}% - 4px)`,
                  top: item.row * 26 + 4,
                }}
                title={`${item.ev.project}: ${item.ev.title}`}
              >
                <span className="project-dot" style={{ background: props.projectColor(item.ev.projectId) }} />
                {item.ev.kind === 'window' ? `${item.ev.title} review window` : item.ev.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ height: 24 * H }}>
          <div className="tg-gutter" aria-hidden="true">
            {hours.map((h) => (
              <div key={h} className="tg-hour" style={{ top: h * H }}>
                {h > 0 && (
                  <>
                    {secondaryZone && <span className="tg-hour-alt">{formatHour(atMinutes(days[0], h * 60), secondaryZone)}</span>}
                    <span>{formatHour(atMinutes(days[0], h * 60))}</span>
                  </>
                )}
              </div>
            ))}
            {days.some((d) => sameDay(d, now)) && (
              <div className="tg-now-label" style={{ top: (minutesIntoDay(now) / 60) * H }}>
                {formatTime(now)}
              </div>
            )}
          </div>
          <div className="tg-cols" ref={colsRef} onPointerDown={onPointerDown} onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-meeting-id], [data-deadline-id]')) return;
            const p = point(e.clientX, e.clientY);
            const start = Math.floor(p.minutes / 30) * 30;
            props.onCreate(atMinutes(days[p.day], start), atMinutes(days[p.day], start + 30));
          }}>
            {days.map((d, i) => (
              <DayColumn key={d} day={d} index={i} {...props} gesture={gesture} isToday={sameDay(d, now)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  day,
  index,
  meetings,
  events,
  people,
  now,
  selectedId,
  hourHeight: H,
  gesture,
  isToday,
  projectColor,
  onCreate,
  onAddAttendee,
}: TimeGridProps & { day: number; index: number; gesture: Gesture | null; isToday: boolean }) {
  const colRef = useRef<HTMLElement | null>(null);
  const target = useDropTarget(`cal-col:${day}`, {
    accepts: (p) => p.kind === 'person',
    onDrop: (p, pt) => {
      if (p.kind !== 'person' || !colRef.current) return false;
      const rect = colRef.current.getBoundingClientRect();
      const start = Math.min(23 * 60 + 30, Math.max(0, Math.floor((((pt.y - rect.top) / H) * 60) / 30) * 30));
      onCreate(atMinutes(day, start), atMinutes(day, start + 30), [p.personId]);
    },
  });

  // Meetings on this day, with the one being dragged shown where it would land.
  const moving = gesture && (gesture.mode === 'move' || gesture.mode === 'resize') ? gesture : null;
  const list = meetings
    .filter((m) => (moving?.id === m.id ? moving.day === index : sameDay(m.start, day)))
    .map((m) => (moving?.id === m.id ? { ...m, start: atMinutes(day, moving.start), end: atMinutes(day, moving.end) } : m));
  const placed = placeOverlaps(list.map((m) => ({ id: m.id, start: m.start, end: m.end })));
  const deadlines = events.filter((e): e is Extract<RoundEvent, { kind: 'deadline' }> => e.kind === 'deadline');

  return (
    <div
      ref={(el) => {
        colRef.current = el;
        target.ref(el);
      }}
      {...target.dropProps}
      className={`tg-col${isToday ? ' is-today' : ''}${target.isOver ? ' is-over' : ''}`}
    >
      {list.map((m) => {
        const pos = placed.get(m.id) ?? { col: 0, cols: 1 };
        const top = (minutesIntoDay(m.start) / 60) * H;
        const height = Math.max(18, ((m.end - m.start) / (60 * MINUTE)) * H - 2);
        return (
          <EventBlock
            key={m.id}
            meeting={m}
            people={people}
            selected={selectedId === m.id}
            dragging={moving?.id === m.id}
            color={projectColor(m.projectId)}
            style={{ top, height, left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`, width: `calc(${100 / pos.cols}% - 5px)` }}
            onAddAttendee={onAddAttendee}
          />
        );
      })}

      {gesture?.mode === 'create' && gesture.day === index && (
        <div
          className="cal-event kind-draft is-dragging"
          style={{ top: (gesture.start / 60) * H, height: ((gesture.end - gesture.start) / 60) * H - 2, left: 2, width: 'calc(100% - 5px)' }}
          aria-hidden="true"
        >
          <span className="cal-event-inner">
            <span className="cal-event-title">New meeting</span>
            <span className="cal-event-time">
              {formatTime(atMinutes(day, gesture.start))} to {formatTime(atMinutes(day, gesture.end))}
            </span>
          </span>
        </div>
      )}

      {deadlines.map((ev) => {
        const dragged = gesture?.mode === 'deadline' && gesture.id === ev.id ? gesture : null;
        const onThisDay = dragged ? dragged.day === index : sameDay(ev.at, day);
        if (!onThisDay) return null;
        const minutes = dragged ? dragged.start : minutesIntoDay(ev.at);
        const at = atMinutes(day, minutes);
        return (
          <div
            key={ev.id}
            data-deadline-id={ev.id}
            className={`cal-deadline${dragged ? ' is-dragging' : ''}`}
            style={{ top: (minutes / 60) * H }}
            title="Drag to move the deadline"
          >
            <span className="cal-deadline-pill">
              <Icon name="clock" size={12} strokeWidth={2.2} />
              {ev.title}
              {dragged ? `, ${formatTime(at)}` : ''}
            </span>
          </div>
        );
      })}

      {isToday && (
        <div className="tg-now" style={{ top: (minutesIntoDay(now) / 60) * H }} aria-hidden="true">
          <span className="tg-now-dot" />
        </div>
      )}
    </div>
  );
}

function EventBlock({
  meeting,
  people,
  selected,
  dragging,
  color,
  style,
  onAddAttendee,
}: {
  meeting: Meeting;
  people: Person[];
  selected: boolean;
  dragging: boolean;
  color: string;
  style: React.CSSProperties;
  onAddAttendee: (meetingId: string, personId: string) => void;
}) {
  const target = useDropTarget(`cal-ev:${meeting.id}`, {
    accepts: (p) => p.kind === 'person' && !meeting.attendeeIds.includes(p.personId),
    onDrop: (p) => {
      if (p.kind === 'person') onAddAttendee(meeting.id, p.personId);
    },
  });
  const short = (meeting.end - meeting.start) / MINUTE <= 30;
  const attendees = meeting.attendeeIds.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p);

  return (
    <button
      type="button"
      ref={target.ref}
      {...target.dropProps}
      data-meeting-id={meeting.id}
      className={`cal-event kind-${meeting.kind}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${short ? ' is-short' : ''}${
        target.isOver ? ' is-over' : ''
      }`}
      style={style}
      aria-pressed={selected}
      aria-label={`${meeting.title}, ${formatTime(meeting.start)} to ${formatTime(meeting.end)}`}
    >
      {/* Buttons centre overflowing content, so the contents are pinned to the top here. */}
      <span className="cal-event-inner">
        <span className="cal-event-title">
          {meeting.projectId && <span className="project-dot" style={{ background: color }} />}
          <span className="cal-event-name">{meeting.title || 'Untitled'}</span>
        </span>
        {!short && (
          <span className="cal-event-time">
            {formatTime(meeting.start)}, {formatDuration(meeting.end - meeting.start)}
          </span>
        )}
        {!short && attendees.length > 0 && (
          <span className="cal-event-people">
            {attendees.slice(0, 4).map((p) => (
              <span key={p.id} className="avatar avatar-xs">
                {initials(p.name)}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="cal-resize" aria-hidden="true" />
    </button>
  );
}

/** Round windows and approvals for the all-day lane, packed into rows. */
function allDayRows(days: number[], events: RoundEvent[]) {
  const first = days[0];
  const last = addDays(days[days.length - 1], 1);
  const indexOf = (ts: number) => days.findIndex((d) => sameDay(d, ts));
  const items: { ev: RoundEvent; from: number; to: number; row: number }[] = [];
  const rowEnds: number[] = [];
  type Span = { ev: RoundEvent; from: number; to: number };
  const candidates = events
    .map((ev): Span | null => {
      if (ev.kind === 'window') {
        if (ev.end < first || ev.start >= last) return null;
        const from = ev.start < first ? 0 : indexOf(ev.start);
        const to = ev.end >= last ? days.length - 1 : indexOf(ev.end);
        return { ev, from, to };
      }
      if (ev.kind === 'approved') {
        const i = indexOf(ev.at);
        return i < 0 ? null : { ev, from: i, to: i };
      }
      return null;
    })
    .filter((x): x is Span => !!x && x.from >= 0 && x.to >= 0)
    .sort((a, b) => a.from - b.from);
  for (const c of candidates) {
    let row = rowEnds.findIndex((end) => end < c.from);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(c.to);
    } else rowEnds[row] = c.to;
    items.push({ ...c, row });
  }
  return { items, rows: rowEnds.length };
}
