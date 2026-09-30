import { useCallback, useEffect, useState } from 'react';
import { Builder } from './components/Builder';
import { CalendarPage } from './components/calendar/CalendarPage';
import { ProjectsView } from './components/ProjectsView';
import { ReviewerView } from './components/ReviewerView';
import { ShortcutsDialog } from './components/Shell';
import { ToastProvider, useToast } from './components/Toast';
import { DragProvider } from './dnd/DragProvider';
import type { AppData } from './domain/types';
import { isTypingTarget, navigate, useHotkeys, useRoute } from './nav';
import { StoreProvider, useStore } from './state/store';

export { parseHash } from './nav';

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

function GlobalKeys({ onShortcuts }: { onShortcuts: () => void }) {
  const { undo, redo, canUndo, canRedo } = useStore();
  const toast = useToast();
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (mod && !typing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) {
            redo();
            toast('Redone');
          }
        } else if (canUndo) {
          undo();
          toast('Undone');
        }
        return;
      }
      if (mod && !typing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) {
          redo();
          toast('Redone');
        }
        return;
      }
      if (mod || e.altKey || isTypingTarget(e)) return;
      if (e.key === '?') onShortcuts();
      else if (e.key === '1') navigate('#/');
      else if (e.key === '2') navigate('#/calendar');
      else return;
      e.preventDefault();
    },
    [undo, redo, canUndo, canRedo, toast, onShortcuts],
  );
  useHotkeys(handler);
  return null;
}

function Routes() {
  const route = useRoute();
  const [shortcuts, setShortcuts] = useState(false);
  let page;
  if (route.name === 'projects') page = <ProjectsView onOpen={() => navigate('#/')} />;
  else if (route.name === 'review') page = <ReviewPage projectId={route.projectId} roundId={route.roundId} />;
  else if (route.name === 'calendar') page = <CalendarPage focusMeetingId={route.meetingId} />;
  else page = <Builder focusRoundId={route.roundId} />;
  return (
    <>
      <GlobalKeys onShortcuts={() => setShortcuts(true)} />
      {page}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </>
  );
}

export function App({ initial }: { initial?: AppData }) {
  return (
    <StoreProvider initial={initial}>
      <ToastProvider>
        <DragProvider>
          <Routes />
        </DragProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
