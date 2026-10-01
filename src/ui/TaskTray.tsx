import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { dayKey, dueLabel } from '../lib/time';
import { uid } from '../store/reducer';
import { projectProgress, toneOfTask } from '../store/select';
import { useNow, useStore, useViewState } from '../store/store';
import { TONES, type Project, type Task } from '../store/types';
import { useTrayDrag } from './drag';
import { CheckIcon, ChevronIcon, CloseIcon, FlagIcon, PlusIcon } from './icons';
import { useToast } from './toast';

function Due({ day, today }: { day: string; today: string }) {
  const label = dueLabel(day, today);
  const hot = label === 'Today' || label === 'Overdue';
  return (
    <span className={`due${hot ? ' is-hot' : ''}`} title={`Due ${day}`}>
      <FlagIcon size={10} />
      {label}
    </span>
  );
}

function Title({ value, onSave, className }: { value: string; onSave: (v: string) => void; className: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span
        className={className}
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || 'Untitled'}
      </span>
    );
  }
  const done = (save: boolean) => {
    setEditing(false);
    if (save && draft.trim() && draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <input
      autoFocus
      className={`${className} title-edit`}
      value={draft}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
    />
  );
}

function TaskRow({ task, today, indent }: { task: Task; today: string; indent?: boolean }) {
  const { data, dispatch, undo } = useStore();
  const toast = useToast();
  const drag = useTrayDrag();
  const tone = toneOfTask(data, task);
  const dragging = drag.dragging?.kind === 'task' && drag.dragging.id === task.id;
  return (
    <li
      className={`task${indent ? ' is-indent' : ''}${dragging ? ' is-dragging' : ''}`}
      onPointerDown={(e: ReactPointerEvent) => drag.start(e, { kind: 'task', id: task.id }, task.title, tone)}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => dispatch({ type: 'updateTask', id: task.id, patch: { done: !task.done } })}
        className={`task-check${task.done ? ' is-done' : ''}`}
      >
        {task.done && <CheckIcon size={10} strokeWidth={3.4} />}
      </button>
      <Title value={task.title} className={`task-title${task.done ? ' is-done' : ''}`} onSave={(title) => dispatch({ type: 'updateTask', id: task.id, patch: { title } })} />
      {task.due && !task.done && <Due day={task.due} today={today} />}
      <button
        type="button"
        className="task-x"
        aria-label={`Delete "${task.title}"`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          dispatch({ type: 'removeTask', id: task.id });
          toast('Task deleted', { label: 'Undo', run: undo });
        }}
      >
        <CloseIcon size={12} />
      </button>
    </li>
  );
}

function ProjectRow({ project, open, onToggle, today }: { project: Project; open: boolean; onToggle: () => void; today: string }) {
  const { data } = useStore();
  const drag = useTrayDrag();
  const { done, total } = projectProgress(data, project.id);
  const dragging = drag.dragging?.kind === 'project' && drag.dragging.id === project.id;
  return (
    <div
      className={`project-row${dragging ? ' is-dragging' : ''}`}
      onPointerDown={(e) => drag.start(e, { kind: 'project', id: project.id }, project.name, project.tone)}
    >
      <button type="button" className={`project-toggle${open ? ' is-open' : ''}`} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onPointerDown={(e) => e.stopPropagation()} onClick={onToggle}>
        <ChevronIcon direction="right" />
      </button>
      <span className="dot" style={{ background: TONES[project.tone].bar }} />
      <span className="project-name">{project.name}</span>
      {project.due && done < total && <Due day={project.due} today={today} />}
      <span className="project-count">
        {done}/{total}
      </span>
    </div>
  );
}

export function TaskTray({ dropHint, open = true }: { dropHint: string | null; open?: boolean }) {
  const { data, dispatch } = useStore();
  const now = useNow();
  const today = dayKey(now);
  const [draft, setDraft] = useState('');
  const [collapsed, setCollapsed] = useViewState<Record<string, boolean>>('collapsed', {});
  const loose = data.tasks.filter((t) => !t.projectId);
  const openCount = data.tasks.filter((t) => !t.done).length;

  return (
    <aside data-tray className={`tray${dropHint ? ' is-drop' : ''}${open ? ' is-open' : ''}`} aria-label="Tasks">
      <div className={`drop-hint${dropHint ? ' is-on' : ''}`}>{dropHint}</div>
      <div className="tray-scroll">
        <div className="tray-head">
          <p className="tray-title">Tasks</p>
          <span className="tray-count">{openCount} open</span>
        </div>
        <p className="tray-tip">Drag onto the week to plan a session, or onto a day's Due strip for a deadline.</p>

        <ul className="task-list">
          {loose.map((t) => (
            <TaskRow key={t.id} task={t} today={today} />
          ))}
        </ul>
        <label className="task-add">
          <PlusIcon />
          <input
            value={draft}
            placeholder="Add a task"
            aria-label="Add a task"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !draft.trim()) return;
              dispatch({ type: 'addTask', task: { id: uid('t'), title: draft.trim(), done: false, projectId: null, due: null, createdAt: Date.now() } });
              setDraft('');
            }}
          />
        </label>

        {data.projects.length > 0 && (
          <>
            <p className="tray-section">Projects</p>
            {data.projects.map((p) => {
              const isOpen = !collapsed[p.id];
              return (
                <div key={p.id} className="project">
                  <ProjectRow project={p} open={isOpen} today={today} onToggle={() => setCollapsed((c) => ({ ...c, [p.id]: isOpen }))} />
                  {isOpen && (
                    <ul className="task-list">
                      {data.tasks
                        .filter((t) => t.projectId === p.id)
                        .map((t) => (
                          <TaskRow key={t.id} task={t} today={today} indent />
                        ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}
