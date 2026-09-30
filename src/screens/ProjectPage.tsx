import { useRef, useState } from 'react';
import { EMPTY } from '../domain/copy';
import { elapsed, formatDate } from '../domain/dates';
import { uid } from '../domain/seed';
import { waitingOn } from '../domain/today';
import type { Project } from '../domain/types';
import { Icon, MoreIcon } from '../components/Icon';
import { MenuButton } from '../components/Popover';
import { TaskRow, WaitRow } from '../components/Rows';
import { Sortable, useFlip } from '../components/Sortable';
import { useToast } from '../components/Toast';
import { AddRow, Check, InlineText, Section, projectColor } from '../components/ui';
import { navigate } from '../nav';
import { useNow, useStore } from '../state/store';

export function ProjectPage({ id }: { id: string }) {
  const { data } = useStore();
  const project = data.projects.find((p) => p.id === id);
  if (!project) {
    return (
      <div className="page">
        <BackLink />
        <p className="empty">That project is gone. Deleted, or it never existed.</p>
      </div>
    );
  }
  return <ProjectView key={project.id} project={project} />;
}

function BackLink() {
  return (
    <a
      href="#/projects"
      className="back"
      onClick={(e) => {
        e.preventDefault();
        navigate('#/projects');
      }}
    >
      <Icon name="back" size={16} />
      Projects
    </a>
  );
}

function ProjectView({ project }: { project: Project }) {
  const { data, dispatch, undo } = useStore();
  const toast = useToast();
  const now = useNow();
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const [showDone, setShowDone] = useState(false);

  const all = data.tasks.filter((t) => t.projectId === project.id);
  const list = all.filter((t) => !t.done || kept.has(t.id));
  const done = all.filter((t) => t.done && !kept.has(t.id)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const waits = waitingOn(data, project.id);
  const doneCount = all.filter((t) => t.done).length;

  const toggle = (taskId: string) => {
    setKept((k) => new Set(k).add(taskId));
    dispatch({ type: 'toggleTask', id: taskId, now: Date.now() });
  };

  const doneRef = useRef<HTMLUListElement>(null);
  useFlip(doneRef, done.map((t) => t.id).join('|'));

  return (
    <div className="page">
      <div className="page-top">
        <BackLink />
        <MenuButton
          label="Project options"
          className="icon-btn"
          items={[
            {
              key: 'archive',
              label: project.archived ? 'Bring back from archive' : 'Archive',
              icon: 'archive',
              onSelect: () => {
                dispatch({ type: 'updateProject', id: project.id, patch: { archived: !project.archived } });
                if (!project.archived) toast(`Archived ${project.name}`, { action: { label: 'Undo', onClick: undo } });
              },
            },
            {
              key: 'delete',
              label: 'Delete project',
              icon: 'trash',
              danger: true,
              onSelect: () => {
                dispatch({ type: 'removeProject', id: project.id });
                navigate('#/projects');
                toast(`Deleted ${project.name}`, { action: { label: 'Undo', onClick: undo } });
              },
            },
          ]}
        >
          <MoreIcon />
        </MenuButton>
      </div>

      <header className="page-head">
        <div className="title-row">
          <span className="dot dot-lg" style={{ background: projectColor(project.id) }} />
          <InlineText value={project.name} label="Project name" className="title-input" onSave={(name) => dispatch({ type: 'updateProject', id: project.id, patch: { name } })} />
        </div>
        {project.archived && <p className="lede">Archived. It won't show up on Today.</p>}
      </header>

      <section className="left-off">
        <div className="left-off-head">
          <h2>Left off at</h2>
          {project.leftOffAtUpdated && <span className="mono muted">{elapsed(project.leftOffAtUpdated, now)} ago</span>}
        </div>
        <InlineText
          multiline
          value={project.leftOffAt}
          label="Where you left off"
          className="left-off-text"
          placeholder="Where did you stop, and what's next? Future you will thank you."
          onSave={(leftOffAt) => dispatch({ type: 'updateProject', id: project.id, patch: { leftOffAt, leftOffAtUpdated: Date.now() } }, `leftoff:${project.id}`)}
        />
      </section>

      <Section title="Checklist" count={all.length ? `${doneCount}/${all.length}` : undefined}>
        {list.length === 0 && done.length > 0 && <p className="empty">All done. Add the next thing or go outside.</p>}
        {all.length === 0 && <p className="empty">{EMPTY.checklist}</p>}
        <Sortable
          list={`tasks:${project.id}`}
          items={list}
          label="Checklist"
          onMove={(taskId, beforeId) => dispatch({ type: 'moveTask', id: taskId, projectId: project.id, beforeId })}
          renderItem={(task, handle) => <TaskRow task={task} projects={data.projects} now={now} onToggle={() => toggle(task.id)} handle={handle} />}
          renderGhost={(task) => <TaskRow task={task} projects={data.projects} now={now} onToggle={() => {}} />}
        />
        <AddRow
          placeholder="Add a task"
          label="Add a task"
          onAdd={(text) =>
            dispatch({ type: 'addTask', task: { id: uid(), text, projectId: project.id, done: false, doneAt: null, due: null, createdAt: Date.now() } })
          }
        />
      </Section>

      <Section title="Waiting on" count={waits.length || undefined}>
        {waits.length > 0 && (
          <ul className="rows">
            {waits.map((w) => (
              <li key={w.id}>
                <WaitRow wait={w} project={project} now={now} />
              </li>
            ))}
          </ul>
        )}
        <AddRow
          placeholder="An agent run, a deploy, a reply"
          label="Add something you're waiting on"
          onAdd={(text) => dispatch({ type: 'addWait', wait: { id: uid(), text, projectId: project.id, since: Date.now(), doneAt: null } })}
        />
      </Section>

      {done.length > 0 && (
        <section className="section">
          <button type="button" className="disclosure" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
            <Icon name="chevronDown" size={14} />
            Done <span className="count">{done.length}</span>
          </button>
          {showDone && (
            <ul className="rows" ref={doneRef}>
              {done.map((task) => (
                <li key={task.id} data-flip-id={task.id}>
                  <div className="row task-row is-done">
                    <Check checked onChange={() => dispatch({ type: 'toggleTask', id: task.id, now: Date.now() })} label={`Mark "${task.text}" not done`} />
                    <span className="row-text">{task.text}</span>
                    <span className="row-meta mono muted">{task.doneAt ? formatDate(task.doneAt) : ''}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
