import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { dayKey, dueLabel } from '../lib/time';
import { nextTone, uid, type Action } from '../store/reducer';
import { toneOfTask } from '../store/select';
import { useStore, useViewState } from '../store/store';
import { TONES, type FlowNode, type Project, type Task, type TrayRef } from '../store/types';
import { overTray, useDropZone } from '../ui/drag';
import { CheckIcon, CloseIcon, FitIcon, FlagIcon, GroupIcon, MinusIcon, PlusIcon } from '../ui/icons';
import { useToast } from '../ui/toast';

export const CARD_W = 200;
export const CARD_H = 44;
const PAD = 18;
const LABEL = 30;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

type View = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };

type Gesture =
  | { kind: 'pan'; x: number; y: number; view: View }
  | { kind: 'marquee'; x: number; y: number; additive: boolean; base: string[] }
  | { kind: 'cards'; x: number; y: number; start: FlowNode[]; moved: boolean }
  | { kind: 'link'; from: string };

interface Frame {
  project: Project;
  x: number;
  y: number;
  w: number;
  h: number;
  members: string[];
}

/** The box around a project's cards on the canvas. */
export function frameOf(project: Project, nodes: FlowNode[], tasks: Task[]): Frame | null {
  const ids = new Set(tasks.filter((t) => t.projectId === project.id).map((t) => t.id));
  const mine = nodes.filter((n) => ids.has(n.taskId));
  if (mine.length === 0) return null;
  const x0 = Math.min(...mine.map((n) => n.x)) - PAD;
  const y0 = Math.min(...mine.map((n) => n.y)) - PAD - LABEL;
  const x1 = Math.max(...mine.map((n) => n.x + CARD_W)) + PAD;
  const y1 = Math.max(...mine.map((n) => n.y + CARD_H)) + PAD;
  return { project, x: x0, y: y0, w: x1 - x0, h: y1 - y0, members: mine.map((n) => n.taskId) };
}

type Side = 'left' | 'right' | 'top' | 'bottom';
const NORMAL: Record<Side, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

function anchor(n: FlowNode, side: Side): Point {
  if (side === 'left') return { x: n.x, y: n.y + CARD_H / 2 };
  if (side === 'right') return { x: n.x + CARD_W, y: n.y + CARD_H / 2 };
  if (side === 'top') return { x: n.x + CARD_W / 2, y: n.y };
  return { x: n.x + CARD_W / 2, y: n.y + CARD_H };
}

