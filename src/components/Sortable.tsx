import { useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useDraggable, useDropTarget } from '../dnd/DragProvider';
import { prefersReducedMotion } from '../motion';

/**
 * Animates rows to their new places when a list reorders (FLIP), and fades
 * new rows in. Rows opt in with `data-flip-id`.
 */
export function useFlip(ref: React.RefObject<HTMLElement | null>, key: string) {
  const snapshot = useRef<Map<string, number> | null>(null);
  const lastKey = useRef(key);
  if (lastKey.current !== key && ref.current) {
    // Read where rows sit on screen right before React moves them.
    const tops = new Map<string, number>();
    ref.current.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => tops.set(el.dataset.flipId!, el.getBoundingClientRect().top));
    snapshot.current = tops;
  }
  lastKey.current = key;

  useLayoutEffect(() => {
    const tops = snapshot.current;
    snapshot.current = null;
    const root = ref.current;
    if (!tops || !root || prefersReducedMotion()) return;
    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      if (typeof el.animate !== 'function') return;
      const before = tops.get(el.dataset.flipId!);
      if (before === undefined) {
        el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
        return;
      }
      const dy = before - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }, [key, ref]);
}

export interface HandleProps {
  onPointerDown: (e: ReactPointerEvent) => void;
}

interface SortableProps<T extends { id: string }> {
  /** Rows only move within the list with this name. */
  list: string;
  items: T[];
  onMove: (id: string, beforeId: string | null) => void;
  renderItem: (item: T, handle: HandleProps) => ReactNode;
  renderGhost: (item: T) => ReactNode;
  className?: string;
  label?: string;
}

/** A list whose rows can be dragged into a new order, with the others making room as you go. */
export function Sortable<T extends { id: string }>({ list, items, onMove, renderItem, renderGhost, className = '', label }: SortableProps<T>) {
  const ref = useRef<HTMLUListElement | null>(null);
  const [preview, setPreview] = useState<{ id: string; index: number } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;

  // The dragged row sits at the preview slot while the drag is on.
  const dragged = preview ? items.find((i) => i.id === preview.id) : undefined;
  const shown = dragged ? items.filter((i) => i !== dragged) : items;
  if (dragged && preview) shown.splice(Math.min(preview.index, shown.length), 0, dragged);

  useFlip(ref, shown.map((i) => i.id).join('|'));

  const home = (id: string) => ({ id, index: Math.max(0, items.findIndex((i) => i.id === id)) });

  const target = useDropTarget(`sort:${list}`, {
    accepts: (p) => p.list === list,
    onMove: (p, point) => {
      const root = ref.current;
      if (!root) return;
      const top = root.getBoundingClientRect().top;
      const rows = [...root.querySelectorAll<HTMLElement>(':scope > [data-flip-id]')].filter((el) => el.dataset.flipId !== p.id);
      // Layout positions ignore the FLIP transforms, so rows don't flicker back and forth.
      const index = rows.filter((el) => el.offsetTop + el.offsetHeight / 2 < point.y - top).length;
      if (previewRef.current?.id !== p.id || previewRef.current.index !== index) setPreview({ id: p.id, index });
    },
    onLeave: (p) => setPreview(home(p.id)),
    onDrop: (p) => {
      const rest = items.filter((i) => i.id !== p.id);
      const index = previewRef.current?.id === p.id ? previewRef.current.index : rest.length;
      onMove(p.id, rest[index]?.id ?? null);
      return {
        settleTo: () =>
          [...(ref.current?.querySelectorAll<HTMLElement>(':scope > [data-flip-id]') ?? [])].find((el) => el.dataset.flipId === p.id)?.getBoundingClientRect(),
      };
    },
  });

  return (
    <ul
      ref={(el) => {
        ref.current = el;
        target.ref(el);
      }}
      {...target.dropProps}
      className={`rows sortable ${className}${preview ? ' is-sorting' : ''}`}
      aria-label={label}
    >
      {shown.map((item) => (
        <SortableRow
          key={item.id}
          list={list}
          item={item}
          placeholder={preview?.id === item.id}
          onStart={() => setPreview(home(item.id))}
          onEnd={() => setPreview(null)}
          renderItem={renderItem}
          renderGhost={renderGhost}
        />
      ))}
    </ul>
  );
}

function SortableRow<T extends { id: string }>({
  list,
  item,
  placeholder,
  onStart,
  onEnd,
  renderItem,
  renderGhost,
}: {
  list: string;
  item: T;
  placeholder: boolean;
  onStart: () => void;
  onEnd: () => void;
  renderItem: (item: T, handle: HandleProps) => ReactNode;
  renderGhost: (item: T) => ReactNode;
}) {
  const li = useRef<HTMLLIElement>(null);
  const drag = useDraggable(
    { list, id: item.id },
    { ghost: () => <div className="ghost-row">{renderGhost(item)}</div>, onStart, onEnd, source: () => li.current },
  );
  return (
    <li ref={li} data-flip-id={item.id} className={placeholder ? 'is-placeholder' : undefined}>
      {renderItem(item, drag)}
    </li>
  );
}
