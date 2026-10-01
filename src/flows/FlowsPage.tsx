import { useEffect, useState } from 'react';
import { useTrayDrag } from '../ui/drag';
import { TaskTray } from '../ui/TaskTray';
import { useMedia } from '../ui/useMedia';
import { Canvas } from './Canvas';

export function FlowsPage({ focusProject }: { focusProject: string | null }) {
  const narrow = useMedia('(max-width: 760px)');
  const [hint, setHint] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const { dragging } = useTrayDrag();

  // On a phone the tray covers the page, so it gets out of the way once a drag starts.
  useEffect(() => {
    if (narrow && dragging) setTrayOpen(false);
  }, [narrow, dragging]);
  return (
    <div className="page">
      <header className="page-bar">
        <div className="page-bar-left">
          {narrow && (
            <button type="button" className={`tool-btn${trayOpen ? ' is-active' : ''}`} onClick={() => setTrayOpen(!trayOpen)}>
              Tasks
            </button>
          )}
          <h1 className="page-title">Flows</h1>
        </div>
        <p className="page-tip">Drag tasks in, pull a card's dot to link it, select a few and group them into a project.</p>
      </header>
      <div className="page-body">
        <TaskTray dropHint={hint} open={!narrow || trayOpen} />
        <Canvas focusProject={focusProject} onDropHint={setHint} />
      </div>
    </div>
  );
}
