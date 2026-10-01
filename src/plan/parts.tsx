import { useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import type { Place } from '../lib/layout';
import { dayLabel, formatHour, formatRange, HOUR_PX, weekday } from '../lib/time';
import { TONES, type CalItem, type Tone } from '../store/types';
import { CheckIcon, ClockIcon, FlagIcon, TrashIcon } from '../ui/icons';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export const toneVars = (tone: Tone) => ({ '--bar': TONES[tone].bar, '--fill': TONES[tone].fill, '--ink': TONES[tone].ink }) as React.CSSProperties;

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
        else if (e.key === 'Escape') onDone(initial ? initial : null);
      }}
      onBlur={() => onDone(value.trim() || 'New event')}
    />
  );
}

interface ChipProps {
  item: CalItem;
  title: string;
  done: boolean;
  place: Place;
  selected: boolean;
  editing: boolean;
  lifted: boolean;
  busy: boolean;
  onMoveStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onEdit: () => void;
  onTitleDone: (title: string | null) => void;
}

/** A block on the week. Sessions carry a small tick so they read as "time for a task". */
export function Chip({ item, title, done, place, selected, editing, lifted, busy, onMoveStart, onResizeStart, onEdit, onTitleDone }: ChipProps) {
  const short = item.length < 1;
  const inset = 4 + place.depth * 14;
  const cls = ['chip', short ? 'is-short' : 'is-tall', item.kind === 'session' ? 'is-session' : 'is-event'];
  if (place.depth > 0) cls.push('is-stacked');
  if (selected) cls.push('is-selected');
  if (lifted) cls.push('is-lifted');
  if (done) cls.push('is-done');
  return (
    <div
      role="button"
      tabIndex={-1}
      data-chip={item.id}
      aria-label={`${title}, ${formatRange(item.start, item.length)}`}
      onPointerDown={onMoveStart}
      onDoubleClick={item.kind === 'event' ? onEdit : undefined}
      className={cls.join(' ')}
      style={{
        top: item.start * HOUR_PX + 1,
        height: item.length * HOUR_PX - 3,
        left: `calc(${inset}px + (100% - ${inset + 4}px) * ${place.lane / place.lanes})`,
        width: `calc((100% - ${inset + 4}px) / ${place.lanes} - ${place.lanes > 1 ? 2 : 0}px)`,
        zIndex: lifted ? 5 : selected ? 25 : 10 + place.depth,
        ...toneVars(item.tone),
      }}
    >
      <span className="chip-bar" />
      {editing ? (
        <TitleInput initial={item.title} onDone={onTitleDone} />
      ) : (
        <p className="chip-title">
          {item.kind === 'session' && <span className={`chip-tick${done ? ' is-on' : ''}`}>{done && <CheckIcon size={8} strokeWidth={4} />}</span>}
          {title || 'Untitled'}
        </p>
      )}
      {!short && <p className="chip-time">{item.length === 1 || item.length === 0.5 ? formatHour(item.start) : formatRange(item.start, item.length)}</p>}
      <div onPointerDown={onResizeStart} className={`chip-resize${busy ? ' is-off' : ''}`} />
    </div>
  );
}

export function FloatingChip({ item, title, width, height, x, y, floatRef }: { item: CalItem; title: string; width: number; height: number; x: number; y: number; floatRef: Ref<HTMLDivElement> }) {
  const short = item.length < 1;
  return (
    <div ref={floatRef} className="float" style={{ width, height, translate: `${x}px ${y}px` }}>
      <div className={`float-chip ${short ? 'is-short' : 'is-tall'}`} style={toneVars(item.tone)}>
        <span className="chip-bar" />
        <p className="chip-title">{title || 'Untitled'}</p>
        {!short && (
          <p className="chip-time">
            {weekday(item.day)} · {formatRange(item.start, item.length)}
          </p>
        )}
      </div>
    </div>
  );
}

interface PopoverProps {
  item: CalItem;
  title: string;
  done: boolean;
  flip: boolean;
  onTone: (tone: Tone) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}

export function ItemPopover({ item, title, done, flip, onTone, onToggleDone, onDelete }: PopoverProps) {
  return (
    <div onPointerDown={stop} className={`popover ${flip ? 'is-left' : 'is-right'}`} style={{ top: Math.max(0, item.start * HOUR_PX - 8) }}>
      <p className="popover-kind">{item.kind === 'session' ? 'Session' : 'Event'}</p>
      <p className="popover-title">{title || 'Untitled'}</p>
      <p className="popover-when">
        <ClockIcon />
        {dayLabel(item.day)} · {formatRange(item.start, item.length)}
      </p>
      <div className="popover-tones">
        {(Object.keys(TONES) as Tone[]).map((tone) => (
          <button
            key={tone}
            type="button"
            aria-label={`Colour ${tone}`}
            onClick={() => onTone(tone)}
            style={{ backgroundColor: TONES[tone].bar }}
            className={`tone-dot${tone === item.tone ? ' is-on' : ''}`}
          />
        ))}
      </div>
      {item.kind === 'session' && (
        <button type="button" className={`done-btn${done ? ' is-on' : ''}`} onClick={onToggleDone}>
          <CheckIcon size={12} strokeWidth={3} />
          {done ? 'Done' : item.projectId ? 'Mark project done' : 'Mark task done'}
        </button>
      )}
      <div className="popover-foot">
        <span>{item.kind === 'session' ? 'Drag back to Tasks to unschedule' : 'Drag to move, pull the edge to resize'}</span>
        <button type="button" aria-label="Delete" onClick={onDelete} className="popover-delete">
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export function DuePill({ title, tone, done, onPointerDown }: { title: string; tone: Tone; done: boolean; onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void }) {
  return (
    <div className={`due-pill${done ? ' is-done' : ''}`} style={toneVars(tone)} onPointerDown={onPointerDown} role="button" tabIndex={-1} aria-label={`${title}, due`}>
      <FlagIcon size={10} />
      <span>{title || 'Untitled'}</span>
    </div>
  );
}
