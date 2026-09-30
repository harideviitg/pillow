import { useRef } from 'react';
import { waitingHint } from '../domain/copy';
import { addDays, dayKey, elapsed, relativeDay } from '../domain/dates';
import type { Project, Task, Wait } from '../domain/types';
import { useStore } from '../state/store';
import { GripIcon, Icon, MoreIcon } from './Icon';
import { MenuButton, type MenuItem } from './Popover';
import type { HandleProps } from './Sortable';
import { useToast } from './Toast';
import { Check, InlineText, ProjectTag } from './ui';

function Handle({ handle }: { handle?: HandleProps }) {
  if (!handle) return null;
  return (
    <span className="grip" {...handle} aria-hidden="true" title="Drag to reorder">
      <GripIcon />
    </span>
  );
}

interface TaskRowProps {
  task: Task;
  projects: Project[];
  now: number;
  onToggle: () => void;
  showProject?: boolean;
  handle?: HandleProps;
}

export function TaskRow({ task, projects, now, onToggle, showProject, handle }: TaskRowProps) {
  const { dispatch, undo } = useStore();
  const toast = useToast();
  const dateRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === task.projectId) ?? null;
  const today = dayKey(now);
  const setDue = (due: string | null) => dispatch({ type: 'updateTask', id: task.id, patch: { due } });

  const items: MenuItem[] = [
    { key: 'h-due', heading: 'Due' },
    { key: 'today', label: 'Today', checked: task.due === today, onSelect: () => setDue(today) },
    { key: 'tomorrow', label: 'Tomorrow', checked: task.due === dayKey(addDays(now, 1)), onSelect: () => setDue(dayKey(addDays(now, 1))) },
    {
      key: 'pick',
      label: 'Pick a date',
      onSelect: () => {
        const input = dateRef.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.focus();
      },
    },
    ...(task.due ? [{ key: 'clear', label: 'No due date', onSelect: () => setDue(null) }] : []),
    { key: 'sep1', separator: true },
    { key: 'h-move', heading: 'Move to' },
    { key: 'inbox', label: 'Inbox', checked: task.projectId === null, onSelect: () => dispatch({ type: 'moveTask', id: task.id, projectId: null, beforeId: null }) },
    ...projects
      .filter((p) => !p.archived)
      .map((p) => ({
        key: `p-${p.id}`,
        label: p.name,
        checked: task.projectId === p.id,
        onSelect: () => dispatch({ type: 'moveTask', id: task.id, projectId: p.id, beforeId: null }),
      })),
    { key: 'sep2', separator: true },
    {
      key: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => {
        dispatch({ type: 'removeTask', id: task.id });
        toast('Task deleted', { action: { label: 'Undo', onClick: undo } });
      },
    },
  ];

  const overdue = task.due !== null && task.due < today && !task.done;

  return (
    <div className={`row task-row${task.done ? ' is-done' : ''}`}>
      <Handle handle={handle} />
      <Check checked={task.done} onChange={onToggle} label={task.done ? `Mark "${task.text}" not done` : `Mark "${task.text}" done`} />
      <InlineText value={task.text} label="Task" className="row-text" onSave={(text) => dispatch({ type: 'updateTask', id: task.id, patch: { text } })} />
      <span className="row-meta">
        {task.due && <span className={`chip${overdue ? ' is-warn' : task.due === today ? ' is-accent' : ''}`}>{overdue ? 'Overdue' : relativeDay(task.due, now)}</span>}
        {showProject && <ProjectTag project={project} fallback="Inbox" />}
      </span>
      <input
        ref={dateRef}
        type="date"
        className="date-proxy"
        tabIndex={-1}
        aria-hidden="true"
        value={task.due ?? ''}
        onChange={(e) => e.target.value && setDue(e.target.value)}
      />
      <MenuButton items={items} label={`More for "${task.text}"`} className="icon-btn row-more" width={220}>
        <MoreIcon />
      </MenuButton>
    </div>
  );
}

export function WaitRow({ wait, project, now, showProject }: { wait: Wait; project: Project | null; now: number; showProject?: boolean }) {
  const { dispatch, undo } = useStore();
  const toast = useToast();
  const hint = waitingHint(now - wait.since);
  return (
    <div className="row wait-row">
      <span className="wait-icon" aria-hidden="true">
        <Icon name="hourglass" size={15} />
      </span>
      <InlineText value={wait.text} label="Waiting on" className="row-text" onSave={(text) => dispatch({ type: 'updateWait', id: wait.id, patch: { text } })} />
      <span className="row-meta">
        {showProject && project && <ProjectTag project={project} />}
        <span className={`mono${hint ? ' text-warn' : ''}`} title={hint ?? `Waiting since ${new Date(wait.since).toLocaleString()}`}>
          {elapsed(wait.since, now)}
        </span>
      </span>
      <button
        type="button"
        className="btn btn-sm btn-soft"
        aria-label={`Landed: ${wait.text}`}
        onClick={() => {
          dispatch({ type: 'clearWait', id: wait.id, now: Date.now() });
          toast('Landed. Nice.', { action: { label: 'Undo', onClick: undo } });
        }}
      >
        <Icon name="check" size={14} strokeWidth={2.2} />
        <span className="landed-label">Landed</span>
      </button>
      <MenuButton
        items={[
          {
            key: 'delete',
            label: 'Delete',
            danger: true,
            onSelect: () => {
              dispatch({ type: 'removeWait', id: wait.id });
              toast('Deleted', { action: { label: 'Undo', onClick: undo } });
            },
          },
        ]}
        label={`More for "${wait.text}"`}
        className="icon-btn row-more"
        width={180}
      >
        <MoreIcon />
      </MenuButton>
    </div>
  );
}
