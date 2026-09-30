import { useState } from 'react';
import { EMPTY } from '../domain/copy';
import { uid } from '../domain/seed';
import { waitingOn } from '../domain/today';
import type { Data, Project } from '../domain/types';
import { GripIcon, Icon } from '../components/Icon';
import { Sortable, type HandleProps } from '../components/Sortable';
import { AddRow, projectColor } from '../components/ui';
import { navigate, projectHash } from '../nav';
import { useStore } from '../state/store';

export function Projects() {
  const { data, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const open = data.projects.filter((p) => !p.archived);
  const archived = data.projects.filter((p) => p.archived);

  const create = (name: string) => {
    const project: Project = { id: uid(), name, leftOffAt: '', leftOffAtUpdated: null, archived: false, createdAt: Date.now() };
    dispatch({ type: 'addProject', project });
    navigate(projectHash(project.id));
  };

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <h1>Projects</h1>
        <button type="button" className="btn btn-sm btn-soft" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
          New project
        </button>
      </header>

      {(adding || open.length === 0) && (
        <div className="section">
          <AddRow placeholder="What are you building?" label="New project name" onAdd={create} autoFocus={adding} />
        </div>
      )}

      {open.length === 0 ? (
        <p className="empty">{EMPTY.projects}</p>
      ) : (
        <Sortable
          list="projects"
          items={open}
          label="Projects"
          className="project-list"
          onMove={(id, beforeId) => dispatch({ type: 'moveProject', id, beforeId })}
          renderItem={(p, handle) => <ProjectRow project={p} data={data} handle={handle} />}
          renderGhost={(p) => <ProjectRow project={p} data={data} />}
        />
      )}

      {archived.length > 0 && (
        <div className="section">
          <button type="button" className="disclosure" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
            <Icon name="chevronDown" size={14} />
            Archived <span className="count">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="rows project-list">
              {archived.map((p) => (
                <li key={p.id}>
                  <ProjectRow project={p} data={data} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project, data, handle }: { project: Project; data: Data; handle?: HandleProps }) {
  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const done = tasks.filter((t) => t.done).length;
  const waiting = waitingOn(data, project.id).length;
  return (
    <div className="project-row-wrap">
      {handle && (
        <span className="grip" {...handle} aria-hidden="true" title="Drag to reorder">
          <GripIcon />
        </span>
      )}
      <a
        href={projectHash(project.id)}
        className="project-row"
        onClick={(e) => {
          e.preventDefault();
          navigate(projectHash(project.id));
        }}
      >
        <span className="project-row-top">
          <span className="dot" style={{ background: projectColor(project.id) }} />
          <span className="project-name">{project.name}</span>
          {waiting > 0 && (
            <span className="mono muted" title={`${waiting} waiting`}>
              <Icon name="hourglass" size={12} /> {waiting}
            </span>
          )}
          <span className="mono muted">
            {done}/{tasks.length}
          </span>
        </span>
        <span className="project-left">{project.leftOffAt || 'No note on where you left off yet.'}</span>
        {tasks.length > 0 && (
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${(done / tasks.length) * 100}%`, background: projectColor(project.id) }} />
          </span>
        )}
      </a>
    </div>
  );
}
