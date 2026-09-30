import { useLayoutEffect, useRef, useState } from 'react';
import type { FlowEdge, FlowLabel, FlowLayout, FlowNode, InsertPoint, Polyline } from '../domain/layout';
import { easeOutQuart, lerp, prefersReducedMotion } from './easing';

export interface ShownNode extends FlowNode {
  opacity: number;
  scale: number;
  exiting: boolean;
}

export interface ShownEdge extends FlowEdge {
  opacity: number;
}

export interface ShownLabel extends FlowLabel {
  opacity: number;
}

export interface ShownInsert extends InsertPoint {
  opacity: number;
}

export interface ShownLayout {
  width: number;
  height: number;
  nodes: ShownNode[];
  edges: ShownEdge[];
  labels: ShownLabel[];
  inserts: ShownInsert[];
  moving: boolean;
}

export function still(layout: FlowLayout): ShownLayout {
  return {
    width: layout.width,
    height: layout.height,
    nodes: layout.nodes.map((n) => ({ ...n, opacity: 1, scale: 1, exiting: false })),
    edges: layout.edges.map((e) => ({ ...e, opacity: 1 })),
    labels: layout.labels.map((l) => ({ ...l, opacity: 1 })),
    inserts: layout.inserts.map((p) => ({ ...p, opacity: 1 })),
    moving: false,
  };
}

function sameShape(a: Polyline[], b: Polyline[]): boolean {
  return a.length === b.length && a.every((line, i) => line.length === b[i].length);
}

const lerpPaths = (a: Polyline[], b: Polyline[], t: number): Polyline[] =>
  a.map((line, i) => line.map(([x, y], j) => [lerp(x, b[i][j][0], t), lerp(y, b[i][j][1], t)] as [number, number]));

/** Blends what is on screen now into the next layout. Pure, so it can be tested. */
export function blend(from: ShownLayout, to: FlowLayout, t: number): ShownLayout {
  const fromNodes = new Map(from.nodes.filter((n) => !n.exiting).map((n) => [n.key, n]));
  const toKeys = new Set(to.nodes.map((n) => n.key));
  const nodes: ShownNode[] = to.nodes.map((n) => {
    const f = fromNodes.get(n.key);
    if (!f) return { ...n, opacity: t, scale: lerp(0.94, 1, t), exiting: false };
    return {
      ...n,
      x: lerp(f.x, n.x, t),
      y: lerp(f.y, n.y, t),
      w: lerp(f.w, n.w, t),
      h: lerp(f.h, n.h, t),
      opacity: lerp(f.opacity, 1, t),
      scale: lerp(f.scale, 1, t),
      exiting: false,
    };
  });
  for (const f of from.nodes) {
    if (toKeys.has(f.key)) continue;
    const opacity = f.opacity * (1 - t);
    if (opacity > 0.01) nodes.push({ ...f, opacity, scale: lerp(f.scale, 0.94, t), exiting: true });
  }

  const fromEdges = new Map(from.edges.filter((e) => e.opacity > 0).map((e) => [e.key, e]));
  const edges: ShownEdge[] = [];
  const toEdgeKeys = new Set<string>();
  for (const e of to.edges) {
    toEdgeKeys.add(e.key);
    const f = fromEdges.get(e.key);
    if (f && sameShape(f.paths, e.paths)) edges.push({ ...e, paths: lerpPaths(f.paths, e.paths, t), opacity: lerp(f.opacity, 1, t) });
    else {
      if (f) edges.push({ ...f, key: `${f.key}~out`, opacity: f.opacity * (1 - t) });
      edges.push({ ...e, opacity: t });
    }
  }
  for (const f of from.edges) {
    if (toEdgeKeys.has(f.key) || f.key.endsWith('~out')) continue;
    if (f.opacity * (1 - t) > 0.01) edges.push({ ...f, key: `${f.key}~out`, opacity: f.opacity * (1 - t) });
  }

  const fromLabels = new Map(from.labels.map((l) => [l.key, l]));
  const labels: ShownLabel[] = to.labels.map((l) => {
    const f = fromLabels.get(l.key);
    return f ? { ...l, x: lerp(f.x, l.x, t), y: lerp(f.y, l.y, t), opacity: lerp(f.opacity, 1, t) } : { ...l, opacity: t };
  });

  const fromInserts = new Map(from.inserts.map((p) => [p.index, p]));
  const inserts: ShownInsert[] = to.inserts.map((p) => {
    const f = fromInserts.get(p.index);
    return f ? { ...p, x: lerp(f.x, p.x, t), y: lerp(f.y, p.y, t), opacity: lerp(f.opacity, 1, t) } : { ...p, opacity: t };
  });

  return { width: to.width, height: Math.max(to.height, lerp(from.height, to.height, t)), nodes, edges, labels, inserts, moving: t < 1 };
}

/** Tweens the canvas from one layout to the next whenever the flow changes. */
export function useAnimatedLayout(target: FlowLayout, duration = 320): ShownLayout {
  const [shown, setShown] = useState<ShownLayout>(() => still(target));
  const current = useRef(shown);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion() || duration <= 0) {
      current.current = still(target);
      setShown(current.current);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = t >= 1 ? still(target) : blend(from, target, easeOutQuart(t));
      current.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return shown;
}
