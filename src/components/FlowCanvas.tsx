import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { ROUND_KINDS, type Block } from '../domain/catalog';
import { firstEditableIndex } from '../domain/routing';
import type { FlowLayout, FlowNode } from '../domain/layout';
import type { Project } from '../domain/types';
import { BLOCK_MIME } from './BlocksPanel';
import {
  EndNodeBody,
  GateNodeBody,
  LockNodeBody,
  nodeLabel,
  ReviseNodeBody,
  RoundMenu,
  RoundNodeBody,
  TriggerNodeBody,
} from './FlowNodes';
import { Icon } from './Icon';
import { MenuButton } from './Popover';
import type { NodeSelection } from './selection';
import { selectionKey } from './selection';
import { ROUND_ICON } from './ui';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface View {
  x: number;
  y: number;
  z: number;
}

interface FlowCanvasProps {
  project: Project;
  layout: FlowLayout;
  now: number;
  selection: NodeSelection | null;
  onSelect: (sel: NodeSelection) => void;
  dragBlock: Block | null;
  onDropBlock: (block: Block, target: { roundId: string } | { insertIndex: number }) => void;
  onInsert: (index: number, kind: Block & { type: 'round' }) => void;
  onApprove: (roundId: string) => void;
  onRequestChanges: (roundId: string) => void;
  onMove: (roundId: string, delta: -1 | 1) => void;
  onRemove: (roundId: string) => void;
  flaggedRoundIds: Set<string>;
  revealRequest: { key: string; n: number } | null;
}

function readBlock(e: DragEvent): Block | null {
  try {
    const raw = e.dataTransfer.getData(BLOCK_MIME);
    return raw ? (JSON.parse(raw) as Block) : null;
  } catch {
    return null;
  }
}

function selectionFor(node: FlowNode): NodeSelection | null {
  if (node.type === 'trigger') return { type: 'trigger' };
  if (node.type === 'end' || !node.roundId) return null;
  return { type: node.type, roundId: node.roundId };
}

