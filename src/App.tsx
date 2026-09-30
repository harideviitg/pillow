import { useEffect, useState } from 'react';
import { Builder } from './components/Builder';
import { ProjectsView } from './components/ProjectsView';
import { ReviewerView } from './components/ReviewerView';
import { ToastProvider } from './components/Toast';
import type { AppData } from './domain/types';
import { StoreProvider, useStore } from './state/store';

type Route = { name: 'builder' } | { name: 'projects' } | { name: 'review'; projectId: string; roundId: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'review' && parts[1] && parts[2]) return { name: 'review', projectId: parts[1], roundId: parts[2] };
  return { name: 'builder' };
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function ReviewPage({ projectId, roundId }: { projectId: string; roundId: string }) {
  const { data, project, appDispatch } = useStore();
  const exists = data.projects.some((p) => p.id === projectId);

  useEffect(() => {
    if (exists && project.id !== projectId) appDispatch({ type: 'switchProject', projectId });
  }, [exists, project.id, projectId, appDispatch]);

  return (
    <div className="review-page">
      <header className="review-head">
        <span className="mono-label">LOCKSTEP REVIEW</span>
        {exists && project.id === projectId && (
          <h1>
            {project.client} <span aria-hidden="true">/</span> {project.name}
          </h1>
        )}
      </header>
      <main className="review-main">
        {!exists ? (
          <p className="panel-empty">This review link points to a project that isn’t saved in this browser.</p>
        ) : project.id === projectId ? (
          <ReviewerView roundId={roundId} />
        ) : null}
        <p className="review-foot">
          <a href="#/">Open the flow builder</a>
        </p>
      </main>
    </div>
  );
}

function Routes() {
  const route = useRoute();
  if (route.name === 'projects') return <ProjectsView onOpen={() => (window.location.hash = '#/')} />;
  if (route.name === 'review') return <ReviewPage projectId={route.projectId} roundId={route.roundId} />;
  return <Builder />;
}

export function App({ initial }: { initial?: AppData }) {
  return (
    <StoreProvider initial={initial}>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </StoreProvider>
  );
}
