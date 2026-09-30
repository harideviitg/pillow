import { useCallback, useState } from 'react';
import { EMPTY } from '../domain/copy';
import { addDays, formatDuration, formatTime, rangeTitle, startOfDay, startOfWeek, weekdayName, formatDate } from '../domain/dates';
import { uid } from '../domain/seed';
import type { Block } from '../domain/types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { TimeGrid } from '../components/TimeGrid';
import { useToast } from '../components/Toast';
import { useMediaQuery } from '../components/ui';
import { isTypingTarget, useHotkeys } from '../nav';
import { useNow, useStore } from '../state/store';

export function CalendarPage() {
  const { data, dispatch, undo } = useStore();
  const toast = useToast();
  const now = useNow();
  const narrow = useMediaQuery('(max-width: 640px)');
  const span = narrow ? 3 : 7;
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; fresh: boolean } | null>(null);

  const first = narrow ? anchor : startOfWeek(anchor);
  const days = Array.from({ length: span }, (_, i) => addDays(first, i));
  const shift = useCallback((dir: number) => setAnchor((a) => addDays(a, dir * span)), [span]);

  useHotkeys(
    useCallback(
      (e: KeyboardEvent) => {
        if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'ArrowLeft') shift(-1);
        else if (e.key === 'ArrowRight') shift(1);
        else if (e.key === 't' || e.key === 'T') setAnchor(startOfDay(Date.now()));
        else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
          dispatch({ type: 'removeBlock', id: selected });
          setSelected(null);
          toast('Block deleted', { action: { label: 'Undo', onClick: undo } });
        } else if (e.key === 'Enter' && selected) setEditing({ id: selected, fresh: false });
        else return;
        e.preventDefault();
      },
      [shift, selected, dispatch, toast, undo],
    ),
  );

  const block = editing ? data.blocks.find((b) => b.id === editing.id) : undefined;

  return (
    <div className="page page-wide calendar-page">
      <header className="page-head page-head-row cal-head">
        <h1>{rangeTitle(days, now)}</h1>
        <div className="cal-nav">
          <button type="button" className="icon-btn" aria-label="Earlier" onClick={() => shift(-1)}>
            <Icon name="chevronLeft" size={18} />
          </button>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => setAnchor(startOfDay(Date.now()))}>
            Today
          </button>
          <button type="button" className="icon-btn" aria-label="Later" onClick={() => shift(1)}>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </header>
      <p className="section-note cal-hint">{EMPTY.calendarHint}</p>

      <TimeGrid
        days={days}
        blocks={data.blocks}
        projects={data.projects}
        now={now}
        selectedId={selected}
        hourHeight={narrow ? 44 : 48}
        onSelect={(id) => {
          if (id && id === selected) setEditing({ id, fresh: false });
          setSelected(id);
        }}
        onCreate={(start, end) => {
          const b: Block = { id: uid(), title: '', start, end, projectId: null };
          dispatch({ type: 'addBlock', block: b });
          setSelected(b.id);
          setEditing({ id: b.id, fresh: true });
        }}
        onChange={(id, start, end) => dispatch({ type: 'updateBlock', id, patch: { start, end } })}
      />

      {block && editing && (
        <BlockEditor
          block={block}
          fresh={editing.fresh}
          onClose={() => setEditing(null)}
          onDelete={() => {
            dispatch({ type: 'removeBlock', id: block.id });
            setEditing(null);
            setSelected(null);
            toast('Block deleted', { action: { label: 'Undo', onClick: undo } });
          }}
        />
      )}
    </div>
  );
}

function BlockEditor({ block, fresh, onClose, onDelete }: { block: Block; fresh: boolean; onClose: () => void; onDelete: () => void }) {
  const { data, dispatch } = useStore();
  const [title, setTitle] = useState(block.title);
  const save = () => {
    if (title.trim() !== block.title) dispatch({ type: 'updateBlock', id: block.id, patch: { title: title.trim() } });
    onClose();
  };

  return (
    <Modal title={fresh ? 'New block' : 'Block'} onClose={save} width={420}>
      <form
        className="block-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>What</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deep work, Gym, Ship it" autoComplete="off" data-autofocus />
        </label>
        <p className="mono muted block-when">
          {weekdayName(block.start)} {formatDate(block.start)}, {formatTime(block.start)} to {formatTime(block.end)} ({formatDuration(block.end - block.start)})
        </p>
        <label className="field">
          <span>Project</span>
          <select value={block.projectId ?? ''} onChange={(e) => dispatch({ type: 'updateBlock', id: block.id, patch: { projectId: e.target.value || null } })}>
            <option value="">None</option>
            {data.projects
              .filter((p) => !p.archived || p.id === block.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-danger" onClick={onDelete}>
            <Icon name="trash" size={15} />
            Delete
          </button>
          <button type="submit" className="btn btn-primary">
            Done
          </button>
        </div>
      </form>
    </Modal>
  );
}
