import { useState } from 'react';
import { blankProject } from '../domain/projects';
import { uid } from '../domain/reducer';
import { useStore } from '../state/store';
import { NewProjectModal } from './Forms';
import { statusPill } from './Header';
import { Icon } from './Icon';

export function ProjectsView({ onOpen }: { onOpen: () => void }) {
  const { data, appDispatch } = useStore();
  const [creating, setCreating] = useState(false);

  return (
    <div className="projects-page">
      <header className="projects-head">
        <div>
          <span className="mono-label">LOCKSTEP</span>
          <h1>Projects</h1>
        </div>
        <button type="button" className="btn btn-dark" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} strokeWidth={2} />
          New project
        </button>
      </header>
      <ul className="project-grid">
        {data.projects.map((p) => {
          const pill = statusPill(p);
          const done = p.rounds.filter((r) => r.state === 'done').length;
          return (
            <li key={p.id}>
              <button
                type="button"
                className="project-card"
                onClick={() => {
                  appDispatch({ type: 'switchProject', projectId: p.id });
                  onOpen();
                }}
              >
                <span className="project-client">{p.client}</span>
                <span className="project-title">{p.name}</span>
                <span className={`status-pill tone-${pill.tone}`}>
                  <span className="dot" />
                  {pill.text}
                </span>
                <span className="project-progress" aria-label={`${done} of ${p.rounds.length} rounds done`}>
                  {p.rounds.map((r) => (
                    <span key={r.id} className={`seg is-${r.state}`} />
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreate={(client, name) => {
            appDispatch({ type: 'createProject', project: blankProject(uid('proj'), client, name, Date.now()) });
            setCreating(false);
            onOpen();
          }}
        />
      )}
    </div>
  );
}
