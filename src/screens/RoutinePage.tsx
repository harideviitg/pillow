import { useMemo } from 'react';
import { EMPTY, signOff, startLine } from '../domain/copy';
import { moveBefore } from '../domain/data';
import { doneSteps, isDoneOn, routineDay, streak } from '../domain/routines';
import { uid } from '../domain/seed';
import { shippedToday, touchedToday } from '../domain/today';
import type { Routine } from '../domain/types';
import { GripIcon, Icon, MoreIcon } from '../components/Icon';
import { MenuButton } from '../components/Popover';
import { Sortable } from '../components/Sortable';
import { useToast } from '../components/Toast';
import { AddRow, Check, InlineText, ProjectTag, Section, plural } from '../components/ui';
import { navigate } from '../nav';
import { useNow, useStore } from '../state/store';
import { Week } from './Routines';

export function RoutinePage({ id }: { id: string }) {
  const { data } = useStore();
  const routine = data.routines.find((r) => r.id === id);
  if (!routine) {
    return (
      <div className="page">
        <BackLink />
        <p className="empty">That routine is gone.</p>
      </div>
    );
  }
  return <RoutineView key={routine.id} routine={routine} />;
}

function BackLink() {
  return (
    <a
      href="#/routines"
      className="back"
      onClick={(e) => {
        e.preventDefault();
        navigate('#/routines');
      }}
    >
      <Icon name="back" size={16} />
      Routines
    </a>
  );
}

function RoutineView({ routine }: { routine: Routine }) {
  const { dispatch, undo } = useStore();
  const toast = useToast();
  const now = useNow();
  const today = routineDay(now);
  const ticked = doneSteps(routine, today);
  const complete = isDoneOn(routine, today);
  const count = streak(routine, now);
  const setSteps = (steps: Routine['steps']) => dispatch({ type: 'updateRoutine', id: routine.id, patch: { steps } });

  return (
    <div className="page">
      <div className="page-top">
        <BackLink />
        <MenuButton
          label="Routine options"
          className="icon-btn"
          items={[
            {
              key: 'reset',
              label: "Untick today's steps",
              icon: 'undo',
              disabled: ticked.length === 0,
              onSelect: () => dispatch({ type: 'updateRoutine', id: routine.id, patch: { progress: { day: today, done: [] }, completions: routine.completions.filter((d) => d !== today) } }),
            },
            {
              key: 'delete',
              label: 'Delete routine',
              icon: 'trash',
              danger: true,
              onSelect: () => {
                dispatch({ type: 'removeRoutine', id: routine.id });
                navigate('#/routines');
                toast(`Deleted ${routine.name}`, { action: { label: 'Undo', onClick: undo } });
              },
            },
          ]}
        >
          <MoreIcon />
        </MenuButton>
      </div>

      <header className="page-head">
        <div className="title-row">
          <span className={`routine-icon kind-${routine.kind}`} aria-hidden="true">
            <Icon name={routine.kind === 'start' ? 'sun' : routine.kind === 'shutdown' ? 'moon' : 'repeat'} size={18} />
          </span>
          <InlineText value={routine.name} label="Routine name" className="title-input" onSave={(name) => dispatch({ type: 'updateRoutine', id: routine.id, patch: { name } })} />
        </div>
        <div className="routine-stats">
          <Week routine={routine} now={now} />
          <span className="mono muted">{count > 0 ? `${plural(count, 'day')} in a row` : 'No streak yet'}</span>
        </div>
      </header>

      {routine.kind === 'shutdown' && <ShutdownExtras now={now} />}

      <Section title={routine.kind === 'shutdown' ? 'Then' : 'Steps'} count={routine.steps.length ? `${ticked.length}/${routine.steps.length}` : undefined}>
        {routine.steps.length === 0 && <p className="empty">{EMPTY.steps}</p>}
        <Sortable
          list={`steps:${routine.id}`}
          items={routine.steps}
          label="Steps"
          className="steps"
          onMove={(stepId, beforeId) => {
            const steps = moveBefore(routine.steps, stepId, beforeId);
            if (steps !== routine.steps) setSteps(steps);
          }}
          renderItem={(step, handle) => (
            <div className={`row step-row${ticked.includes(step.id) ? ' is-done' : ''}`}>
              <span className="grip" {...handle} aria-hidden="true" title="Drag to reorder">
                <GripIcon />
              </span>
              <Check
                checked={ticked.includes(step.id)}
                label={step.text}
                size="lg"
                onChange={() => dispatch({ type: 'toggleStep', id: routine.id, stepId: step.id, day: today })}
              />
              <InlineText value={step.text} label="Step" className="row-text" onSave={(text) => setSteps(routine.steps.map((s) => (s.id === step.id ? { ...s, text } : s)))} />
              <button type="button" className="icon-btn row-more" aria-label={`Remove step "${step.text}"`} onClick={() => setSteps(routine.steps.filter((s) => s.id !== step.id))}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          renderGhost={(step) => (
            <div className="row step-row">
              <span className="grip">
                <GripIcon />
              </span>
              <span className="check check-lg" />
              <span className="row-text">{step.text}</span>
            </div>
          )}
        />
        <AddRow placeholder="Add a step" label="Add a step" autoFocus={routine.steps.length === 0} onAdd={(text) => setSteps([...routine.steps, { id: uid(), text }])} />
      </Section>

      {complete && (
        <p className="finale" role="status">
          {routine.kind === 'shutdown' ? signOff(today) : routine.kind === 'start' ? startLine(today) : count > 1 ? `${count} days in a row. Keep it going.` : 'Done for today.'}
        </p>
      )}
    </div>
  );
}

/** The shutdown ritual: what you shipped, then a fresh note on each project you touched. */
function ShutdownExtras({ now }: { now: number }) {
  const { data, dispatch } = useStore();
  const shipped = shippedToday(data, now);
  const touched = useMemo(() => touchedToday(data, now), [data, now]);
  const byId = new Map(data.projects.map((p) => [p.id, p]));

  return (
    <>
      <Section title="Shipped today" count={shipped.length}>
        {shipped.length === 0 ? (
          <p className="empty">{EMPTY.shipped}</p>
        ) : (
          <ul className="rows shipped">
            {shipped.map((t) => (
              <li key={t.id} className="row">
                <Icon name="check" size={14} strokeWidth={2.4} />
                <span className="row-text">{t.text}</span>
                <span className="row-meta">
                  <ProjectTag project={t.projectId ? (byId.get(t.projectId) ?? null) : null} fallback="Inbox" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {touched.length > 0 && (
        <Section title="Where you left off">
          <p className="section-note">One line each. Tomorrow's you starts here.</p>
          <div className="left-off-list">
            {touched.map((p) => (
              <label key={p.id} className="left-off left-off-compact">
                <span className="left-off-head">
                  <ProjectTag project={p} />
                </span>
                <InlineText
                  multiline
                  value={p.leftOffAt}
                  label={`Where you left off on ${p.name}`}
                  className="left-off-text"
                  placeholder="Where did you stop, and what's next?"
                  onSave={(leftOffAt) => dispatch({ type: 'updateProject', id: p.id, patch: { leftOffAt, leftOffAtUpdated: Date.now() } }, `leftoff:${p.id}`)}
                />
              </label>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
