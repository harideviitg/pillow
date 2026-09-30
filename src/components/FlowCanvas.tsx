import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ROUND_KINDS, roundKindDef, type Block } from '../domain/catalog';
import { edgePath, layoutFlow, type FlowLayout } from '../domain/layout';
import { newRound } from '../domain/reducer';
import type { AspectId, Project, RoundKind } from '../domain/types';
import { useDrag, useDraggable, useDragMove, useDropTarget, type DragPayload, type Point } from '../dnd/DragProvider';
import { animate, easeOutCubic } from '../motion/easing';
import { useAnimatedLayout, type ShownNode } from '../motion/useAnimatedLayout';
import { dropHint, nodeLabel, NodeBody, RoundMenu, RoundNodeBody } from './FlowNodes';
import { Icon } from './Icon';
import { MenuButton } from './Popover';
import type { NodeSelection } from './selection';
import { selectionKey } from './selection';
import { ROUND_ICON } from './ui';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const EDGE_PAN = 56;

interface View {
  x: number;
  y: number;
  z: number;
}

export interface CanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  actualSize: () => void;
}

export interface CanvasActions {
  onSelect: (sel: NodeSelection) => void;
  onInsert: (index: number, kind: RoundKind, id?: string) => void;
  onReorder: (roundId: string, toIndex: number) => void;
  onRemove: (roundId: string) => void;
  onApplyBlock: (roundId: string, block: Block) => void;
  onAddReviewer: (roundId: string, personId: string) => void;
  onFinalSay: (roundId: string, personId: string) => void;
  onMoveAspect: (aspect: AspectId, fromRoundId: string, toRoundId: string) => void;
  onApprove: (roundId: string) => void;
  onRequestChanges: (roundId: string) => void;
  onMove: (roundId: string, delta: -1 | 1) => void;
  onPinned: (roundId: string) => void;
}

interface FlowCanvasProps {
  project: Project;
  now: number;
  selection: NodeSelection | null;
  actions: CanvasActions;
  flaggedRoundIds: Set<string>;
  revealRequest: { key: string; n: number } | null;
}

/** The project as it would look with the dragged round dropped at `index`. */
export function previewProject(project: Project, payload: DragPayload | null, index: number | null): { project: Project; key: string | null } {
  if (!payload) return { project, key: null };
  if (payload.kind === 'round') {
    const round = project.rounds.find((r) => r.id === payload.roundId);
    if (!round) return { project, key: null };
    const rest = project.rounds.filter((r) => r.id !== round.id);
    if (index === null) return { project: { ...project, rounds: rest }, key: null };
    rest.splice(index, 0, round);
    return { project: { ...project, rounds: rest }, key: round.id };
  }
  if (payload.kind === 'block' && payload.block.type === 'round' && index !== null) {
    const rounds = [...project.rounds];
    rounds.splice(index, 0, newRound(project, index, payload.block.kind, payload.id));
    return { project: { ...project, rounds }, key: payload.id };
  }
  return { project, key: null };
}

function isRoundDrag(payload: DragPayload | null): boolean {
  return !!payload && (payload.kind === 'round' || (payload.kind === 'block' && payload.block.type === 'round'));
}

