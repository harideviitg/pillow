import { firstEditableIndex, roundInbox } from './routing';
import type { Project, Round } from './types';

export type FlowNodeType = 'trigger' | 'round' | 'gate' | 'lock' | 'revise' | 'end';

export interface FlowNode {
  key: string;
  type: FlowNodeType;
  roundId: string | null;
  roundIndex: number | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Polyline = [number, number][];

export interface FlowEdge {
  key: string;
  /** One or more polylines, so edges can be tweened point by point. */
  paths: Polyline[];
  kind: 'solid' | 'loop';
}

export function edgePath(paths: Polyline[]): string {
  return paths.map((line) => line.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')).join(' ');
}

export interface FlowLabel {
  key: string;
  kind: 'approved' | 'changes';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InsertPoint {
  index: number;
  x: number;
  y: number;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  labels: FlowLabel[];
  inserts: InsertPoint[];
}

export const CANVAS_WIDTH = 760;
export const SPINE_X = 380;
export const LEFT_X = 200;
export const RIGHT_X = 590;
export const LOOP_X = 744;
export const PLUS_SIZE = 28;

const ROUND_W = 360;
const TRIGGER = { w: 300, h: 52 };
const GATE = { w: 240, h: 48 };
const LOCK = { w: 320, h: 64 };
const REVISE = { w: 272, h: 116 };
const END = { w: 220, h: 44 };
const LABEL = { w: 96, h: 28 };

/** Number of detail rows an upcoming round card shows (at least one). */
export function upcomingRows(project: Project, roundIndex: number): number {
  const inbox = roundInbox(project, roundIndex);
  return Math.max(1, inbox.parkedIn.length + inbox.reopenRequests.length);
}

export function roundHeight(project: Project, round: Round, index: number): number {
  if (round.state === 'done') return 112;
  if (round.state === 'live') return 144;
  return 64 + 34 * upcomingRows(project, index);
}

export function hasGate(round: Round): boolean {
  return round.state !== 'done' && round.finalSayId !== null;
}

const line = (x1: number, y1: number, x2: number, y2: number): Polyline => [
  [x1, y1],
  [x2, y2],
];

export function layoutFlow(project: Project): FlowLayout {
  const { rounds } = project;
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const labels: FlowLabel[] = [];
  const inserts: InsertPoint[] = [];
  const editableFrom = firstEditableIndex(rounds);

  let y = 24;
  nodes.push({ key: 'trigger', type: 'trigger', roundId: null, roundIndex: null, x: SPINE_X - TRIGGER.w / 2, y, ...TRIGGER });
  y += TRIGGER.h;

  // A 48px run down the spine, holding an insert button where a round can go.
  const run = (index: number) => {
    if (index >= editableFrom) {
      edges.push({ key: `run-${index}-a`, paths: [line(SPINE_X, y, SPINE_X, y + 10)], kind: 'solid' });
      inserts.push({ index, x: SPINE_X - PLUS_SIZE / 2, y: y + 10 });
      edges.push({ key: `run-${index}-b`, paths: [line(SPINE_X, y + 38, SPINE_X, y + 48)], kind: 'solid' });
    } else {
      edges.push({ key: `run-${index}`, paths: [line(SPINE_X, y, SPINE_X, y + 48)], kind: 'solid' });
    }
    y += 48;
  };

  rounds.forEach((round, i) => {
    run(i);
    const h = roundHeight(project, round, i);
    const roundTop = y;
    nodes.push({ key: round.id, type: 'round', roundId: round.id, roundIndex: i, x: SPINE_X - ROUND_W / 2, y, w: ROUND_W, h });
    y += h;
    if (!hasGate(round)) return;

    edges.push({ key: `${round.id}-to-gate`, paths: [line(SPINE_X, y, SPINE_X, y + 24)], kind: 'solid' });
    y += 24;
    nodes.push({ key: `${round.id}:gate`, type: 'gate', roundId: round.id, roundIndex: i, x: SPINE_X - GATE.w / 2, y, ...GATE });
    y += GATE.h;
    edges.push({ key: `${round.id}-from-gate`, paths: [line(SPINE_X, y, SPINE_X, y + 24)], kind: 'solid' });
    y += 24;

    const split = y;
    const top = split + 56;
    edges.push({
      key: `${round.id}-split`,
      paths: [
        [
          [LEFT_X, split],
          [RIGHT_X, split],
          [RIGHT_X, top],
        ],
      ],
      kind: 'solid',
    });
    labels.push({ key: `${round.id}:approved`, kind: 'approved', x: LEFT_X - LABEL.w / 2, y: split + 14, ...LABEL });
    labels.push({ key: `${round.id}:changes`, kind: 'changes', x: RIGHT_X - LABEL.w / 2, y: split + 14, ...LABEL });

    let leftBottom = top;
    if (round.lockOnApprove.length > 0) {
      nodes.push({ key: `${round.id}:lock`, type: 'lock', roundId: round.id, roundIndex: i, x: LEFT_X - LOCK.w / 2, y: top, ...LOCK });
      leftBottom = top + LOCK.h;
    }
    nodes.push({ key: `${round.id}:revise`, type: 'revise', roundId: round.id, roundIndex: i, x: RIGHT_X - REVISE.w / 2, y: top, ...REVISE });
    const rightBottom = top + REVISE.h;

    edges.push({
      key: `${round.id}-loop`,
      paths: [
        [
          [RIGHT_X + REVISE.w / 2, top + REVISE.h / 2],
          [LOOP_X, top + REVISE.h / 2],
          [LOOP_X, roundTop + h / 2],
          [SPINE_X + ROUND_W / 2 + 2, roundTop + h / 2],
        ],
      ],
      kind: 'loop',
    });

    // The approved branch rejoins the spine below both branches.
    const merge = Math.max(leftBottom + 24, rightBottom - 28);
    // Always two polylines so the edge can tween when the lock step comes and goes.
    const upper: Polyline = leftBottom === top ? line(LEFT_X, split, LEFT_X, split + 1) : line(LEFT_X, split, LEFT_X, top);
    const lower: Polyline = [
      [LEFT_X, leftBottom === top ? split : leftBottom],
      [LEFT_X, merge],
      [SPINE_X, merge],
    ];
    edges.push({ key: `${round.id}-merge`, paths: [upper, lower], kind: 'solid' });
    y = merge;
  });

  run(rounds.length);
  nodes.push({ key: 'end', type: 'end', roundId: null, roundIndex: null, x: SPINE_X - END.w / 2, y, ...END });
  y += END.h;

  return { width: CANVAS_WIDTH, height: y + 40, nodes, edges, labels, inserts };
}
