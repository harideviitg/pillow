import { useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { ChainIcon, CheckIcon, ClockIcon, PlusIcon, TrashIcon } from './icons';
import { DAYS, FIRST_HOUR, HOUR_PX, SHARE_LINK, TONES, formatHour, formatRange, shortDay, type CalEvent, type FreeWindow, type Place, type Task, type Tone } from './model';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

const toneVars = (tone: Tone) => ({ '--bar': TONES[tone].bar, '--fill': TONES[tone].fill, '--ink': TONES[tone].ink }) as React.CSSProperties;

function TitleInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      placeholder="New event"
      aria-label="Event title"
      className="chip-input"
      onPointerDown={stop}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value.trim() || 'New event');
        else if (e.key === 'Escape') onDone(null);
      }}
      onBlur={() => onDone(value.trim() || 'New event')}
    />
  );
}

interface EventChipProps {
  event: CalEvent;
  place: Place;
  selected: boolean;
  editing: boolean;
  lifted: boolean;
  muted: boolean;
  busy: boolean;
  onMoveStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onTitleDone: (title: string | null) => void;
}

export function EventChip({ event, place, selected, editing, lifted, muted, busy, onMoveStart, onResizeStart, onTitleDone }: EventChipProps) {
  const short = event.length < 1;
  const inset = 4 + place.depth * 14;
  const cls = ['chip', short ? 'is-short' : 'is-tall'];
  if (place.depth > 0) cls.push('is-stacked');
  if (selected) cls.push('is-selected');
  if (lifted) cls.push('is-lifted');
  else if (muted) cls.push('is-muted');
  return (
    <div
      role="button"
      tabIndex={-1}
      data-chip={event.id}
      aria-label={`${event.title}, ${formatRange(event.start, event.length)}`}
      onPointerDown={onMoveStart}
      className={cls.join(' ')}
      style={{
        top: (event.start - FIRST_HOUR) * HOUR_PX + 1,
        height: event.length * HOUR_PX - 3,
        left: `calc(${inset}px + (100% - ${inset + 4}px) * ${place.lane / place.lanes})`,
        width: `calc((100% - ${inset + 4}px) / ${place.lanes} - ${place.lanes > 1 ? 2 : 0}px)`,
        zIndex: lifted ? 5 : selected ? 25 : 10 + place.depth,
        ...toneVars(event.tone),
      }}
    >
      <span className="chip-bar" />
      {editing ? <TitleInput initial={event.title} onDone={onTitleDone} /> : <p className="chip-title">{event.title}</p>}
      {!short && <p className="chip-time">{event.length === 1 || event.length === 0.5 ? formatHour(event.start) : formatRange(event.start, event.length)}</p>}
      <div onPointerDown={onResizeStart} className={`chip-resize${busy ? ' is-off' : ''}`} />
    </div>
  );
}

/** The chip that follows the pointer while an event is dragged. */
export function FloatingChip({ event, width, height, x, y, floatRef }: { event: CalEvent; width: number; height: number; x: number; y: number; floatRef: Ref<HTMLDivElement> }) {
  const short = event.length < 1;
  return (
    <div ref={floatRef} className="float" style={{ width, height, translate: `${x}px ${y}px` }}>
      <div className={`float-chip ${short ? 'is-short' : 'is-tall'}`} style={toneVars(event.tone)}>
        <span className="chip-bar" />
        <p className="chip-title">{event.title}</p>
        {!short && (
          <p className="chip-time">
            {shortDay(event.day)} · {formatRange(event.start, event.length)}
          </p>
        )}
      </div>
    </div>
  );
}

export function EventPopover({ event, flip, onTone, onDelete }: { event: CalEvent; flip: boolean; onTone: (tone: Tone) => void; onDelete: () => void }) {
  return (
    <div onPointerDown={stop} className={`popover ${flip ? 'is-left' : 'is-right'}`} style={{ top: Math.max(0, (event.start - FIRST_HOUR) * HOUR_PX - 8) }}>
      <p className="popover-title">{event.title}</p>
      <p className="popover-when">
        <ClockIcon />
        {DAYS[event.day]} · {formatRange(event.start, event.length)}
      </p>
      <div className="popover-tones">
        {(Object.keys(TONES) as Tone[]).map((tone) => (
          <button
            key={tone}
            type="button"
            aria-label={`Colour ${tone}`}
            onClick={() => onTone(tone)}
            style={{ backgroundColor: TONES[tone].bar }}
            className={`tone-dot${tone === event.tone ? ' is-on' : ''}`}
          />
        ))}
      </div>
      <div className="popover-foot">
        <span>Drag to move, pull the edge to resize</span>
        <button type="button" aria-label="Delete event" onClick={onDelete} className="popover-delete">
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDragStart }: { task: Task; onToggle: () => void; onDragStart: (e: ReactPointerEvent) => void }) {
  return (
    <li onPointerDown={onDragStart} className="task">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
        onPointerDown={stop}
        onClick={onToggle}
        className={`task-check${task.done ? ' is-done' : ''}`}
      >
        {task.done && <CheckIcon size={10} strokeWidth={3.4} />}
      </button>
      <span className={`task-title${task.done ? ' is-done' : ''}`}>{task.title}</span>
    </li>
  );
}

