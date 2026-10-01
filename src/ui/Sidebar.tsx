import { go, type Page } from '../lib/route';
import { projectProgress } from '../store/select';
import { useStore } from '../store/store';
import { TONES } from '../store/types';
import { BookingIcon, FlowIcon, SparkIcon } from './icons';

const PAGES: { id: Page; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'plan', label: 'Plan', icon: <BookingIcon size={17} />, hint: 'Tasks and your week' },
  { id: 'flows', label: 'Flows', icon: <FlowIcon size={17} />, hint: 'Map it out, group into projects' },
  { id: 'agent', label: 'Pip', icon: <SparkIcon size={17} />, hint: 'Your agent' },
];

export function Sidebar({ page }: { page: Page }) {
  const { data } = useStore();
  return (
    <nav className="sidebar" aria-label="Sections">
      <a href="#/plan" className="brand" onClick={(e) => (e.preventDefault(), go('#/plan'))}>
        <span className="brand-mark" aria-hidden="true" />
        pillow
      </a>

      <div className="nav">
        {PAGES.map((p) => (
          <a
            key={p.id}
            href={`#/${p.id}`}
            title={p.hint}
            aria-current={page === p.id ? 'page' : undefined}
            className={`nav-item${page === p.id ? ' is-on' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              go(`#/${p.id}`);
            }}
          >
            {p.icon}
            <span>{p.label}</span>
          </a>
        ))}
      </div>

      <p className="nav-heading">Projects</p>
      <div className="nav-projects">
        {data.projects.length === 0 && <p className="nav-empty">Group tasks on Flows and they show up here.</p>}
        {data.projects.map((p) => {
          const { done, total } = projectProgress(data, p.id);
          return (
            <a
              key={p.id}
              href={`#/flows?project=${p.id}`}
              className="nav-project"
              onClick={(e) => {
                e.preventDefault();
                go(`#/flows?project=${encodeURIComponent(p.id)}`);
              }}
            >
              <span className="dot" style={{ background: TONES[p.tone].bar }} />
              <span className="nav-project-name">{p.name}</span>
              <span className="nav-count">
                {done}/{total}
              </span>
            </a>
          );
        })}
      </div>

      <p className="sidebar-foot">Saved on this device</p>
    </nav>
  );
}
