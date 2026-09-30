import { useRef, useState } from 'react';
import { breakLine, daySummary, EMPTY, greeting, inboxLine } from '../domain/copy';
import { dayKey, formatDuration, formatTime } from '../domain/dates';
import { doneSteps, routineDay } from '../domain/routines';
import { breakDue } from '../domain/session';
import { blocksOn, inbox, nextUp, routineForNow, shippedToday, waitingOn } from '../domain/today';
import { Icon } from '../components/Icon';
import { TaskRow, WaitRow } from '../components/Rows';
import { useFlip } from '../components/Sortable';
import { ProjectTag, Section, projectColor } from '../components/ui';
import { navigate, routineHash } from '../nav';
import { useSession } from '../state/session';
import { useNow, useStore } from '../state/store';

export function Today() {
  const { data, dispatch } = useStore();
  const now = useNow();
  const { session, snooze } = useSession();
  // Ticked tasks stay put (struck through) until you leave, so nothing jumps under your finger.
  const [kept, setKept] = useState<Set<string>>(() => new Set());

  const next = nextUp(data, now, kept);
  const loose = inbox(data, now);
  const waiting = waitingOn(data);
  const blocks = blocksOn(data, now);
  const routine = routineForNow(data.routines, now);
  const shipped = shippedToday(data, now).length;
  const overdue = next.filter((n) => n.reason === 'overdue' && !n.task.done).length;
  const seed = dayKey(now);
  const byId = new Map(data.projects.map((p) => [p.id, p]));

  const toggle = (id: string) => {
    setKept((k) => new Set(k).add(id));
    dispatch({ type: 'toggleTask', id, now: Date.now() });
  };

  const listRef = useRef<HTMLUListElement>(null);
  useFlip(listRef, next.map((n) => n.task.id).join('|'));
  const inboxRef = useRef<HTMLUListElement>(null);
  useFlip(inboxRef, loose.map((t) => t.id).join('|'));

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="hello">{greeting(now)}</h1>
        <p className="lede">{daySummary(now, { waiting: waiting.length, overdue, next: next.filter((n) => !n.task.done).length, shipped }, seed)}</p>
      </header>

      {session && breakDue(session, now) && (
        <div className="nudge" role="status">
          <Icon name="coffee" size={18} />
          <span>{breakLine(now - session.start, `${seed}:${session.start}`)}</span>
          <button type="button" className="btn btn-sm btn-soft" onClick={snooze}>
            Fine
          </button>
        </div>
      )}

      {routine && <RoutineCard routineId={routine.id} now={now} />}

      {loose.length > 0 && (
        <Section title="Inbox" count={loose.length}>
          <p className="section-note">{inboxLine(loose.length)}</p>
          <ul className="rows" ref={inboxRef}>
            {loose.map((task) => (
              <li key={task.id} data-flip-id={task.id}>
                <TaskRow task={task} projects={data.projects} now={now} onToggle={() => toggle(task.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Next up">
        {next.length === 0 ? (
          <p className="empty">{EMPTY.next}</p>
        ) : (
          <ul className="rows" ref={listRef}>
            {next.map(({ task, project }) => (
              <li key={task.id} data-flip-id={task.id}>
                <TaskRow task={task} projects={data.projects} now={now} onToggle={() => toggle(task.id)} showProject={!!project} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {waiting.length > 0 && (
        <Section title="Waiting on" count={waiting.length}>
          <ul className="rows">
            {waiting.map((w) => (
              <li key={w.id}>
                <WaitRow wait={w} project={w.projectId ? (byId.get(w.projectId) ?? null) : null} now={now} showProject />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {blocks.length > 0 && (
        <Section title="Today's blocks">
          <ul className="rows blocks-list">
            {blocks.map((b) => {
              const live = b.start <= now && now < b.end;
              const past = b.end <= now;
              return (
                <li key={b.id}>
                  <a
                    href="#/calendar"
                    className={`row block-row${live ? ' is-live' : ''}${past ? ' is-past' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('#/calendar');
                    }}
                  >
                    <span className="block-bar" style={{ background: projectColor(b.projectId) }} aria-hidden="true" />
                    <span className="mono block-time">{formatTime(b.start)}</span>
                    <span className="row-text">{b.title || 'Untitled block'}</span>
                    <span className="row-meta">
                      {live && <span className="chip is-accent">Now</span>}
                      {b.projectId && <ProjectTag project={byId.get(b.projectId) ?? null} />}
                      <span className="mono">{formatDuration(b.end - b.start)}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

function RoutineCard({ routineId, now }: { routineId: string; now: number }) {
  const { data } = useStore();
  const routine = data.routines.find((r) => r.id === routineId);
  if (!routine) return null;
  const done = doneSteps(routine, routineDay(now)).length;
  const total = routine.steps.length;
  return (
    <a
      href={routineHash(routine.id)}
      className={`routine-card kind-${routine.kind}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(routineHash(routine.id));
      }}
    >
      <Icon name={routine.kind === 'shutdown' ? 'moon' : 'sun'} size={18} />
      <span className="routine-card-name">{routine.name}</span>
      <span className="mono">
        {done}/{total}
      </span>
      <span className="progress" aria-hidden="true">
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <Icon name="chevronRight" size={16} />
    </a>
  );
}
