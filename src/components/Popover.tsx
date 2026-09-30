import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export type Placement = 'bottom-start' | 'bottom-end' | 'right-end' | 'top-start';

const MARGIN = 8;

function position(anchor: DOMRect, panel: { width: number; height: number }, placement: Placement): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left: number;
  let top: number;
  if (placement === 'right-end') {
    left = anchor.right + 8;
    top = anchor.bottom - panel.height;
    if (left + panel.width > vw - MARGIN) left = anchor.left - panel.width - 8;
  } else {
    left = placement === 'bottom-end' ? anchor.right - panel.width : anchor.left;
    top = placement === 'top-start' ? anchor.top - panel.height - 6 : anchor.bottom + 6;
    if (placement !== 'top-start' && top + panel.height > vh - MARGIN && anchor.top - panel.height - 6 > MARGIN) {
      top = anchor.top - panel.height - 6;
    }
  }
  left = Math.min(Math.max(MARGIN, left), vw - panel.width - MARGIN);
  top = Math.min(Math.max(MARGIN, top), vh - panel.height - MARGIN);
  return { left, top };
}

interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: (restoreFocus: boolean) => void;
  placement?: Placement;
  width?: number;
  className?: string;
  role?: 'menu' | 'dialog';
  label: string;
  id?: string;
  children: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

export function Popover({
  anchor,
  open,
  onClose,
  placement = 'bottom-start',
  width = 260,
  className = '',
  role = 'dialog',
  label,
  id,
  children,
  onKeyDown,
  panelRef,
}: PopoverProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const ref = panelRef ?? localRef;
  const [style, setStyle] = useState<CSSProperties>({ left: -9999, top: -9999 });

  const place = useCallback(() => {
    if (!anchor || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setStyle(position(anchor.getBoundingClientRect(), { width: rect.width || width, height: rect.height }, placement));
  }, [anchor, placement, ref, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, children]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose(false);
    };
    const onResize = () => place();
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, anchor, onClose, place, ref]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={label}
      className={`popover ${className}`}
      style={{ ...style, width }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose(true);
          return;
        }
        onKeyDown?.(e);
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Wires a trigger button to a popover: open state, anchor, and focus return. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const id = useId();
  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) anchor?.focus();
    },
    [anchor],
  );
  return {
    open,
    setOpen,
    close,
    anchor,
    id,
    triggerProps: {
      ref: setAnchor,
      'aria-expanded': open,
      'aria-controls': open ? id : undefined,
      onClick: () => setOpen((o) => !o),
    },
  };
}

export type MenuItem =
  | {
      key: string;
      label: string;
      hint?: string;
      icon?: IconName;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    }
  | { key: string; separator: true }
  | { key: string; heading: string };

interface MenuButtonProps {
  items: MenuItem[];
  label: string;
  className?: string;
  children: ReactNode;
  placement?: Placement;
  width?: number;
  disabled?: boolean;
  title?: string;
}

export function MenuButton({ items, label, className, children, placement = 'bottom-end', width = 240, disabled, title }: MenuButtonProps) {
  const pop = usePopover();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const focusItem = (dir: 1 | -1 | 'first' | 'last') => {
    const list = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([disabled])') ?? []);
    if (list.length === 0) return;
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (dir === 'first') next = 0;
    else if (dir === 'last') next = list.length - 1;
    else next = (current + dir + list.length) % list.length;
    list[next].focus();
  };

  useEffect(() => {
    if (!pop.open) return;
    const id = window.requestAnimationFrame(() => {
      const checked = panelRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]:not([disabled])');
      if (checked) checked.focus();
      else focusItem('first');
    });
    return () => window.cancelAnimationFrame(id);
  }, [pop.open]);

  const hasChecks = items.some((i) => 'checked' in i && i.checked !== undefined);

  return (
    <>
      <button type="button" aria-haspopup="menu" aria-label={label} title={title} className={className} disabled={disabled} {...pop.triggerProps}>
        {children}
      </button>
      <Popover
        anchor={pop.anchor}
        open={pop.open}
        onClose={pop.close}
        placement={placement}
        width={width}
        role="menu"
        label={label}
        id={pop.id}
        panelRef={panelRef}
        className="menu"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusItem(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusItem(-1);
          } else if (e.key === 'Home') {
            e.preventDefault();
            focusItem('first');
          } else if (e.key === 'End') {
            e.preventDefault();
            focusItem('last');
          } else if (e.key === 'Tab') {
            pop.close(false);
          }
        }}
      >
        {items.map((item) => {
          if ('separator' in item) return <div key={item.key} role="separator" className="menu-sep" />;
          if ('heading' in item) {
            return (
              <div key={item.key} className="menu-heading" role="presentation">
                {item.heading}
              </div>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              aria-checked={item.checked}
              disabled={item.disabled}
              className={`menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                pop.close(true);
                item.onSelect();
              }}
            >
              {hasChecks && <span className="menu-check">{item.checked && <Icon name="check" size={14} strokeWidth={2.2} />}</span>}
              {item.icon && <Icon name={item.icon} size={16} />}
              <span className="menu-text">
                <span>{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </span>
            </button>
          );
        })}
      </Popover>
    </>
  );
}
