import { layoutFlow } from './layout';
import { blankProject } from './projects';
import { sampleProject } from './seed';

const NOW = Date.UTC(2026, 8, 30, 9);

describe('layoutFlow', () => {
  const layout = layoutFlow(sampleProject(NOW));
  const node = (key: string) => {
    const found = layout.nodes.find((n) => n.key === key);
    if (!found) throw new Error(`missing node ${key}`);
    return { x: found.x, y: found.y, w: found.w, h: found.h };
  };

  it('places the top of the flow exactly where the design does', () => {
    expect(node('trigger')).toEqual({ x: 230, y: 24, w: 300, h: 52 });
    expect(node('r-direction')).toEqual({ x: 200, y: 124, w: 360, h: 112 });
    expect(node('r-layout')).toEqual({ x: 200, y: 284, w: 360, h: 144 });
    expect(node('r-layout:gate')).toEqual({ x: 260, y: 452, w: 240, h: 48 });
    expect(node('r-layout:lock')).toEqual({ x: 40, y: 580, w: 320, h: 64 });
    expect(node('r-layout:revise')).toEqual({ x: 454, y: 580, w: 272, h: 116 });
  });

  it('draws the revision loop back into the round it came from', () => {
    const loop = layout.edges.find((e) => e.key === 'r-layout-loop');
    expect(loop?.kind).toBe('loop');
    expect(loop?.d).toBe('M 726 638 L 744 638 L 744 356 L 562 356');
  });

  it('labels both branches of the decision', () => {
    const labels = layout.labels.filter((l) => l.key.startsWith('r-layout:'));
    expect(labels.map((l) => [l.kind, l.x, l.y])).toEqual([
      ['approved', 152, 538],
      ['changes', 542, 538],
    ]);
  });

  it('only offers insert points after the live round', () => {
    expect(layout.inserts.map((p) => p.index)).toEqual([2, 3, 4]);
  });

  it('grows upcoming cards with their inbox rows', () => {
    expect(node('r-copy').h).toBe(132);
    expect(node('r-polish').h).toBe(98);
  });

  it('keeps nodes inside the canvas and in order down the page', () => {
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.h).toBeLessThanOrEqual(layout.height);
    }
    const rounds = layout.nodes.filter((n) => n.type === 'round');
    for (let i = 1; i < rounds.length; i++) expect(rounds[i].y).toBeGreaterThan(rounds[i - 1].y + rounds[i - 1].h);
  });

  it('lays out a flow that has not started with an insert point before every round', () => {
    const blank = layoutFlow(blankProject('p', 'Client', 'Poster', NOW));
    expect(blank.inserts.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(blank.nodes.filter((n) => n.type === 'gate')).toHaveLength(0);
  });
});