export const FlowCanvas = forwardRef<CanvasHandle, FlowCanvasProps>(function FlowCanvas(props, handle) {
  const { project, now, selection, actions, flaggedRoundIds, revealRequest } = props;
  const { active } = useDrag();
  const viewportRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, z: 1 });
  const size = useRef({ w: 0, h: 0 });
  const userMoved = useRef(false);
  const viewSubs = useRef(new Set<(v: View) => void>());
  const notifyFrame = useRef(0);
  const stopMotion = useRef<() => void>(() => {});
  const [panning, setPanning] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const lastPointer = useRef<Point | null>(null);

  const roundDrag = isRoundDrag(active);
  const preview = useMemo(() => previewProject(project, roundDrag ? active : null, previewIndex), [project, active, roundDrag, previewIndex]);
  const layout = useMemo(() => layoutFlow(preview.project), [preview.project]);
  const shown = useAnimatedLayout(layout);
  const layoutRef = useRef<FlowLayout>(layout);
  layoutRef.current = layout;

  // Slots are measured on the flow without the dragged round, so they stay put while the preview moves.
  const slotSource = useMemo(() => {
    if (active?.kind === 'round') return layoutFlow({ ...project, rounds: project.rounds.filter((r) => r.id !== active.roundId) });
    return layoutFlow(project);
  }, [project, active]);

  useEffect(() => {
    if (!roundDrag) setPreviewIndex(null);
  }, [roundDrag]);

  // ---- View: written straight to the DOM so panning never re-renders the flow.

  const clampView = useCallback((v: View): View => {
    const keep = 96;
    const { width, height } = layoutRef.current;
    return {
      z: v.z,
      x: Math.min(size.current.w - keep, Math.max(keep - width * v.z, v.x)),
      y: Math.min(size.current.h - keep, Math.max(keep - height * v.z, v.y)),
    };
  }, []);

  const applyView = useCallback((v: View) => {
    view.current = v;
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (content) content.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.z})`;
    if (viewport) {
      viewport.style.backgroundPosition = `${v.x}px ${v.y}px`;
      viewport.style.backgroundSize = `${20 * v.z}px ${20 * v.z}px`;
    }
    if (!notifyFrame.current) {
      notifyFrame.current = requestAnimationFrame(() => {
        notifyFrame.current = 0;
        viewSubs.current.forEach((fn) => fn(view.current));
      });
    }
  }, []);

  const animateView = useCallback(
    (target: View, duration = 280) => {
      stopMotion.current();
      userMoved.current = true;
      const from = view.current;
      const to = clampView(target);
      stopMotion.current = animate(
        duration,
        (t) => applyView({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }),
        easeOutCubic,
      );
    },
    [applyView, clampView],
  );

  const zoomTo = useCallback(
    (z: number, cx = size.current.w / 2, cy = size.current.h / 2) => {
      const v = view.current;
      const nz = clampZoom(z);
      animateView({ z: nz, x: cx - ((cx - v.x) * nz) / v.z, y: cy - ((cy - v.y) * nz) / v.z }, 220);
    },
    [animateView],
  );

  const fit = useCallback(() => {
    const { width, height } = layoutRef.current;
    const z = clampZoom(Math.min(1, (size.current.w - 48) / width, (size.current.h - 48) / height));
    animateView({ z, x: (size.current.w - width * z) / 2, y: Math.max(16, (size.current.h - height * z) / 2) }, 360);
  }, [animateView]);

  useImperativeHandle(
    handle,
    () => ({
      zoomIn: () => zoomTo(Math.round((view.current.z + 0.1) * 10) / 10),
      zoomOut: () => zoomTo(Math.round((view.current.z - 0.1) * 10) / 10),
      fit,
      actualSize: () => zoomTo(1),
    }),
    [fit, zoomTo],
  );

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      if (!userMoved.current) {
        const w = size.current.w;
        // Phones start zoomed out so both branches of a decision are in view.
        const z = w < 600 ? clampZoom((w - 24) / layoutRef.current.width) : 1;
        applyView({ z, x: Math.round((w - layoutRef.current.width * z) / 2), y: 0 });
      } else applyView(clampView(view.current));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyView, clampView]);

  const reveal = useCallback(
    (node: { x: number; y: number; w: number; h: number }) => {
      const v = view.current;
      const pad = 32;
      const left = v.x + node.x * v.z;
      const top = v.y + node.y * v.z;
      const right = left + node.w * v.z;
      const bottom = top + node.h * v.z;
      let dx = 0;
      let dy = 0;
      if (left < pad) dx = pad - left;
      else if (right > size.current.w - pad) dx = size.current.w - pad - right;
      if (top < pad) dy = pad - top;
      else if (bottom > size.current.h - pad) dy = size.current.h - pad - bottom;
      if (dx || dy) animateView({ ...v, x: v.x + dx, y: v.y + dy }, 320);
    },
    [animateView],
  );

  useEffect(() => {
    if (!revealRequest) return;
    // Wait a frame so a freshly added node is in the layout.
    const id = requestAnimationFrame(() => {
      const node = layoutRef.current.nodes.find((n) => n.key === revealRequest.key);
      if (node) reveal(node);
    });
    return () => cancelAnimationFrame(id);
    // Only a new request should move the view.
  }, [revealRequest?.n]);

  // ---- Wheel, pan with momentum, pinch.

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopMotion.current();
      userMoved.current = true;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.current.h : 1;
      const v = view.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const z = clampZoom(v.z * Math.exp(-e.deltaY * unit * 0.0022));
        applyView(clampView({ z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z }));
      } else {
        applyView(clampView({ ...v, x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyView, clampView]);

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { kind: 'pan'; id: number; start: Point; view: View; samples: { t: number; x: number; y: number }[]; moved: boolean }
    | { kind: 'pinch'; d0: number; m0: Point; view: View }
    | null
  >(null);
  const dragActive = useRef(false);
  dragActive.current = !!active;

  const startInertia = (vx: number, vy: number) => {
    let last = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const dt = Math.min(40, t - last);
      last = t;
      const decay = Math.pow(0.94, dt / 16.67);
      vx *= decay;
      vy *= decay;
      const v = view.current;
      applyView(clampView({ ...v, x: v.x + vx * dt, y: v.y + vy * dt }));
      if (Math.hypot(vx, vy) > 0.02) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    stopMotion.current = () => cancelAnimationFrame(raf);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    // Menus opened from nodes live in portals, but React still bubbles their events here.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('.canvas-overlay, .insert, [data-no-drag]')) return;
    const onNode = !!target.closest('.node');
    if (onNode && e.pointerType !== 'touch') return;
    stopMotion.current();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: view.current };
      return;
    }
    gesture.current = {
      kind: 'pan',
      id: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      view: view.current,
      samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g || dragActive.current) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = viewportRef.current!.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const m0 = { x: g.m0.x - rect.left, y: g.m0.y - rect.top };
      const z = clampZoom(g.view.z * (d / Math.max(1, g.d0)));
      const cx = (m0.x - g.view.x) / g.view.z;
      const cy = (m0.y - g.view.y) / g.view.z;
      userMoved.current = true;
      applyView(clampView({ z, x: m.x - cx * z, y: m.y - cy * z }));
      return;
    }
    if (g.kind !== 'pan' || g.id !== e.pointerId) return;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < (e.pointerType === 'touch' ? 6 : 2)) return;
    if (!g.moved) {
      g.moved = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setPanning(true);
    }
    userMoved.current = true;
    g.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (g.samples.length > 6) g.samples.shift();
    applyView(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }));
  };

  const endPointer = (e: ReactPointerEvent<HTMLElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'pinch') {
      gesture.current = null;
      return;
    }
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setPanning(false);
    if (!g.moved || dragActive.current || e.type === 'pointercancel') return;
    const t = performance.now();
    const recent = g.samples.filter((s) => t - s.t < 100);
    if (recent.length >= 2) {
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = Math.max(1, b.t - a.t);
      const vx = (b.x - a.x) / dt;
      const vy = (b.y - a.y) / dt;
      if (Math.hypot(vx, vy) > 0.25) startInertia(vx, vy);
    }
  };

  // A drag that starts on a node takes over from any pan in progress.
  useEffect(() => {
    if (active) {
      gesture.current = null;
      pointers.current.clear();
      setPanning(false);
      stopMotion.current();
    }
  }, [active]);

  // ---- Dropping rounds into the flow.

  const slotFor = useCallback(
    (p: Point): number | null => {
      const el = viewportRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const y = (p.y - rect.top - view.current.y) / view.current.z;
      let best: number | null = null;
      let bestDist = Infinity;
      for (const insert of slotSource.inserts) {
        const d = Math.abs(insert.y + 14 - y);
        if (d < bestDist) {
          bestDist = d;
          best = insert.index;
        }
      }
      return best;
    },
    [slotSource],
  );

  const canvasTarget = useDropTarget('canvas', {
    accepts: (p) => isRoundDrag(p),
    onMove: (_p, point) => {
      lastPointer.current = point;
      const index = slotFor(point);
      setPreviewIndex((prev) => (prev === index ? prev : index));
    },
    onLeave: () => setPreviewIndex(null),
    onDrop: (p) => {
      const index = previewIndex ?? (lastPointer.current ? slotFor(lastPointer.current) : null);
      if (index === null) return false;
      const key = p.kind === 'round' ? p.roundId : p.kind === 'block' ? p.id : '';
      if (p.kind === 'round') actions.onReorder(p.roundId, index);
      else if (p.kind === 'block' && p.block.type === 'round') actions.onInsert(index, p.block.kind, p.id);
      return { settleTo: () => document.querySelector(`[data-node-key="${key}"]`)?.getBoundingClientRect() };
    },
  });

  const trashTarget = useDropTarget('trash', {
    accepts: (p) => p.kind === 'round',
    onDrop: (p) => {
      if (p.kind === 'round') actions.onRemove(p.roundId);
    },
  });

  // Pan the canvas when a drag nears its edges.
  const edgeVelocity = useRef({ x: 0, y: 0 });
  const edgeFrame = useRef(0);
  useDragMove((point) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const inside = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    const speed = (d: number) => (d < EDGE_PAN ? ((EDGE_PAN - d) / EDGE_PAN) * 14 : 0);
    edgeVelocity.current = inside
      ? { x: speed(point.x - rect.left) - speed(rect.right - point.x), y: speed(point.y - rect.top) - speed(rect.bottom - point.y) }
      : { x: 0, y: 0 };
    lastPointer.current = point;
    if ((edgeVelocity.current.x || edgeVelocity.current.y) && !edgeFrame.current) {
      const step = () => {
        const vel = edgeVelocity.current;
        if (!dragActive.current || (!vel.x && !vel.y)) {
          edgeFrame.current = 0;
          return;
        }
        userMoved.current = true;
        const v = view.current;
        applyView(clampView({ ...v, x: v.x + vel.x, y: v.y + vel.y }));
        if (lastPointer.current && canvasTarget.isOver) {
          const index = slotFor(lastPointer.current);
          setPreviewIndex((prev) => (prev === index ? prev : index));
        }
        edgeFrame.current = requestAnimationFrame(step);
      };
      edgeFrame.current = requestAnimationFrame(step);
    }
  });

  useEffect(() => () => cancelAnimationFrame(edgeFrame.current), []);

  const selectedKey = selectionKey(selection);
  const firstUpcoming = preview.project.rounds.findIndex((r) => r.state === 'upcoming');
  const draggingRoundId = active?.kind === 'round' ? active.roundId : null;

  return (
    <main
      ref={(el) => {
        viewportRef.current = el;
        canvasTarget.ref(el);
      }}
      {...canvasTarget.dropProps}
      className={`canvas${panning ? ' is-panning' : ''}${active ? ' is-dragging' : ''}`}
      aria-label="Review flow canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onScroll={(e) => {
        // Focus can scroll an overflow:hidden box; the view is driven by pan instead.
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div ref={contentRef} className="canvas-content" style={{ width: shown.width, height: shown.height }}>
        <svg className="edges" width={shown.width} height={shown.height} aria-hidden="true">
          <defs>
            <marker id="arrow-head" orient="auto" markerWidth="5" markerHeight="5" refX="3.2" refY="2" overflow="visible">
              <path d="M0 0 L4 2 L0 4 Z" className="arrow-head" />
            </marker>
          </defs>
          {shown.edges.map((edge) => (
            <path
              key={edge.key}
              d={edgePath(edge.paths)}
              className={`edge edge-${edge.kind}`}
              style={edge.opacity < 1 ? { opacity: edge.opacity } : undefined}
              markerEnd={edge.kind === 'loop' ? 'url(#arrow-head)' : undefined}
            />
          ))}
        </svg>

        {shown.labels.map((label) => (
          <div
            key={label.key}
            className="flow-label"
            style={{ transform: `translate3d(${label.x}px, ${label.y}px, 0)`, width: label.w, height: label.h, opacity: label.opacity }}
          >
            {label.kind === 'approved' ? (
              <>
                <span className="label-icon label-ok">
                  <Icon name="check" size={13} strokeWidth={2.4} />
                </span>
                Approved
              </>
            ) : (
              <>
                <span className="label-icon label-warn">
                  <Icon name="pen" size={13} strokeWidth={2.2} />
                </span>
                Changes
              </>
            )}
          </div>
        ))}

        {shown.nodes.map((node) => (
          <CanvasNode
            key={node.exiting ? `${node.key}~out` : node.key}
            node={node}
            project={preview.project}
            now={now}
            selected={selectedKey === node.key}
            flagged={node.type === 'round' && !!node.roundId && flaggedRoundIds.has(node.roundId)}
            isPreview={!!preview.key && node.roundId === preview.key}
            isNext={node.roundIndex === firstUpcoming}
            hidden={draggingRoundId !== null && node.roundId === draggingRoundId && preview.key !== draggingRoundId}
            actions={actions}
            zoom={() => view.current.z}
            onFocusNode={reveal}
          />
        ))}

        {shown.inserts.map((point) => (
          <div
            key={`insert-${point.index}`}
            className={`insert${active ? ' is-hidden' : ''}`}
            style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)`, opacity: active ? 0 : point.opacity }}
          >
            <MenuButton
              label={`Add a round here, as Round ${point.index + 1}`}
              className="insert-btn"
              placement="bottom-start"
              width={220}
              items={[
                { key: 'h', heading: 'Add a round' },
                ...ROUND_KINDS.map((k) => ({
                  key: k.kind,
                  label: k.label,
                  icon: ROUND_ICON[k.kind],
                  onSelect: () => actions.onInsert(point.index, k.kind),
                })),
              ]}
            >
              <Icon name="plus" size={14} strokeWidth={2} />
            </MenuButton>
          </div>
        ))}
      </div>

      {roundDrag && previewIndex !== null && (
        <div className="canvas-overlay drop-banner" aria-hidden="true">
          {active?.kind === 'block' && active.block.type === 'round'
            ? `Drop to add ${roundKindDef(active.block.kind).label} as Round ${previewIndex + 1}`
            : `Drop to make it Round ${previewIndex + 1}`}
        </div>
      )}

      {active?.kind === 'round' && (
        <div ref={trashTarget.ref} {...trashTarget.dropProps} className={`canvas-overlay trash-zone${trashTarget.isOver ? ' is-over' : ''}`} aria-hidden="true">
          <Icon name="trash" size={16} />
          Drop here to remove
        </div>
      )}

      <Minimap
        layout={layout}
        subscribe={viewSubs.current}
        getView={() => view.current}
        getSize={() => size.current}
        selectedKey={selectedKey}
        onJump={(x, y) => {
          const v = view.current;
          animateView({ ...v, x: size.current.w / 2 - x * v.z, y: size.current.h / 2 - y * v.z }, 300);
        }}
      />

      <div className="canvas-overlay zoom-controls" role="group" aria-label="Zoom">
        <button type="button" className="icon-btn icon-btn-md" aria-label="Zoom in" onClick={() => zoomTo(Math.round((view.current.z + 0.1) * 10) / 10)}>
          <Icon name="plus" size={16} strokeWidth={1.9} />
        </button>
        <ZoomLabel subscribe={viewSubs.current} getView={() => view.current} onReset={() => zoomTo(1)} />
        <button type="button" className="icon-btn icon-btn-md" aria-label="Zoom out" onClick={() => zoomTo(Math.round((view.current.z - 0.1) * 10) / 10)}>
          <Icon name="minus" size={16} strokeWidth={1.9} />
        </button>
        <span className="zoom-sep" />
        <button type="button" className="icon-btn icon-btn-md" aria-label="Fit flow to screen" onClick={fit}>
          <Icon name="fit" size={16} strokeWidth={1.9} />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {roundDrag && previewIndex !== null ? `Drop position: Round ${previewIndex + 1}` : ''}
      </span>
    </main>
  );
});

