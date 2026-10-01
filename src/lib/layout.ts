export interface Place {
  /** How far a later overlapping block is inset, so the one under it shows. */
  depth: number;
  /** Blocks that start within half an hour of each other share the width in lanes. */
  lane: number;
  lanes: number;
}

type Block = { id: string; start: number; length: number };

/** Lays out one day's blocks: near-simultaneous starts sit side by side, later overlaps cascade. */
export function placeBlocks(blocks: Block[]): Map<string, Place> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.length - a.length);
  const places = new Map<string, Place>();
  const groups = new Map<string, string[]>();
  sorted.forEach((block, i) => {
    const overlapping = sorted.slice(0, i).filter((o) => o.start + o.length > block.start);
    const sibling = overlapping.find((o) => block.start - o.start < 0.5);
    if (sibling) {
      const group = groups.get(sibling.id) ?? [sibling.id];
      places.set(block.id, { depth: places.get(sibling.id)?.depth ?? 0, lane: group.length, lanes: 1 });
      const next = [...group, block.id];
      for (const id of next) groups.set(id, next);
      return;
    }
    const depth = overlapping.reduce((d, o) => Math.max(d, (places.get(o.id)?.depth ?? 0) + 1), 0);
    places.set(block.id, { depth: Math.min(depth, 3), lane: 0, lanes: 1 });
  });
  for (const [id, group] of groups) {
    const place = places.get(id);
    if (place) places.set(id, { ...place, lanes: group.length });
  }
  return places;
}
