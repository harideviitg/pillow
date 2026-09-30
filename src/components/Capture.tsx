import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseCapture } from '../domain/capture';
import { relativeDay } from '../domain/dates';
import { uid } from '../domain/seed';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { projectColor } from './ui';

/** One box for anything: a task, an idea, or something you're waiting on. */
export function Capture({ onClose }: { onClose: () => void }) {
  const { data, dispatch, undo } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const now = Date.now();
  const parsed = parseCapture(text, data.projects, now);
  const project = parsed?.projectId ? data.projects.find((p) => p.id === parsed.projectId) : null;

  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.inert = true;
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      if (root) root.inert = false;
      previous?.focus?.();
    };
  }, []);

  const save = () => {
    if (!parsed) return;
    const at = Date.now();
    if (parsed.kind === 'wait') {
      dispatch({ type: 'addWait', wait: { id: uid(), text: parsed.text, projectId: parsed.projectId, since: at, doneAt: null } });
    } else {
      dispatch({ type: 'addTask', task: { id: uid(), text: parsed.text, projectId: parsed.projectId, done: false, doneAt: null, due: parsed.due, createdAt: at } });
    }
    const where = project ? project.name : 'Inbox';
    toast(parsed.kind === 'wait' ? `Waiting on it. Filed under ${where}.` : `Added to ${where}.`, { action: { label: 'Undo', onClick: undo } });
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop capture-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="capture" role="dialog" aria-modal="true" aria-label="Quick capture">
        <form
          className="capture-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Icon name="plus" size={18} strokeWidth={2.2} />
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
              }
            }}
            placeholder="What's on your mind?"
            aria-label="Capture"
            aria-describedby="capture-hint"
            autoComplete="off"
            enterKeyHint="done"
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={!parsed}>
            Add
          </button>
        </form>
        <div className="capture-meta" id="capture-hint">
          {parsed ? (
            <span className="capture-preview">
              <span className="chip">{parsed.kind === 'wait' ? 'Waiting on' : 'Task'}</span>
              <span className="tag">
                <span className="dot" style={{ background: projectColor(project?.id ?? null) }} />
                {project ? project.name : 'Inbox'}
              </span>
              {parsed.due && <span className="chip is-accent">{relativeDay(parsed.due, now)}</span>}
              {parsed.unknownTag && <span className="muted">No project matches #{parsed.unknownTag}</span>}
            </span>
          ) : (
            <span className="capture-tips">
              <code>#project</code> to file it <code>wait</code> first if it's out of your hands <code>!today</code> <code>!fri</code> for a due day
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
