import { useState } from 'react';
import { EMPTY } from '../domain/copy';
import { weekdayName, fromDayKey } from '../domain/dates';
import { isDoneOn, lastWeek, routineDay, streak } from '../domain/routines';
import { uid } from '../domain/seed';
import type { Routine } from '../domain/types';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { AddRow, Check, plural } from '../components/ui';
import { navigate, routineHash } from '../nav';
import { useNow, useStore } from '../state/store';

export function Routines() {
  const { data, dispatch } = useStore();
  const now = useNow();
  const [adding, setAdding] = useState(false);

  const create = (name: string) => {
    const routine: Routine = { id: uid(), name, kind: 'custom', steps: [], progress: { day: '', done: [] }, completions: [] };
    dispatch({ type: 'addRoutine', routine });
    navigate(routineHash(routine.id));
  };

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Routines</h1>
          <p className="lede">Things you do again and again. A habit is a routine with one step.</p>
        </div>
        <button type="button" className="btn btn-sm btn-soft" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
          New routine
        </button>
      </header>

      {(adding || data.routines.length === 0) && (
        <div className="section">
          <AddRow placeholder="Morning pages, Ship checklist, Drink water" label="New routine name" onAdd={create} autoFocus={adding} />
        </div>
      )}

      {data.routines.length === 0 ? (
        <p className="empty">{EMPTY.routines}</p>
      ) : (
        <ul className="rows routine-list">
          {data.routines.map((r) => (
            <li key={r.id}>
              <RoutineRow routine={r} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoutineRow({ routine, now }: { routine: Routine; now: number }) {
  const { dispatch, undo } = useStore();
  const toast = useToast();
  const today = routineDay(now);
  const done = isDoneOn(routine, today);
  const count = streak(routine, now);
  const habit = routine.steps.length === 1;

  return (
    <div className="routine-row">
      {habit ? (
        <Check
          checked={done}
          label={done ? `Undo ${routine.name} for today` : `Done ${routine.name} today`}
          onChange={() => {
            if (done) dispatch({ type: 'toggleStep', id: routine.id, stepId: routine.steps[0].id, day: today });
            else {
              dispatch({ type: 'completeRoutine', id: routine.id, day: today });
              toast(count > 0 ? `${count + 1} days in a row.` : 'Done for today.', { action: { label: 'Undo', onClick: undo } });
            }
          }}
        />
      ) : (
        <span className={`routine-icon kind-${routine.kind}`} aria-hidden="true">
          <Icon name={routine.kind === 'start' ? 'sun' : routine.kind === 'shutdown' ? 'moon' : 'repeat'} size={16} />
        </span>
      )}
      <a
        href={routineHash(routine.id)}
        className="routine-link"
        onClick={(e) => {
          e.preventDefault();
          navigate(routineHash(routine.id));
        }}
      >
        <span className="routine-name">{routine.name}</span>
        <span className="mono muted">{habit ? 'habit' : plural(routine.steps.length, 'step')}</span>
      </a>
      <Week routine={routine} now={now} />
      <span className={`streak mono${count > 0 ? ' is-on' : ''}`} title={`${plural(count, 'day')} in a row`}>
        {count}
        <span aria-hidden="true">d</span>
      </span>
    </div>
  );
}

export function Week({ routine, now }: { routine: Routine; now: number }) {
  return (
    <span className="week" aria-label="Last seven days">
      {lastWeek(routine, now).map((d) => (
        <span key={d.day} className={`week-dot${d.done ? ' is-on' : ''}`} title={`${weekdayName(fromDayKey(d.day))}${d.done ? ', done' : ''}`} />
      ))}
    </span>
  );
}