/** Which sides of two cards an arrow should join: side by side, or stacked. */
function sides(a: FlowNode, b: FlowNode): [Side, Side] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= CARD_W * 0.75 || Math.abs(dy) < CARD_H * 1.5) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** A soft curve leaving one side and arriving at another. */
export function edgePath(a: Point, b: Point, from: Side = 'right', to: Side = 'left'): string {
  const reach = Math.max(36, Math.hypot(b.x - a.x, b.y - a.y) / 2.5);
  const c1 = { x: a.x + NORMAL[from].x * reach, y: a.y + NORMAL[from].y * reach };
  const c2 = { x: b.x + NORMAL[to].x * reach, y: b.y + NORMAL[to].y * reach };
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

function linkPath(a: FlowNode, b: FlowNode): string {
  const [from, to] = sides(a, b);
  return edgePath(anchor(a, from), anchor(b, to), from, to);
}

const outPoint = (n: FlowNode): Point => anchor(n, 'right');

interface Props {
  focusProject: string | null;
  onDropHint: (hint: string | null) => void;
}

export function Canvas({ focusProject, onDropHint }: Props) {
  const { data, dispatch, undo } = useStore();
  const toast = useToast();
  const [view, setView] = useViewState<View>('canvas', { x: 40, y: 20, zoom: 1 });
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [link, setLink] = useState<{ from: string; to: Point } | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const trayHint = useRef<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const nodes = data.nodes.filter((n) => tasks.has(n.taskId));
  const byTask = new Map(nodes.map((n) => [n.taskId, n]));
  const frames = data.projects.map((p) => frameOf(p, nodes, data.tasks)).filter((f): f is Frame => !!f);

  const hint = (h: string | null) => {
    if (trayHint.current === h) return;
    trayHint.current = h;
    onDropHint(h);
  };

  const toWorld = (cx: number, cy: number): Point => {
    const r = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };

  const inside = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  };

  const cardAt = (p: Point) => nodes.find((n) => p.x >= n.x && p.x <= n.x + CARD_W && p.y >= n.y && p.y <= n.y + CARD_H);

  const zoomAround = (cx: number, cy: number, next: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const px = cx - r.left;
    const py = cy - r.top;
    setView({ zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom });
  };

  const fit = (ids?: string[]) => {
    const el = ref.current;
    const list = ids ? nodes.filter((n) => ids.includes(n.taskId)) : nodes;
    if (!el || list.length === 0) return;
    const x0 = Math.min(...list.map((n) => n.x)) - PAD - 40;
    const y0 = Math.min(...list.map((n) => n.y)) - PAD - LABEL - 40;
    const x1 = Math.max(...list.map((n) => n.x + CARD_W)) + PAD + 40;
    const y1 = Math.max(...list.map((n) => n.y + CARD_H)) + PAD + 40;
    const zoom = Math.min(1.2, Math.max(MIN_ZOOM, Math.min(el.clientWidth / (x1 - x0), el.clientHeight / (y1 - y0))));
    setView({ zoom, x: el.clientWidth / 2 - ((x0 + x1) / 2) * zoom, y: el.clientHeight / 2 - ((y0 + y1) / 2) * zoom });
  };

  // Opening a project from the sidebar brings its cards into view.
  useLayoutEffect(() => {
    if (!focusProject) return;
    const members = data.tasks.filter((t) => t.projectId === focusProject).map((t) => t.id);
    if (members.some((id) => byTask.has(id))) {
      fit(members);
      setSelected(members.filter((id) => byTask.has(id)));
    }
    // Only when the requested project changes.
  }, [focusProject]);

  const group = () => {
    if (selected.length < 2) return;
    const project: Project = { id: uid('p'), name: 'New project', tone: nextTone(data.projects), due: null, createdAt: Date.now() };
    // Projects left empty by this regroup go away.
    const leftEmpty = data.projects.filter((p) => {
      const members = data.tasks.filter((t) => t.projectId === p.id);
      return members.length > 0 && members.every((t) => selected.includes(t.id));
    });
    dispatch({ type: 'batch', actions: [{ type: 'groupTasks', project, taskIds: selected }, ...leftEmpty.map((p): Action => ({ type: 'ungroup', id: p.id }))] });
    setRenaming(project.id);
    setSelected([]);
    toast('Grouped into a project. It is in your tasks now.', { label: 'Undo', run: undo });
  };

  const addCardAt = (p: Point) => {
    const id = uid('t');
    dispatch({
      type: 'batch',
      actions: [
        { type: 'addTask', task: { id, title: '', done: false, projectId: null, due: null, createdAt: Date.now() } },
        { type: 'placeNode', node: { taskId: id, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 } },
      ],
    });
    setEditing(id);
    setSelected([id]);
  };

  // Tasks and projects dropped in from the tray land where you let go.
  useDropZone({
    move: (_r: TrayRef, x, y) => {
      if (!inside(x, y)) return false;
      setGhost(toWorld(x, y));
      return true;
    },
    drop: (r: TrayRef, x, y) => {
      setGhost(null);
      if (!inside(x, y)) return;
      const p = toWorld(x, y);
      if (r.kind === 'task') {
        dispatch({ type: 'placeNode', node: { taskId: r.id, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 } });
        setSelected([r.id]);
        return;
      }
      const loose = data.tasks.filter((t) => t.projectId === r.id && !byTask.has(t.id));
      dispatch({ type: 'batch', actions: loose.map((t, i) => ({ type: 'placeNode' as const, node: { taskId: t.id, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 + i * (CARD_H + 12) } })) });
      setSelected(data.tasks.filter((t) => t.projectId === r.id).map((t) => t.id));
    },
    leave: () => setGhost(null),
  });

  const moveTo = (cx: number, cy: number) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      setView({ ...g.view, x: g.view.x + cx - g.x, y: g.view.y + cy - g.y });
      return;
    }
    if (g.kind === 'marquee') {
      const r = ref.current!.getBoundingClientRect();
      const box = { x0: g.x - r.left, y0: g.y - r.top, x1: cx - r.left, y1: cy - r.top };
      setMarquee(box);
      const a = toWorld(Math.min(g.x, cx), Math.min(g.y, cy));
      const b = toWorld(Math.max(g.x, cx), Math.max(g.y, cy));
      const hits = nodes.filter((n) => n.x < b.x && n.x + CARD_W > a.x && n.y < b.y && n.y + CARD_H > a.y).map((n) => n.taskId);
      setSelected(g.additive ? [...new Set([...g.base, ...hits])] : hits);
      return;
    }
    if (g.kind === 'cards') {
      if (!g.moved && Math.hypot(cx - g.x, cy - g.y) < 3) return;
      if (!g.moved) {
        g.moved = true;
        document.documentElement.style.cursor = 'grabbing';
      }
      if (overTray(cx, cy)) {
        hint(g.start.length > 1 ? 'Drop to take these off the canvas' : 'Drop to take it off the canvas');
        return;
      }
      hint(null);
      const z = viewRef.current.zoom;
      const dx = (cx - g.x) / z;
      const dy = (cy - g.y) / z;
      dispatch({ type: 'moveNodes', moves: g.start.map((n) => ({ taskId: n.taskId, x: Math.round(n.x + dx), y: Math.round(n.y + dy) })) }, 'move-cards');
      return;
    }
    setLink({ from: g.from, to: toWorld(cx, cy) });
  };

  const finish = (cx: number, cy: number) => {
    const g = gesture.current;
    gesture.current = null;
    document.documentElement.style.cursor = '';
    if (!g) return;
    const wasTray = trayHint.current !== null;
    hint(null);
    if (g.kind === 'marquee') setMarquee(null);
    if (g.kind === 'cards' && g.moved && wasTray) {
      dispatch({ type: 'removeNodes', taskIds: g.start.map((n) => n.taskId) });
      setSelected([]);
      toast('Taken off the canvas. Still in your tasks.', { label: 'Undo', run: undo });
    }
    if (g.kind === 'link') {
      setLink(null);
      const target = cardAt(toWorld(cx, cy));
      if (target && target.taskId !== g.from) dispatch({ type: 'addEdge', edge: { id: uid('f'), from: g.from, to: target.taskId } });
    }
  };

  const moveRef = useRef(moveTo);
  const finishRef = useRef(finish);
  moveRef.current = moveTo;
  finishRef.current = finish;

  useEffect(() => {
    const onMove = (e: PointerEvent) => moveRef.current(e.clientX, e.clientY);
    const onUp = (e: PointerEvent) => finishRef.current(e.clientX, e.clientY);
    const onCancel = () => {
      gesture.current = null;
      setMarquee(null);
      setLink(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  // Scroll pans, pinch or Ctrl/Cmd + scroll zooms.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAround(e.clientX, e.clientY, viewRef.current.zoom * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.006));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typingNow = !!(e.target as HTMLElement)?.closest?.('input, textarea');
      if (e.key === ' ' && !typingNow) {
        setSpaceDown(e.type === 'keydown');
        if (e.type === 'keydown') e.preventDefault();
        return;
      }
      if (e.type !== 'keydown' || typingNow) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        group();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(nodes.map((n) => n.taskId));
      } else if (e.key === 'Escape') {
        setSelected([]);
        setSelectedEdge(null);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedEdge) {
          e.preventDefault();
          dispatch({ type: 'removeEdge', id: selectedEdge });
          setSelectedEdge(null);
        } else if (selected.length) {
          e.preventDefault();
          dispatch({ type: 'removeNodes', taskIds: selected });
          setSelected([]);
          toast('Taken off the canvas. Still in your tasks.', { label: 'Undo', run: undo });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  });

  const onBackgroundDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-card], [data-frame], .canvas-ui')) return;
    setSelectedEdge(null);
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, view: viewRef.current };
      document.documentElement.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') {
      gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, view: viewRef.current };
      return;
    }
    gesture.current = { kind: 'marquee', x: e.clientX, y: e.clientY, additive: e.shiftKey, base: e.shiftKey ? selected : [] };
    if (!e.shiftKey) setSelected([]);
  };

  const startCards = (e: React.PointerEvent, taskId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedEdge(null);
    let ids = selected;
    if (e.shiftKey) ids = selected.includes(taskId) ? selected.filter((id) => id !== taskId) : [...selected, taskId];
    else if (!selected.includes(taskId)) ids = [taskId];
    setSelected(ids);
    if (!ids.includes(taskId)) return;
    gesture.current = { kind: 'cards', x: e.clientX, y: e.clientY, start: nodes.filter((n) => ids.includes(n.taskId)), moved: false };
  };

  const today = dayKey(Date.now());
  const dots = 22 * view.zoom;

  return (
    <div
      ref={ref}
      className={`canvas${spaceDown ? ' is-panning' : ''}`}
      onPointerDown={onBackgroundDown}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-card], [data-frame], .canvas-ui')) return;
        addCardAt(toWorld(e.clientX, e.clientY));
      }}
      style={{ backgroundSize: `${dots}px ${dots}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {frames.map((f) => (
          <div
            key={f.project.id}
            data-frame={f.project.id}
            className="frame"
            style={{ left: f.x, top: f.y, width: f.w, height: f.h, '--bar': TONES[f.project.tone].bar, '--fill': TONES[f.project.tone].fill, '--ink': TONES[f.project.tone].ink } as CSSProperties}
          >
            <div
              className="frame-label"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0 || renaming === f.project.id) return;
                setSelected(f.members);
                gesture.current = { kind: 'cards', x: e.clientX, y: e.clientY, start: nodes.filter((n) => f.members.includes(n.taskId)), moved: false };
              }}
              onDoubleClick={() => setRenaming(f.project.id)}
            >
              <span className="dot" />
              {renaming === f.project.id ? (
                <RenameInput
                  value={f.project.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name) dispatch({ type: 'updateProject', id: f.project.id, patch: { name } });
                  }}
                />
              ) : (
                <span className="frame-name">{f.project.name}</span>
              )}
              <span className="frame-count">
                {data.tasks.filter((t) => t.projectId === f.project.id && t.done).length}/{data.tasks.filter((t) => t.projectId === f.project.id).length}
              </span>
              <button
                type="button"
                className="frame-ungroup"
                title="Ungroup"
                aria-label={`Ungroup ${f.project.name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  dispatch({ type: 'ungroup', id: f.project.id });
                  toast(`Ungrouped ${f.project.name}`, { label: 'Undo', run: undo });
                }}
              >
                <CloseIcon size={11} />
              </button>
            </div>
          </div>
        ))}

        <svg className="edges" aria-hidden="true">
          <defs>
            {[
              ['arrow', 'rgba(20, 20, 20, 0.32)'],
              ['arrow-on', '#e8604c'],
            ].map(([id, colour]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 1 1.5 L 8 5 L 1 8.5" fill="none" stroke={colour} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            ))}
          </defs>
          {data.edges.map((edge) => {
            const a = byTask.get(edge.from);
            const b = byTask.get(edge.to);
            if (!a || !b) return null;
            const d = linkPath(a, b);
            const on = selectedEdge === edge.id;
            return (
              <g key={edge.id} className={`edge${on ? ' is-on' : ''}`}>
                <path d={d} className="edge-hit" onPointerDown={(e) => (e.stopPropagation(), setSelectedEdge(edge.id), setSelected([]))} />
                <path d={d} className="edge-line" markerEnd={on ? 'url(#arrow-on)' : 'url(#arrow)'} />
              </g>
            );
          })}
          {link && byTask.get(link.from) && <path className="edge-line is-draft" d={edgePath(outPoint(byTask.get(link.from)!), link.to)} markerEnd="url(#arrow)" />}
        </svg>

        {nodes.map((n) => {
          const task = tasks.get(n.taskId)!;
          const tone = toneOfTask(data, task);
          const on = selected.includes(n.taskId);
          return (
            <div
              key={n.taskId}
              data-card={n.taskId}
              className={`card${on ? ' is-selected' : ''}${task.done ? ' is-done' : ''}`}
              style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, '--bar': TONES[tone].bar } as CSSProperties}
              onPointerDown={(e) => startCards(e, n.taskId)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(n.taskId);
              }}
            >
              <span className="card-bar" />
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
                className={`task-check${task.done ? ' is-done' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => dispatch({ type: 'updateTask', id: task.id, patch: { done: !task.done } })}
              >
                {task.done && <CheckIcon size={10} strokeWidth={3.4} />}
              </button>
              {editing === n.taskId ? (
                <RenameInput
                  value={task.title}
                  placeholder="Name this task"
                  onDone={(title) => {
                    setEditing(null);
                    if (title) dispatch({ type: 'updateTask', id: task.id, patch: { title } });
                    else if (!task.title) dispatch({ type: 'removeTask', id: task.id });
                  }}
                />
              ) : (
                <span className="card-title">{task.title || 'Untitled'}</span>
              )}
              {task.due && !task.done && (
                <span className={`card-due${dueLabel(task.due, today) === 'Today' || dueLabel(task.due, today) === 'Overdue' ? ' is-hot' : ''}`}>
                  <FlagIcon size={9} />
                  {dueLabel(task.due, today)}
                </span>
              )}
              <span
                className="handle"
                title="Drag to another card to link them"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return;
                  gesture.current = { kind: 'link', from: n.taskId };
                  setLink({ from: n.taskId, to: toWorld(e.clientX, e.clientY) });
                }}
              />
            </div>
          );
        })}

        {ghost && <div className="card-ghost" style={{ left: ghost.x - CARD_W / 2, top: ghost.y - CARD_H / 2, width: CARD_W, height: CARD_H }} />}
      </div>

      {marquee && (
        <div
          className="marquee"
          style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
        />
      )}

      {nodes.length === 0 && (
        <div className="canvas-empty">
          <p className="canvas-empty-title">A blank canvas. Lovely.</p>
          <p>Drag tasks in from the left, or double-click anywhere to jot one down.</p>
        </div>
      )}

      {selected.length >= 2 && (
        <div className="select-bar canvas-ui" onPointerDown={(e) => e.stopPropagation()}>
          <span>{selected.length} selected</span>
          <button type="button" className="select-btn" onClick={group}>
            <GroupIcon />
            Group into project
            <kbd>⌘G</kbd>
          </button>
        </div>
      )}

      <div className="zoom canvas-ui" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomAround(...centre(ref.current), view.zoom / 1.2)}>
          <MinusIcon />
        </button>
        <button type="button" className="zoom-level" onClick={() => zoomAround(...centre(ref.current), 1)} title="Back to 100%">
          {Math.round(view.zoom * 100)}%
        </button>
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomAround(...centre(ref.current), view.zoom * 1.2)}>
          <PlusIcon />
        </button>
        <button type="button" className="icon-btn" aria-label="Fit everything" onClick={() => fit()}>
          <FitIcon />
        </button>
      </div>
    </div>
  );
}

function centre(el: HTMLElement | null): [number, number] {
  const r = el?.getBoundingClientRect();
  return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0];
}

function RenameInput({ value, placeholder, onDone }: { value: string; placeholder?: string; onDone: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      autoFocus
      className="rename"
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          onDone(value);
        }
      }}
    />
  );
}
