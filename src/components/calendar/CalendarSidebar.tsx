import { useMemo } from 'react';
import {
  addDays,
  addMonths,
  formatClock,
  formatDayLong,
  formatTime,
  localZone,
  monthGridDays,
  monthName,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  zoneName,
  type RoundEvent,
} from '../../domain/calendar';
import type { Meeting, Person, Project } from '../../domain/types';
import { useDraggable } from '../../dnd/DragProvider';
import { useNow } from '../../state/store';
import { PersonGhost } from '../BlocksPanel';
import { GripIcon, Icon } from '../Icon';
import { initials } from '../ui';

export const ZONES = [
  'Asia/Kolkata',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

/** A ticking clock, one second at a time. */
export function LiveClock({ secondaryZone }: { secondaryZone: string | null }) {
  const now = useNow(1000);
  const zone = localZone();
  return (
    <div className="live-clock">
      <span className="live-time">{formatClock(now)}</span>
      <span className="live-date">
        {formatDayLong(now)}, {zoneName(zone, now)}
      </span>
      {secondaryZone && secondaryZone !== zone && (
        <span className="live-alt">
          <Icon name="globe" size={13} />
          {formatTime(now, secondaryZone)} in {secondaryZone.split('/').pop()!.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
}

export function MiniMonth({
  month,
  selectedDays,
  now,
  busyDays,
  onMonth,
  onPick,
}: {
  month: number;
  selectedDays: number[];
  now: number;
  busyDays: Set<number>;
  onMonth: (month: number) => void;
  onPick: (day: number) => void;
}) {
  const days = monthGridDays(month);
  const m = new Date(month).getMonth();
  const selected = new Set(selectedDays.map(startOfDay));
  return (
    <div className="mini-month">
      <div className="mini-month-head">
        <span className="mini-month-title">
          {monthName(month, true)} {new Date(month).getFullYear()}
        </span>
        <button type="button" className="icon-btn icon-btn-sm" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          <Icon name="chevronLeft" size={15} />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
      <div className="mini-month-grid" role="grid" aria-label={`${monthName(month, true)} ${new Date(month).getFullYear()}`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="mini-dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const d = new Date(day);
          const cls = ['mini-day'];
          if (d.getMonth() !== m) cls.push('is-outside');
          if (sameDay(day, now)) cls.push('is-today');
          if (selected.has(day)) cls.push('is-selected');
          if (busyDays.has(day)) cls.push('is-busy');
          return (
            <button key={day} type="button" className={cls.join(' ')} aria-label={d.toDateString()} aria-pressed={selected.has(day)} onClick={() => onPick(day)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** What's next, counting down live. */
export function Agenda({ meetings, events, onOpen }: { meetings: Meeting[]; events: RoundEvent[]; onOpen: (item: { meetingId?: string; at: number }) => void }) {
  const now = useNow(1000);
  const horizon = addDays(startOfDay(now), 8);
  const items = useMemo(() => {
    const list: { key: string; title: string; at: number; end: number; kind: string; meetingId?: string; sub: string }[] = [];
    for (const m of meetings) {
      if (m.end > now && m.start < horizon) list.push({ key: m.id, title: m.title || 'Untitled', at: m.start, end: m.end, kind: m.kind, meetingId: m.id, sub: formatTime(m.start) });
    }
    for (const e of events) {
      if (e.kind === 'deadline' && e.at > now && e.at < horizon) list.push({ key: e.id, title: e.title, at: e.at, end: e.at, kind: 'deadline', sub: e.project });
    }
    return list.sort((a, b) => a.at - b.at).slice(0, 5);
  }, [meetings, events, now, horizon]);

  return (
    <section className="agenda" aria-label="Up next">
      <h3 className="side-title">Up next</h3>
      {items.length === 0 ? (
        <p className="side-empty">Nothing in the next week.</p>
      ) : (
        <ul>
          {items.map((item) => {
            const ongoing = item.at <= now && item.end > now;
            return (
              <li key={item.key}>
                <button type="button" className={`agenda-item kind-${item.kind}`} onClick={() => onOpen({ meetingId: item.meetingId, at: item.at })}>
                  <span className="agenda-title">{item.title}</span>
                  <span className="agenda-meta">
                    {sameDay(item.at, now) ? 'Today' : formatDayLong(item.at)}, {formatTime(item.at)}
                  </span>
                  <span className={`agenda-count${ongoing ? ' is-now' : ''}`}>{ongoing ? `Ends in ${countdown(item.end - now)}` : `In ${countdown(item.at - now)}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DraggablePerson({ person }: { person: Person }) {
  const drag = useDraggable({ kind: 'person', personId: person.id }, { ghost: () => <PersonGhost person={person} />, anchor: 'cursor' });
  const zone = person.timezone;
  const now = useNow(60_000);
  return (
    <li className="side-person is-draggable" {...drag} title="Drag onto a meeting or a time slot">
      <span className="avatar avatar-sm" aria-hidden="true">
        {initials(person.name)}
      </span>
      <span className="side-person-names">
        <span className="side-person-name">{person.name}</span>
        <span className="side-person-meta">{zone ? `${formatTime(now, zone)} local` : person.role}</span>
      </span>
      <span className="block-grip">
        <GripIcon />
      </span>
    </li>
  );
}

interface FiltersProps {
  projects: Project[];
  hidden: Set<string>;
  colorOf: (projectId: string | null) => string;
  onToggle: (id: string) => void;
}

export function ProjectFilters({ projects, hidden, colorOf, onToggle }: FiltersProps) {
  return (
    <section aria-label="Show on calendar">
      <h3 className="side-title">Show</h3>
      <ul className="filter-list">
        {[...projects.map((p) => ({ id: p.id, label: `${p.client}: ${p.name}` })), { id: 'none', label: 'Meetings without a project' }].map((item) => (
          <li key={item.id}>
            <label className="filter-row">
              <input type="checkbox" checked={!hidden.has(item.id)} onChange={() => onToggle(item.id)} />
              <span className="filter-swatch" style={{ background: item.id === 'none' ? 'var(--faint)' : colorOf(item.id) }} />
              <span className="filter-label">{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PeopleList({ people }: { people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <section aria-label="People">
      <h3 className="side-title">People</h3>
      <p className="side-empty">Drag someone onto a meeting to invite them, or onto an empty slot to book time with them.</p>
      <ul className="side-people">
        {people.map((p) => (
          <DraggablePerson key={p.id} person={p} />
        ))}
      </ul>
    </section>
  );
}

export function weekDaysFor(anchor: number): number[] {
  const first = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export { startOfMonth };