export function TasksPanel({
  tasks,
  onToggle,
  onAdd,
  onDragStart,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onAdd: (title: string) => void;
  onDragStart: (id: string, e: ReactPointerEvent) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="panel-body">
      {(['today', 'upcoming'] as const).map((list) => (
        <div key={list} className="task-group">
          <p className="panel-heading">{list === 'today' ? 'Today' : 'Upcoming'}</p>
          <ul className="task-list">
            {tasks
              .filter((t) => t.list === list)
              .map((t) => (
                <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDragStart={(e) => onDragStart(t.id, e)} />
              ))}
          </ul>
          {list === 'today' && (
            <label className="task-add">
              <PlusIcon />
              <input
                value={draft}
                placeholder="Add a task"
                aria-label="Add a task"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draft.trim()) {
                    onAdd(draft.trim());
                    setDraft('');
                  }
                }}
              />
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="key-hint">
      {label}
      <span>
        {keys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
      </span>
    </li>
  );
}

export function SchedulePanel({
  windows,
  active,
  copied,
  onSelect,
  onRemove,
  onCopy,
}: {
  windows: FreeWindow[];
  active: string | null;
  copied: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCopy: () => void;
}) {
  const sorted = [...windows].sort((a, b) => a.day - b.day || a.start - b.start);
  return (
    <div className="panel-body schedule">
      <p className="panel-heading">Coffee chat</p>
      <p className="panel-sub">30 min · one-off link</p>
      <p className="panel-label">When you are free</p>
      {sorted.length === 0 ? (
        <p className="panel-empty">Drag on the week to paint the hours you are free.</p>
      ) : (
        <ul className="window-list">
          {sorted.map((w) => (
            <li key={w.id}>
              <button type="button" onPointerDown={stop} onClick={() => onSelect(w.id)} className={`window-row${active === w.id ? ' is-active' : ''}`}>
                <span className="window-dot" />
                <span className="window-text">
                  {DAYS[w.day]} · {formatRange(w.start, w.length)}
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Remove window"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(w.id);
                  }}
                  className="window-x"
                >
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={sorted.length === 0} onPointerDown={stop} onClick={onCopy} className="copy-link">
        {copied ? <CheckIcon size={12} strokeWidth={3} /> : <ChainIcon />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <p className={`copy-url${copied ? ' is-on' : ''}`}>{SHARE_LINK}</p>
      <ul className="key-hints">
        <KeyHint keys={['Tab']} label="Next window" />
        <KeyHint keys={['↑', '↓']} label="Move" />
        <KeyHint keys={['⇧', '↑', '↓']} label="Resize" />
        <KeyHint keys={['←', '→']} label="Change day" />
        <KeyHint keys={['⌫']} label="Remove" />
        <KeyHint keys={['⌘', 'C']} label="Copy link" />
      </ul>
    </div>
  );
}

function BookingType({ title, meta }: { title: string; meta: string }) {
  return (
    <li className="booking-type">
      <span className="booking-icon">
        <ChainIcon />
      </span>
      <span className="booking-text">
        <span className="booking-title">{title}</span>
        <span className="booking-meta">{meta}</span>
      </span>
    </li>
  );
}

export function BookingPanel() {
  return (
    <div className="panel-body">
      <p className="panel-heading">Booking page</p>
      <p className="booking-url">pillow.app/@you</p>
      <ul className="booking-list">
        <BookingType title="Intro call" meta="30 min · Weekdays 9–5" />
        <BookingType title="Deep dive" meta="1 hour · Tue and Thu" />
      </ul>
    </div>
  );
}

export function RailButton({ label, current, open, onClick, children }: { label: string; current: boolean; open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-expanded={open} onClick={onClick} className={`rail-btn${open ? ' is-open' : current ? ' is-current' : ''}`}>
      {children}
    </button>
  );
}

export function ToolbarButton({ onClick, active = false, children }: { onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`tool-btn${active ? ' is-active' : ''}`}>
      {children}
    </button>
  );
}
