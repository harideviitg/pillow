import { atMinutes, formatTime, meetingsOnDay, monthGridDays, sameDay, startOfDay, type RoundEvent } from '../../domain/calendar';
import type { Meeting } from '../../domain/types';
import { useDraggable, useDropTarget } from '../../dnd/DragProvider';
import { Icon } from '../Icon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

interface MonthGridProps {
  anchor: number;
  now: number;
  meetings: Meeting[];
  events: RoundEvent[];
  selectedId: string | null;
  projectColor: (projectId: string | null) => string;
  onSelect: (id: string | null) => void;
  onMoveToDay: (meetingId: string, day: number) => void;
  onCreate: (start: number, end: number, attendeeIds?: string[]) => void;
  onOpenDay: (day: number) => void;
}

export function MonthGrid(props: MonthGridProps) {
  const days = monthGridDays(props.anchor);
  const month = new Date(props.anchor).getMonth();
  return (
    <div className="mg">
      <div className="mg-head">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mg-grid">
        {days.map((day) => (
          <MonthCell key={day} day={day} outside={new Date(day).getMonth() !== month} {...props} />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  outside,
  now,
  meetings,
  events,
  selectedId,
  projectColor,
  onSelect,
  onMoveToDay,
  onCreate,
  onOpenDay,
}: MonthGridProps & { day: number; outside: boolean }) {
  const target = useDropTarget(`mg:${day}`, {
    accepts: (p) => p.kind === 'meeting' || p.kind === 'person',
    onDrop: (p) => {
      if (p.kind === 'meeting') onMoveToDay(p.meetingId, day);
      else if (p.kind === 'person') onCreate(atMinutes(day, 10 * 60), atMinutes(day, 10 * 60 + 30), [p.personId]);
    },
  });
  const list = meetingsOnDay(meetings, day);
  const deadlines = events.filter((e) => e.kind === 'deadline' && sameDay(e.at, day));
  const approvals = events.filter((e) => e.kind === 'approved' && sameDay(e.at, day));
  const chips = [...deadlines, ...approvals].length + list.length;
  const isToday = sameDay(day, now);
  const d = new Date(day);

  return (
    <div
      ref={target.ref}
      {...target.dropProps}
      className={`mg-cell${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${target.isOver ? ' is-over' : ''}`}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onCreate(atMinutes(day, 10 * 60), atMinutes(day, 10 * 60 + 30));
      }}
    >
      <button type="button" className="mg-date" onClick={() => onOpenDay(startOfDay(day))} aria-label={`Open ${d.toDateString()}`}>
        {d.getDate()}
      </button>
      <div className="mg-chips">
        {deadlines.map((ev) => (
          <span key={ev.id} className="mg-chip kind-deadline" title={`${ev.project}: ${ev.title}`}>
            <Icon name="clock" size={11} strokeWidth={2.2} />
            {ev.title}
          </span>
        ))}
        {approvals.map((ev) => (
          <span key={ev.id} className="mg-chip kind-approved" title={`${ev.project}: ${ev.title}`}>
            <Icon name="check" size={11} strokeWidth={2.4} />
            {ev.title}
          </span>
        ))}
        {list.slice(0, Math.max(0, MAX_CHIPS - deadlines.length - approvals.length)).map((m) => (
          <MeetingChip key={m.id} meeting={m} selected={selectedId === m.id} color={projectColor(m.projectId)} onSelect={onSelect} />
        ))}
        {chips > MAX_CHIPS && (
          <button type="button" className="mg-more" onClick={() => onOpenDay(startOfDay(day))}>
            {chips - MAX_CHIPS} more
          </button>
        )}
      </div>
    </div>
  );
}

function MeetingChip({ meeting, selected, color, onSelect }: { meeting: Meeting; selected: boolean; color: string; onSelect: (id: string) => void }) {
  const drag = useDraggable(
    { kind: 'meeting', meetingId: meeting.id },
    {
      anchor: 'cursor',
      ghost: () => (
        <div className={`mg-chip kind-${meeting.kind} is-ghost`}>
          <span className="mg-chip-time">{formatTime(meeting.start)}</span>
          {meeting.title}
        </div>
      ),
    },
  );
  return (
    <button
      type="button"
      className={`mg-chip kind-${meeting.kind}${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(meeting.id)}
      aria-pressed={selected}
      {...drag}
    >
      {meeting.projectId && <span className="project-dot" style={{ background: color }} />}
      <span className="mg-chip-time">{formatTime(meeting.start).replace(':00', '')}</span>
      <span className="mg-chip-title">{meeting.title || 'Untitled'}</span>
    </button>
  );
}
