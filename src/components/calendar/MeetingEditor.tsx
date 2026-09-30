import { useEffect, useId, useRef } from 'react';
import {
  atMinutes,
  formatDayLong,
  formatRange,
  formatTime,
  isWorkingHours,
  MEETING_KINDS,
  MINUTE,
  minutesIntoDay,
  startOfDay,
  zoneName,
} from '../../domain/calendar';
import { roundKindDef } from '../../domain/catalog';
import type { Meeting, MeetingKind, Person, Project } from '../../domain/types';
import { navigate } from '../../nav';
import { useStore } from '../../state/store';
import { Icon, type IconName } from '../Icon';
import { initials } from '../ui';

const KIND_ICON: Record<MeetingKind, IconName> = { review: 'eye', client: 'comments', internal: 'grid' };
const DURATIONS = [15, 30, 45, 60, 90, 120];

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toTimeInput = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface MeetingEditorProps {
  meeting: Meeting;
  projects: Project[];
  people: Person[];
  autoFocusTitle: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function MeetingEditor({ meeting, projects, people, autoFocusTitle, onClose, onDelete }: MeetingEditorProps) {
  const { appDispatch } = useStore();
  const ids = { title: useId(), date: useId(), time: useId(), dur: useId(), project: useId(), round: useId(), link: useId(), notes: useId() };
  const titleRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === meeting.projectId) ?? null;
  const round = project?.rounds.find((r) => r.id === meeting.roundId) ?? null;
  const roundIndex = project && round ? project.rounds.indexOf(round) : -1;
  const duration = Math.round((meeting.end - meeting.start) / MINUTE);
  const candidates = project ? project.people : people;

  useEffect(() => {
    if (autoFocusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [autoFocusTitle, meeting.id]);

  const patch = (changes: Partial<Omit<Meeting, 'id'>>, field: string) =>
    appDispatch({ type: 'updateMeeting', id: meeting.id, patch: changes }, `meeting:${meeting.id}:${field}`);

  const setStart = (start: number) => patch({ start, end: start + duration * MINUTE }, 'when');

  return (
    <div className="insp meeting-editor">
      <div className="insp-top">
        <div className="insp-head">
          <span className={`node-icon node-icon-lg kind-icon-${meeting.kind}`}>
            <Icon name={KIND_ICON[meeting.kind]} size={18} />
          </span>
          <span className="node-titles grow">
            <span className="mono-label">MEETING</span>
            <label className="sr-only" htmlFor={ids.title}>
              Title
            </label>
            <input
              id={ids.title}
              ref={titleRef}
              className="title-input"
              type="text"
              value={meeting.title}
              placeholder="Add a title"
              onChange={(e) => patch({ title: e.target.value }, 'title')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              autoComplete="off"
            />
          </span>
          <button type="button" className="icon-btn icon-btn-md" aria-label="Close meeting" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="insp-sub">
          {formatDayLong(meeting.start)}, {formatRange(meeting.start, meeting.end)}
        </p>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Kind of meeting">
        {MEETING_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={meeting.kind === k.id}
            className={`segment${meeting.kind === k.id ? ' is-on' : ''}`}
            onClick={() => patch({ kind: k.id }, 'kind')}
          >
            {k.label}
          </button>
        ))}
      </div>

      <section className="insp-section">
        <h3>When</h3>
        <div className="when-grid">
          <label htmlFor={ids.date}>Date</label>
          <input
            id={ids.date}
            type="date"
            value={toDateInput(meeting.start)}
            onChange={(e) => {
              if (!e.target.value) return;
              const [y, m, d] = e.target.value.split('-').map(Number);
              setStart(atMinutes(new Date(y, m - 1, d).getTime(), minutesIntoDay(meeting.start)));
            }}
          />
          <label htmlFor={ids.time}>Starts</label>
          <input
            id={ids.time}
            type="time"
            step={900}
            value={toTimeInput(meeting.start)}
            onChange={(e) => {
              if (!e.target.value) return;
              const [h, m] = e.target.value.split(':').map(Number);
              setStart(atMinutes(startOfDay(meeting.start), h * 60 + m));
            }}
          />
          <label htmlFor={ids.dur}>Length</label>
          <select id={ids.dur} value={DURATIONS.includes(duration) ? duration : ''} onChange={(e) => patch({ end: meeting.start + Number(e.target.value) * MINUTE }, 'when')}>
            {!DURATIONS.includes(duration) && <option value="">{duration} minutes</option>}
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minutes` : d === 60 ? '1 hour' : `${d / 60} hours`}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="insp-section">
        <h3>Project</h3>
        <div className="when-grid">
          <label htmlFor={ids.project}>Project</label>
          <select
            id={ids.project}
            value={meeting.projectId ?? ''}
            onChange={(e) => patch({ projectId: e.target.value || null, roundId: null }, 'project')}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client}: {p.name}
              </option>
            ))}
          </select>
          {project && (
            <>
              <label htmlFor={ids.round}>Round</label>
              <select id={ids.round} value={meeting.roundId ?? ''} onChange={(e) => patch({ roundId: e.target.value || null }, 'round')}>
                <option value="">Not tied to a round</option>
                {project.rounds.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    Round {i + 1}: {roundKindDef(r.kind).label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {round && (
          <button type="button" className="btn btn-sm btn-ghost add-btn" onClick={() => navigate(`#/?round=${encodeURIComponent(round.id)}`)}>
            <Icon name="flow" size={14} />
            Open Round {roundIndex + 1} in the flow
          </button>
        )}
      </section>

      <section className="insp-section">
        <h3>People</h3>
        {candidates.length === 0 ? (
          <p className="insp-sub">Nobody to invite yet. Add reviewers to a project first.</p>
        ) : (
          <ul className="attendee-list">
            {candidates.map((p) => {
              const on = meeting.attendeeIds.includes(p.id);
              const zone = p.timezone;
              const outside = on && zone ? !isWorkingHours(meeting.start, zone) : false;
              return (
                <li key={p.id}>
                  <label className={`attendee-row${on ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        patch({ attendeeIds: on ? meeting.attendeeIds.filter((id) => id !== p.id) : [...meeting.attendeeIds, p.id] }, 'people')
                      }
                    />
                    <span className="avatar avatar-sm" aria-hidden="true">
                      {initials(p.name)}
                    </span>
                    <span className="reviewer-names">
                      <span className="reviewer-name">{p.name}</span>
                      <span className={`reviewer-role${outside ? ' text-warn' : ''}`}>
                        {zone ? `${formatTime(meeting.start, zone)} ${zoneName(zone, meeting.start)}` : p.role}
                        {outside ? ', outside their working hours' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="insp-section">
        <h3>Details</h3>
        <label className="field-label" htmlFor={ids.link}>
          Video link
        </label>
        <div className="link-row">
          <input
            id={ids.link}
            type="text"
            inputMode="url"
            value={meeting.link}
            placeholder="Paste a Meet, Zoom or Teams link"
            onChange={(e) => patch({ link: e.target.value }, 'link')}
            autoComplete="off"
          />
          {/^https?:\/\//.test(meeting.link) && (
            <a className="btn btn-sm btn-outline" href={meeting.link} target="_blank" rel="noreferrer">
              <Icon name="video" size={14} />
              Join
            </a>
          )}
        </div>
        <label className="field-label" htmlFor={ids.notes}>
          Notes
        </label>
        <textarea id={ids.notes} rows={3} value={meeting.notes} placeholder="Agenda, links, anything to prepare" onChange={(e) => patch({ notes: e.target.value }, 'notes')} />
      </section>

      <button
        type="button"
        className="btn btn-ghost btn-danger"
        onClick={() => onDelete(meeting.id)}
      >
        <Icon name="trash" size={16} />
        Delete meeting
      </button>
    </div>
  );
}