interface CanvasNodeProps {
  node: ShownNode;
  project: Project;
  now: number;
  selected: boolean;
  flagged: boolean;
  isPreview: boolean;
  isNext: boolean;
  hidden: boolean;
  actions: CanvasActions;
  zoom: () => number;
  onFocusNode: (node: ShownNode) => void;
}

function CanvasNode({ node, project, now, selected, flagged, isPreview, isNext, hidden, actions, zoom, onFocusNode }: CanvasNodeProps) {
  // Look rounds up by id: a node fading out may point at a round that moved or is gone.
  const roundIndex = node.roundId ? project.rounds.findIndex((r) => r.id === node.roundId) : -1;
  const round = roundIndex >= 0 ? project.rounds[roundIndex] : null;
  const [shaking, setShaking] = useState(false);
  const isRound = node.type === 'round' && round !== null;
  const movable = isRound && round.state === 'upcoming' && !isPreview;

  const drag = useDraggable(isRound && !isPreview ? { kind: 'round', roundId: round.id } : null, {
    scale: zoom,
    ghost: () => (
      <div className={`node node-round is-${round!.state} is-ghost`} style={{ width: node.w, height: node.h }}>
        <div className="node-body">
          <RoundNodeBody project={project} round={round!} index={roundIndex} now={now} isNext={isNext} />
        </div>
      </div>
    ),
    onRefuse: movable
      ? undefined
      : () => {
          setShaking(true);
          window.setTimeout(() => setShaking(false), 420);
          if (round) actions.onPinned(round.id);
        },
  });

  const target = useDropTarget(`node:${node.key}`, {
    accepts: (p) => !node.exiting && !isPreview && !hidden && dropHint(p, node.type, project, round) !== null,
    onDrop: (p) => {
      if (!round) return false;
      if (p.kind === 'block') actions.onApplyBlock(round.id, p.block);
      else if (p.kind === 'person') {
        if (node.type === 'gate') actions.onFinalSay(round.id, p.personId);
        else actions.onAddReviewer(round.id, p.personId);
      } else if (p.kind === 'aspect') actions.onMoveAspect(p.aspect, p.fromRoundId, round.id);
      else return false;
      return { settleTo: () => document.querySelector(`[data-node-key="${node.key}"]`)?.getBoundingClientRect() };
    },
  });

  const hint = target.isOver && target.active ? dropHint(target.active, node.type, project, round) : null;
  const sel: NodeSelection | null =
    node.type === 'trigger' ? { type: 'trigger' } : node.type === 'end' || !node.roundId ? null : { type: node.type, roundId: node.roundId };

  const classes = ['node', `node-${node.type}`];
  if (round && node.type === 'round') classes.push(`is-${round.state}`);
  if (selected) classes.push('is-selected');
  if (flagged) classes.push('is-flagged');
  if (isPreview) classes.push('is-preview');
  if (target.canDrop) classes.push('is-droppable');
  if (target.isOver) classes.push('is-over');
  if (movable) classes.push('is-movable');
  if (shaking) classes.push('is-shaking');

  return (
    <div
      ref={target.ref}
      {...target.dropProps}
      data-node-key={node.key}
      className={classes.join(' ')}
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)${node.scale !== 1 ? ` scale(${node.scale})` : ''}`,
        width: node.w,
        height: node.h,
        opacity: hidden ? 0 : node.opacity,
        pointerEvents: node.exiting || hidden ? 'none' : undefined,
      }}
      onPointerDown={isRound ? drag.onPointerDown : undefined}
    >
      {sel && !isPreview && !node.exiting && (
        <button
          type="button"
          className="node-hit"
          aria-label={nodeLabel(project, node)}
          aria-pressed={selected}
          onClick={() => actions.onSelect(sel)}
          onFocus={() => onFocusNode(node)}
          onKeyDown={(e) => {
            if (!movable || !round || !e.altKey) return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              actions.onMove(round.id, e.key === 'ArrowUp' ? -1 : 1);
            }
          }}
        />
      )}
      <div className="node-body">
        {(round || !node.roundId) && <NodeBody type={node.type} project={project} round={round} index={roundIndex} now={now} isNext={isNext} />}
      </div>
      {node.type === 'round' && round && round.state !== 'done' && !isPreview && !node.exiting && (
        <RoundMenu
          project={project}
          round={round}
          index={roundIndex}
          onApprove={actions.onApprove}
          onRequestChanges={actions.onRequestChanges}
          onMove={actions.onMove}
          onRemove={actions.onRemove}
        />
      )}
      {flagged && <span className="flag-dot" title="This round has gaps" aria-hidden="true" />}
      {hint && (
        <span className="drop-hint" aria-hidden="true">
          <Icon name="plus" size={12} strokeWidth={2.4} />
          {hint}
        </span>
      )}
    </div>
  );
}

interface ViewFeedProps {
  subscribe: Set<(v: View) => void>;
  getView: () => View;
}

function useViewFeed({ subscribe, getView }: ViewFeedProps): View {
  const [v, setV] = useState(getView);
  useEffect(() => {
    const fn = (next: View) => setV(next);
    subscribe.add(fn);
    return () => {
      subscribe.delete(fn);
    };
  }, [subscribe]);
  return v;
}

function ZoomLabel({ onReset, ...feed }: ViewFeedProps & { onReset: () => void }) {
  const v = useViewFeed(feed);
  return (
    <button type="button" className="zoom-level" onClick={onReset} aria-label={`Zoom ${Math.round(v.z * 100)}%, reset to 100%`}>
      {Math.round(v.z * 100)}%
    </button>
  );
}

const MINI_W = 148;
const MINI_H = 96;

interface MinimapProps extends ViewFeedProps {
  layout: FlowLayout;
  getSize: () => { w: number; h: number };
  selectedKey: string | null;
  onJump: (x: number, y: number) => void;
}

const Minimap = memo(function Minimap({ layout, getSize, selectedKey, onJump, ...feed }: MinimapProps) {
  const v = useViewFeed(feed);
  const size = getSize();
  const s = Math.min((MINI_W - 16) / layout.width, (MINI_H - 8) / layout.height);
  const ox = (MINI_W - layout.width * s) / 2;
  const oy = (MINI_H - layout.height * s) / 2;
  const vx = ox + (-v.x / v.z) * s;
  const vy = oy + (-v.y / v.z) * s;
  const left = Math.max(2, vx);
  const top = Math.max(2, vy);
  const right = Math.min(MINI_W - 2, vx + (size.w / v.z) * s);
  const bottom = Math.min(MINI_H - 2, vy + (size.h / v.z) * s);

  return (
    <div
      className="canvas-overlay minimap hide-sm"
      aria-hidden="true"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onJump((e.clientX - rect.left - ox) / s, (e.clientY - rect.top - oy) / s);
      }}
    >
      {layout.nodes.map((n) => (
        <span
          key={n.key}
          className={`mini-node${selectedKey === n.key ? ' is-selected' : ''}`}
          style={{ left: ox + n.x * s, top: oy + n.y * s, width: Math.max(2, n.w * s), height: Math.max(2, n.h * s) }}
        />
      ))}
      <span className="mini-view" style={{ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }} />
    </div>
  );
});