export function FlowCanvas(props: FlowCanvasProps) {
  const { project, layout, now, selection, onSelect, dragBlock, onDropBlock, onInsert, flaggedRoundIds, revealRequest } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const userMoved = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const clampView = useCallback(
    (v: View): View => {
      const keep = 80;
      const w = layout.width * v.z;
      const h = layout.height * v.z;
      return {
        z: v.z,
        x: Math.min(size.w - keep, Math.max(keep - w, v.x)),
        y: Math.min(size.h - keep, Math.max(keep - h, v.y)),
      };
    },
    [layout.width, layout.height, size.w, size.h],
  );

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      if (!userMoved.current) {
        // Phones start zoomed out so both branches of a decision are in view.
        const z = w < 600 ? clampZoom((w - 24) / layout.width) : 1;
        setView((v) => ({ ...v, z, x: Math.round((w - layout.width * z) / 2) }));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width]);

  const zoomAt = useCallback(
    (nextZ: number, cx: number, cy: number) => {
      userMoved.current = true;
      setView((v) => {
        const z = clampZoom(nextZ);
        return clampView({ z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z });
      });
    },
    [clampView],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const z = clampZoom(v.z * Math.exp(-e.deltaY * 0.0025));
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          return clampView({ z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z });
        });
      } else {
        setView((v) => clampView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
      userMoved.current = true;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampView]);

  const fit = () => {
    userMoved.current = true;
    const z = clampZoom(Math.min(1, (size.w - 48) / layout.width, (size.h - 48) / layout.height));
    setView({ z, x: Math.round((size.w - layout.width * z) / 2), y: Math.max(16, Math.round((size.h - layout.height * z) / 2)) });
  };

  const reveal = useCallback(
    (node: FlowNode) => {
      setView((v) => {
        const pad = 24;
        const left = v.x + node.x * v.z;
        const top = v.y + node.y * v.z;
        const right = left + node.w * v.z;
        const bottom = top + node.h * v.z;
        let dx = 0;
        let dy = 0;
        if (left < pad) dx = pad - left;
        else if (right > size.w - pad) dx = size.w - pad - right;
        if (top < pad) dy = pad - top;
        else if (bottom > size.h - pad) dy = size.h - pad - bottom;
        if (dx === 0 && dy === 0) return v;
        userMoved.current = true;
        return { ...v, x: v.x + dx, y: v.y + dy };
      });
    },
    [size.w, size.h],
  );

  useEffect(() => {
    if (!revealRequest) return;
    const node = layout.nodes.find((n) => n.key === revealRequest.key);
    if (node) reveal(node);
    // Only a new request should move the view, not every layout change.
  }, [revealRequest?.n]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Menus opened from nodes live in portals, but React still bubbles their events here.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('.node, .insert, .canvas-overlay, .flow-label')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    userMoved.current = true;
    setView((v) => clampView({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const endPan = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setPanning(false);
  };

  const editableFrom = firstEditableIndex(project.rounds);
  const selectedKey = selectionKey(selection);
  const firstUpcoming = project.rounds.findIndex((r) => r.state === 'upcoming');

  const acceptsOnRound = (roundIndex: number, block: Block | null) => {
    if (!block) return false;
    const round = project.rounds[roundIndex];
    if (block.type === 'round') return roundIndex + 1 >= editableFrom;
    return round.state !== 'done';
  };

  const dropHandlers = (key: string, accepts: boolean, target: { roundId: string } | { insertIndex: number }) =>
    accepts
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (dropKey !== key) setDropKey(key);
          },
          onDragLeave: (e: DragEvent) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropKey(null);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDropKey(null);
            const block = readBlock(e) ?? dragBlock;
            if (block) onDropBlock(block, target);
          },
        }
      : {};

  const renderNode = (node: FlowNode) => {
    const sel = selectionFor(node);
    const round = node.roundIndex !== null ? project.rounds[node.roundIndex] : null;
    const isSelected = selectedKey === node.key;
    const classes = ['node', `node-${node.type}`];
    if (isSelected) classes.push('is-selected');
    if (round && node.type === 'round') {
      classes.push(`is-${round.state}`);
      if (flaggedRoundIds.has(round.id)) classes.push('is-flagged');
    }
    const accepts = node.type === 'round' && node.roundIndex !== null && acceptsOnRound(node.roundIndex, dragBlock);
    if (accepts) classes.push('is-droppable');
    if (dropKey === node.key) classes.push('is-over');

    let body: React.ReactNode = null;
    switch (node.type) {
      case 'trigger':
        body = <TriggerNodeBody />;
        break;
      case 'round':
        body = <RoundNodeBody project={project} round={round!} index={node.roundIndex!} now={now} isNext={node.roundIndex === firstUpcoming} />;
        break;
      case 'gate':
        body = <GateNodeBody project={project} round={round!} />;
        break;
      case 'lock':
        body = <LockNodeBody round={round!} />;
        break;
      case 'revise':
        body = <ReviseNodeBody round={round!} index={node.roundIndex!} />;
        break;
      case 'end':
        body = <EndNodeBody />;
        break;
    }

    return (
      <div
        key={node.key}
        className={classes.join(' ')}
        style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
        {...(node.type === 'round' && round ? dropHandlers(node.key, accepts, { roundId: round.id }) : {})}
      >
        {sel && (
          <button
            type="button"
            className="node-hit"
            aria-label={nodeLabel(project, node)}
            aria-pressed={isSelected}
            onClick={() => onSelect(sel)}
            onFocus={() => reveal(node)}
          />
        )}
        <div className="node-body">{body}</div>
        {node.type === 'round' && round && round.state !== 'done' && (
          <RoundMenu
            project={project}
            round={round}
            index={node.roundIndex!}
            onApprove={props.onApprove}
            onRequestChanges={props.onRequestChanges}
            onMove={props.onMove}
            onRemove={props.onRemove}
          />
        )}
        {node.type === 'round' && round && flaggedRoundIds.has(round.id) && (
          <span className="flag-dot" title="This round has gaps" aria-hidden="true" />
        )}
      </div>
    );
  };

  const { x, y, z } = view;
  const mini = minimap(layout, size, view);

  return (
    <main
      ref={viewportRef}
      className={`canvas${panning ? ' is-panning' : ''}${dragBlock ? ' is-dragging' : ''}`}
      aria-label="Review flow canvas"
      style={{ backgroundPosition: `${x}px ${y}px`, backgroundSize: `${20 * z}px ${20 * z}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onScroll={(e) => {
        // Focus can scroll an overflow:hidden box; the view is driven by pan instead.
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div className="canvas-content" style={{ width: layout.width, height: layout.height, transform: `translate(${x}px, ${y}px) scale(${z})` }}>
        <svg className="edges" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="arrow-head" orient="auto" markerWidth="5" markerHeight="5" refX="3.2" refY="2" overflow="visible">
              <path d="M0 0 L4 2 L0 4 Z" className="arrow-head" />
            </marker>
          </defs>
          {layout.edges.map((edge) => (
            <path key={edge.key} d={edge.d} className={`edge edge-${edge.kind}`} markerEnd={edge.kind === 'loop' ? 'url(#arrow-head)' : undefined} />
          ))}
        </svg>

        {layout.labels.map((label) => (
          <div key={label.key} className="flow-label" style={{ left: label.x, top: label.y, width: label.w, height: label.h }}>
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

        {layout.nodes.map(renderNode)}

        {layout.inserts.map((point) => {
          const key = `insert-${point.index}`;
          const accepts = dragBlock?.type === 'round';
          return (
            <div
              key={key}
              className={`insert${accepts ? ' is-droppable' : ''}${dropKey === key ? ' is-over' : ''}`}
              style={{ left: point.x, top: point.y }}
              {...dropHandlers(key, accepts, { insertIndex: point.index })}
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
                    onSelect: () => onInsert(point.index, { type: 'round', kind: k.kind }),
                  })),
                ]}
              >
                <Icon name="plus" size={14} strokeWidth={2} />
              </MenuButton>
            </div>
          );
        })}
      </div>

      <div className="canvas-overlay minimap hide-sm" aria-hidden="true" onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = (e.clientX - rect.left - mini.ox) / mini.s;
        const cy = (e.clientY - rect.top - mini.oy) / mini.s;
        userMoved.current = true;
        setView((v) => clampView({ ...v, x: size.w / 2 - cx * v.z, y: size.h / 2 - cy * v.z }));
      }}>
        {layout.nodes.map((n) => (
          <span
            key={n.key}
            className={`mini-node${selectedKey === n.key ? ' is-selected' : ''}`}
            style={{ left: mini.ox + n.x * mini.s, top: mini.oy + n.y * mini.s, width: Math.max(2, n.w * mini.s), height: Math.max(2, n.h * mini.s) }}
          />
        ))}
        <span className="mini-view" style={mini.viewport} />
      </div>

      <div className="canvas-overlay zoom-controls" role="group" aria-label="Zoom">
        <button type="button" className="icon-btn icon-btn-md" aria-label="Zoom in" onClick={() => zoomAt(Math.round((z + 0.1) * 10) / 10, size.w / 2, size.h / 2)}>
          <Icon name="plus" size={16} strokeWidth={1.9} />
        </button>
        <span className="zoom-level" aria-live="polite">
          {Math.round(z * 100)}%
        </span>
        <button type="button" className="icon-btn icon-btn-md" aria-label="Zoom out" onClick={() => zoomAt(Math.round((z - 0.1) * 10) / 10, size.w / 2, size.h / 2)}>
          <Icon name="minus" size={16} strokeWidth={1.9} />
        </button>
        <span className="zoom-sep" />
        <button type="button" className="icon-btn icon-btn-md" aria-label="Fit flow to screen" onClick={fit}>
          <Icon name="fit" size={16} strokeWidth={1.9} />
        </button>
      </div>
    </main>
  );
}

const MINI_W = 148;
const MINI_H = 96;

function minimap(layout: FlowLayout, size: { w: number; h: number }, view: View) {
  const s = Math.min((MINI_W - 16) / layout.width, (MINI_H - 8) / layout.height);
  const ox = (MINI_W - layout.width * s) / 2;
  const oy = (MINI_H - layout.height * s) / 2;
  const vx = ox + (-view.x / view.z) * s;
  const vy = oy + (-view.y / view.z) * s;
  const vw = (size.w / view.z) * s;
  const vh = (size.h / view.z) * s;
  const left = Math.max(2, vx);
  const top = Math.max(2, vy);
  const right = Math.min(MINI_W - 2, vx + vw);
  const bottom = Math.min(MINI_H - 2, vy + vh);
  return {
    s,
    ox,
    oy,
    viewport: { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
  };
}
