import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { TONES, type Tone, type TrayRef } from '../store/types';

/**
 * Dragging things out of the task tray. A page registers a drop zone; while
 * a tray item is dragged, each zone hears where the pointer is and draws its
 * own preview, and the zone under the pointer gets the drop.
 */
export interface DropZone {
  /** Return true when the point is inside this zone (and show a preview). */
  move: (ref: TrayRef, x: number, y: number) => boolean;
  drop: (ref: TrayRef, x: number, y: number) => void;
  leave: () => void;
}

interface Ghost {
  title: string;
  tone: Tone;
  x: number;
  y: number;
}

interface TrayDragValue {
  start: (e: ReactPointerEvent, ref: TrayRef, title: string, tone: Tone) => void;
  dragging: TrayRef | null;
  addZone: (zone: DropZone) => () => void;
}

const Ctx = createContext<TrayDragValue | null>(null);

const LONG_PRESS = 260;

export function TrayDragProvider({ children }: { children: ReactNode }) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [dragging, setDragging] = useState<TrayRef | null>(null);
  const zones = useRef(new Set<DropZone>());

  const addZone = useCallback((zone: DropZone) => {
    zones.current.add(zone);
    return () => {
      zones.current.delete(zone);
    };
  }, []);

  const start = useCallback((e: ReactPointerEvent, ref: TrayRef, title: string, tone: Tone) => {
    if (e.button > 0) return;
    const origin = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType === 'touch';
    let live = false;
    let timer = 0;
    let active: DropZone | null = null;

    const activate = () => {
      live = true;
      setDragging(ref);
      document.documentElement.classList.add('is-dragging');
      if (touch) navigator.vibrate?.(8);
    };

    const track = (x: number, y: number) => {
      setGhost({ title, tone, x, y });
      let hit: DropZone | null = null;
      for (const zone of zones.current) {
        if (!hit && zone.move(ref, x, y)) hit = zone;
        else zone.leave();
      }
      active = hit;
    };

    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y);
      if (!live) {
        if (touch) {
          if (dist > 8) cleanup();
          return;
        }
        if (dist < 4) return;
        activate();
      }
      track(ev.clientX, ev.clientY);
    };

    const up = (ev: PointerEvent) => {
      const wasLive = live;
      const target = active;
      cleanup();
      if (!wasLive) return;
      if (target) target.drop(ref, ev.clientX, ev.clientY);
      // The release would otherwise click whatever it landed on.
      const stop = (c: MouseEvent) => c.stopPropagation();
      window.addEventListener('click', stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    };

    const blockTouch = (ev: TouchEvent) => {
      if (live) ev.preventDefault();
    };

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
      document.removeEventListener('touchmove', blockTouch);
      zones.current.forEach((z) => z.leave());
      document.documentElement.classList.remove('is-dragging');
      setGhost(null);
      setDragging(null);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cleanup);
    if (touch) {
      document.addEventListener('touchmove', blockTouch, { passive: false });
      timer = window.setTimeout(() => {
        activate();
        track(origin.x, origin.y);
      }, LONG_PRESS);
    }
  }, []);

  const value = useMemo(() => ({ start, dragging, addZone }), [start, dragging, addZone]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {ghost && (
        <div
          className="tray-ghost"
          style={{ left: ghost.x + 12, top: ghost.y + 8, '--bar': TONES[ghost.tone].bar, '--fill': TONES[ghost.tone].fill, '--ink': TONES[ghost.tone].ink } as React.CSSProperties}
        >
          <span className="chip-bar" />
          <p>{ghost.title || 'Untitled'}</p>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useTrayDrag(): TrayDragValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrayDrag needs a TrayDragProvider');
  return v;
}

/** Registers a drop zone for tray drags. The zone object can change every render. */
export function useDropZone(zone: DropZone) {
  const { addZone } = useTrayDrag();
  const latest = useRef(zone);
  latest.current = zone;
  useEffect(
    () =>
      addZone({
        move: (r, x, y) => latest.current.move(r, x, y),
        drop: (r, x, y) => latest.current.drop(r, x, y),
        leave: () => latest.current.leave(),
      }),
    [addZone],
  );
}

/** True when a point is over the task tray (used for dragging things back into it). */
export function overTray(x: number, y: number): boolean {
  const tray = document.querySelector('[data-tray]');
  if (!tray) return false;
  const r = tray.getBoundingClientRect();
  return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
