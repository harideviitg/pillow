import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from '../motion';

/** Something being dragged: a row in one of the sortable lists. */
export interface DragPayload {
  /** Which list the row belongs to, so rows only land in their own list. */
  list: string;
  id: string;
}

export interface Point {
  x: number;
  y: number;
}

export type DropResult = void | boolean | { settleTo: () => DOMRect | null | undefined };

export interface DropTargetSpec {
  accepts: (payload: DragPayload) => boolean;
  onDrop: (payload: DragPayload, point: Point) => DropResult;
  onMove?: (payload: DragPayload, point: Point) => void;
  onLeave?: (payload: DragPayload) => void;
}

interface Active {
  payload: DragPayload;
  ghost: ReactNode;
  origin: DOMRect;
  start: Point;
  /** Where the pointer grabbed the item, in the ghost's own unscaled pixels. */
  grab: Point;
  scale: number;
  cursor: boolean;
}

interface DragContextValue {
  active: DragPayload | null;
  overId: string | null;
  begin: (event: ReactPointerEvent, payload: DragPayload, options: DraggableOptions) => void;
  register: (id: string, get: () => { el: HTMLElement | null; spec: DropTargetSpec }) => () => void;
  subscribe: (listener: (point: Point, payload: DragPayload) => void) => () => void;
}

export interface DraggableOptions {
  ghost: () => ReactNode;
  /** Visual scale of the source, so the ghost matches it. */
  scale?: number | (() => number);
  onStart?: () => void;
  onEnd?: (dropped: boolean) => void;
  /** Called when the pointer is released without dragging. */
  onTap?: () => void;
  /** 'cursor' floats a small ghost just off the pointer so the target stays visible. */
  anchor?: 'grab' | 'cursor';
  /** Set for pinned items: called instead of starting a drag. */
  onRefuse?: () => void;
  /** The element the ghost copies the size and place of, when the grab is on a handle inside it. */
  source?: () => HTMLElement | null;
  disabled?: boolean;
}

const DragContext = createContext<DragContextValue | null>(null);

const MOUSE_THRESHOLD = 4;
const TOUCH_SLOP = 8;
const LONG_PRESS_MS = 220;

function suppressNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

