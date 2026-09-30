import { useCallback, useState } from 'react';
import { Capture } from './components/Capture';
import { Shell, ShortcutsDialog, TAB_KEYS } from './components/Shell';
import { ToastProvider, useToast } from './components/Toast';
import type { Data } from './domain/types';
import { DragProvider } from './dnd/DragProvider';
import { isTypingTarget, navigate, TAB_HASH, tabOf, useHotkeys, useRoute } from './nav';
import { CalendarPage } from './screens/CalendarPage';
import { ProjectPage } from './screens/ProjectPage';
import { Projects } from './screens/Projects';
import { RoutinePage } from './screens/RoutinePage';
import { Routines } from './screens/Routines';
import { Today } from './screens/Today';
import { SessionProvider } from './state/session';
import { StoreProvider, useStore } from './state/store';

export function App({ initial }: { initial?: Data }) {
  return (
    <StoreProvider initial={initial}>
      <SessionProvider>
        <ToastProvider>
          <DragProvider>
            <Pillow />
          </DragProvider>
        </ToastProvider>
      </SessionProvider>
    </StoreProvider>
  );
}

function Pillow() {
  const route = useRoute();
  const { undo, redo, canUndo, canRedo } = useStore();
  const toast = useToast();
  const [capturing, setCapturing] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  useHotkeys(
    useCallback(
      (e: KeyboardEvent) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
          // Text fields keep their own undo.
          if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
          const redoing = e.key === 'y' || e.shiftKey;
          e.preventDefault();
          if (redoing ? !canRedo : !canUndo) return;
          if (redoing) redo();
          else undo();
          toast(redoing ? 'Redone' : 'Undone');
          return;
        }
        if (mod || e.altKey || isTypingTarget(e)) return;
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setCapturing(true);
        } else if (e.key === '?') {
          e.preventDefault();
          setShortcuts(true);
        } else if (TAB_KEYS[e.key]) {
          e.preventDefault();
          navigate(TAB_HASH[TAB_KEYS[e.key]]);
        }
      },
      [undo, redo, canUndo, canRedo, toast],
    ),
  );

  return (
    <Shell tab={tabOf(route)} onCapture={() => setCapturing(true)}>
      {route.name === 'today' && <Today />}
      {route.name === 'projects' && <Projects />}
      {route.name === 'project' && <ProjectPage id={route.id} />}
      {route.name === 'calendar' && <CalendarPage />}
      {route.name === 'routines' && <Routines />}
      {route.name === 'routine' && <RoutinePage id={route.id} />}
      {capturing && <Capture onClose={() => setCapturing(false)} />}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </Shell>
  );
}
