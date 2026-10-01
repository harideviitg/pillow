import { useEffect } from 'react';
import { AgentPage } from './agent/AgentPage';
import { FlowsPage } from './flows/FlowsPage';
import { typing, useRoute } from './lib/route';
import { PlanPage } from './plan/PlanPage';
import { StoreProvider, useStore } from './store/store';
import type { Data } from './store/types';
import { TrayDragProvider } from './ui/drag';
import { Sidebar } from './ui/Sidebar';
import { ToastProvider, useToast } from './ui/toast';

export function App({ initial }: { initial?: Data }) {
  return (
    <StoreProvider initial={initial}>
      <ToastProvider>
        <TrayDragProvider>
          <Shell />
        </TrayDragProvider>
      </ToastProvider>
    </StoreProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { undo, redo, canUndo, canRedo } = useStore();
  const toast = useToast();

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || typing(e)) return;
      e.preventDefault();
      const redoing = e.shiftKey;
      if (redoing ? !canRedo : !canUndo) return;
      if (redoing) redo();
      else undo();
      toast(redoing ? 'Redone' : 'Undone');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [undo, redo, canUndo, canRedo, toast]);

  return (
    <div className="app">
      <Sidebar page={route.page} />
      <main className="main">
        {route.page === 'plan' && <PlanPage />}
        {route.page === 'flows' && <FlowsPage focusProject={route.project} />}
        {route.page === 'agent' && <AgentPage />}
      </main>
    </div>
  );
}