export function DragProvider({ children }: { children: ReactNode }) {
  // The ghost outlives the drag by a few frames while it lands, so they are tracked apart.
  const [active, setActive] = useState<Active | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const targets = useRef(new Map<string, () => { el: HTMLElement | null; spec: DropTargetSpec }>());
  const listeners = useRef(new Set<(point: Point, payload: DragPayload) => void>());
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const overRef = useRef<string | null>(null);
  const activeRef = useRef<Active | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const motion = useRef({ x: 0, y: 0, vx: 0, tilt: 0, lift: 0, last: 0 });
  const finishing = useRef(false);

  const register = useCallback((id: string, get: () => { el: HTMLElement | null; spec: DropTargetSpec }) => {
    targets.current.set(id, get);
    return () => {
      if (targets.current.get(id) === get) targets.current.delete(id);
    };
  }, []);

  const subscribe = useCallback((listener: (point: Point, payload: DragPayload) => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const hitTest = useCallback((point: Point, payload: DragPayload): string | null => {
    if (typeof document.elementsFromPoint !== 'function') return null;
    for (const el of document.elementsFromPoint(point.x, point.y)) {
      const id = (el as HTMLElement).dataset?.dropId;
      if (!id) continue;
      const target = targets.current.get(id)?.();
      if (target && target.spec.accepts(payload)) return id;
    }
    return null;
  }, []);

  const setOver = useCallback((id: string | null, payload: DragPayload) => {
    if (overRef.current === id) return;
    const previous = overRef.current;
    if (previous) targets.current.get(previous)?.().spec.onLeave?.(payload);
    overRef.current = id;
    setOverId(id);
  }, []);

  // The ghost eases toward the pointer every frame and leans into the motion.
  const tick = useCallback((time: number) => {
    const a = activeRef.current;
    const el = ghostRef.current;
    if (!a || finishing.current) return;
    if (!el) {
      // The ghost mounts a frame after the drag starts.
      frame.current = requestAnimationFrame(tick);
      return;
    }
    const m = motion.current;
    const dt = m.last ? Math.min(48, time - m.last) : 16;
    m.last = time;
    const tx = pointer.current.x - a.grab.x;
    const ty = pointer.current.y - a.grab.y;
    const follow = prefersReducedMotion() ? 1 : 1 - Math.pow(1 - 0.42, dt / 16.67);
    const dx = (tx - m.x) * follow;
    m.x += dx;
    m.y += (ty - m.y) * follow;
    m.vx += (dx / Math.max(dt, 1) - m.vx) * 0.25;
    const targetTilt = Math.max(-7, Math.min(7, m.vx * 2.2));
    m.tilt += (targetTilt - m.tilt) * 0.2;
    m.lift += (1 - m.lift) * 0.25;
    const scale = a.scale * (1 + 0.035 * m.lift);
    el.style.transform = `translate3d(${m.x}px, ${m.y}px, 0) rotate(${m.tilt}deg) scale(${scale})`;
    frame.current = requestAnimationFrame(tick);
  }, []);

  const animateGhostOut = useCallback((to: { x: number; y: number; scale: number }, duration: number, done: () => void) => {
    const el = ghostRef.current;
    const m = motion.current;
    if (!el || prefersReducedMotion()) {
      done();
      return;
    }
    const from = { x: m.x, y: m.y, tilt: m.tilt, scale: activeRef.current?.scale ?? 1 };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e;
      const s = from.scale + (to.scale - from.scale) * e;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${from.tilt * (1 - e)}deg) scale(${s})`;
      el.style.opacity = String(1 - e * e);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else done();
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  const end = useCallback(
    (drop: boolean, options: DraggableOptions) => {
      const a = activeRef.current;
      if (!a || finishing.current) return;
      cancelAnimationFrame(frame.current);
      const overTarget = overRef.current ? targets.current.get(overRef.current)?.() : undefined;
      let result: DropResult = undefined;
      const dropped = drop && !!overTarget;
      if (dropped && overTarget) result = overTarget.spec.onDrop(a.payload, { ...pointer.current });
      const accepted = dropped && result !== false;
      if (!accepted && overRef.current) targets.current.get(overRef.current)?.().spec.onLeave?.(a.payload);
      overRef.current = null;
      setOverId(null);
      setDragging(null);
      finishing.current = true;
      options.onEnd?.(accepted);

      const finish = () => {
        finishing.current = false;
        activeRef.current = null;
        setActive(null);
        document.documentElement.classList.remove('is-dragging');
      };

      const el = ghostRef.current;
      const width = el?.offsetWidth ?? 0;
      const height = el?.offsetHeight ?? 0;
      if (accepted) {
        const settle = typeof result === 'object' && result ? result.settleTo : null;
        requestAnimationFrame(() => {
          const rect = settle?.();
          if (rect && width > 0) {
            // Fly the ghost's centre into the slot it now occupies.
            const scale = Math.min(a.scale * 1.15, rect.width / width);
            const x = rect.left + rect.width / 2 - a.grab.x - (width / 2 - a.grab.x) * scale;
            const y = rect.top + rect.height / 2 - a.grab.y - (height / 2 - a.grab.y) * scale;
            animateGhostOut({ x, y, scale }, 220, finish);
          } else {
            animateGhostOut({ x: motion.current.x, y: motion.current.y + 6, scale: a.scale * 0.92 }, 160, finish);
          }
        });
      } else {
        const home = a.cursor ? { x: a.origin.left, y: a.origin.top } : { x: a.start.x - a.grab.x, y: a.start.y - a.grab.y };
        animateGhostOut({ ...home, scale: a.scale }, 260, finish);
      }
    },
    [animateGhostOut],
  );

  const begin = useCallback(
    (event: ReactPointerEvent, payload: DragPayload, options: DraggableOptions) => {
      if (options.disabled || activeRef.current || event.button > 0) return;
      const source = options.source?.() ?? (event.currentTarget as HTMLElement);
      const start = { x: event.clientX, y: event.clientY };
      const isTouch = event.pointerType === 'touch';
      let started = false;
      let timer = 0;
      let refused = false;

      const activate = () => {
        started = true;
        if (options.onRefuse) {
          refused = true;
          options.onRefuse();
          cleanup();
          return;
        }
        const origin = source.getBoundingClientRect();
        const scale = typeof options.scale === 'function' ? options.scale() : (options.scale ?? 1);
        const cursor = options.anchor === 'cursor';
        const grab = cursor ? { x: -18, y: -14 } : { x: (start.x - origin.left) / scale, y: (start.y - origin.top) / scale };
        const a: Active = { payload, ghost: options.ghost(), origin, start, grab, scale, cursor };
        // A cursor ghost starts over its source and glides out to the pointer.
        motion.current = cursor
          ? { x: origin.left, y: origin.top, vx: 0, tilt: 0, lift: 0, last: 0 }
          : { x: start.x - grab.x, y: start.y - grab.y, vx: 0, tilt: 0, lift: 0, last: 0 };
        activeRef.current = a;
        setActive(a);
        setDragging(payload);
        document.documentElement.classList.add('is-dragging');
        options.onStart?.();
        if (isTouch && navigator.vibrate) navigator.vibrate(8);
        frame.current = requestAnimationFrame(tick);
        const id = hitTest(pointer.current, payload);
        setOver(id, payload);
      };

      const move = (e: PointerEvent) => {
        pointer.current = { x: e.clientX, y: e.clientY };
        const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (!started) {
          if (isTouch) {
            if (dist > TOUCH_SLOP) cleanup();
            return;
          }
          if (dist < MOUSE_THRESHOLD) return;
          activate();
          if (refused) return;
        }
        const a = activeRef.current;
        if (!a) return;
        const id = hitTest(pointer.current, a.payload);
        setOver(id, a.payload);
        if (id) targets.current.get(id)?.().spec.onMove?.(a.payload, { ...pointer.current });
        listeners.current.forEach((l) => l({ ...pointer.current }, a.payload));
      };

      const up = (e: PointerEvent) => {
        pointer.current = { x: e.clientX, y: e.clientY };
        const wasStarted = started && !refused;
        cleanup();
        if (wasStarted) {
          suppressNextClick();
          end(true, options);
        } else if (!started) {
          options.onTap?.();
        }
      };

      const cancel = () => {
        const wasStarted = started && !refused;
        cleanup();
        if (wasStarted) end(false, options);
      };

      const key = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && started) {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      };

      const blockTouch = (e: TouchEvent) => {
        if (started) e.preventDefault();
      };
      const blockMenu = (e: Event) => e.preventDefault();

      function cleanup() {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        document.removeEventListener('touchmove', blockTouch);
        document.removeEventListener('contextmenu', blockMenu);
      }

      pointer.current = start;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
      if (isTouch) {
        document.addEventListener('touchmove', blockTouch, { passive: false });
        document.addEventListener('contextmenu', blockMenu);
        timer = window.setTimeout(activate, LONG_PRESS_MS);
      }
    },
    [end, hitTest, setOver, tick],
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useLayoutEffect(() => {
    const el = ghostRef.current;
    const a = activeRef.current;
    if (el && a) {
      el.style.opacity = '1';
      el.style.transformOrigin = `${a.grab.x}px ${a.grab.y}px`;
      el.style.transform = `translate3d(${motion.current.x}px, ${motion.current.y}px, 0) scale(${a.scale})`;
    }
  }, [active]);

  const value = useMemo<DragContextValue>(
    () => ({ active: dragging, overId, begin, register, subscribe }),
    [dragging, overId, begin, register, subscribe],
  );

  return (
    <DragContext.Provider value={value}>
      {children}
      {active &&
        createPortal(
          <div className="drag-layer" aria-hidden="true">
            <div ref={ghostRef} className="drag-ghost" style={{ width: active.cursor ? 'max-content' : active.origin.width / active.scale }}>
              {active.ghost}
            </div>
          </div>,
          document.body,
        )}
    </DragContext.Provider>
  );
}

export function useDrag(): DragContextValue {
  const value = useContext(DragContext);
  if (!value) throw new Error('useDrag needs a DragProvider');
  return value;
}

/** Makes an element draggable. Spread the result onto the element. */
export function useDraggable(payload: DragPayload | null | (() => DragPayload | null), options: DraggableOptions) {
  const { begin } = useDrag();
  const latest = useRef({ payload, options });
  latest.current = { payload, options };
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const { payload: raw, options: o } = latest.current;
      const p = typeof raw === 'function' ? raw() : raw;
      if (!p) return;
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
      begin(e, p, o);
    },
    [begin],
  );
  return { onPointerDown };
}

/** Registers an element as a drop target; returns a ref and live state. */
export function useDropTarget(id: string, spec: DropTargetSpec) {
  const { register, active, overId } = useDrag();
  const el = useRef<HTMLElement | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => register(id, () => ({ el: el.current, spec: specRef.current })), [id, register]);

  const ref = useCallback((node: HTMLElement | null) => {
    el.current = node;
  }, []);

  const canDrop = !!active && spec.accepts(active);
  return { ref, isOver: overId === id, canDrop, active, dropProps: { 'data-drop-id': id } };
}

/** Listens to pointer movement during any drag (for auto-scroll and live previews). */
export function useDragMove(listener: (point: Point, payload: DragPayload) => void) {
  const { subscribe } = useDrag();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((point, payload) => ref.current(point, payload)), [subscribe]);
}
