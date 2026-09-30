import { layoutFlow } from '../domain/layout';
import { projectReducer } from '../domain/reducer';
import { sampleProject } from '../domain/seed';
import { previewProject } from '../components/FlowCanvas';
import { blend, still } from './useAnimatedLayout';

const NOW = Date.UTC(2026, 8, 30, 9);

describe('blend', () => {
  const before = layoutFlow(sampleProject(NOW));
  const inserted = projectReducer(sampleProject(NOW), { type: 'insertRound', index: 2, kind: 'copy', id: 'new' }, NOW);
  const after = layoutFlow(inserted);

  it('starts where things were and ends where they go', () => {
    const start = blend(still(before), after, 0);
    const end = blend(still(before), after, 1);
    const pick = (l: typeof start, key: string) => l.nodes.find((n) => n.key === key && !n.exiting)!;
    expect(pick(start, 'r-polish').y).toBe(before.nodes.find((n) => n.key === 'r-polish')!.y);
    expect(pick(end, 'r-polish').y).toBe(after.nodes.find((n) => n.key === 'r-polish')!.y);
  });

  it('fades a new node in and slides the rest halfway at the midpoint', () => {
    const mid = blend(still(before), after, 0.5);
    const added = mid.nodes.find((n) => n.key === 'new')!;
    expect(added.opacity).toBeCloseTo(0.5);
    const from = before.nodes.find((n) => n.key === 'r-copy')!.y;
    const to = after.nodes.find((n) => n.key === 'r-copy')!.y;
    expect(mid.nodes.find((n) => n.key === 'r-copy')!.y).toBeCloseTo((from + to) / 2);
  });

  it('keeps removed nodes around while they fade out', () => {
    const mid = blend(still(after), before, 0.5);
    const leaving = mid.nodes.find((n) => n.key === 'new');
    expect(leaving?.exiting).toBe(true);
    expect(leaving?.opacity).toBeCloseTo(0.5);
  });
});

describe('previewProject', () => {
  const project = sampleProject(NOW);

  it('lifts a dragged round out of the flow until it has a slot', () => {
    const lifted = previewProject(project, { kind: 'round', roundId: 'r-polish' }, null);
    expect(lifted.project.rounds.map((r) => r.id)).toEqual(['r-direction', 'r-layout', 'r-copy']);
    const placed = previewProject(project, { kind: 'round', roundId: 'r-polish' }, 2);
    expect(placed.project.rounds.map((r) => r.id)).toEqual(['r-direction', 'r-layout', 'r-polish', 'r-copy']);
    expect(placed.key).toBe('r-polish');
  });

  it('opens a gap for a new round from the blocks panel', () => {
    const preview = previewProject(project, { kind: 'block', block: { type: 'round', kind: 'layout' }, id: 'tmp' }, 3);
    expect(preview.project.rounds[3]).toMatchObject({ id: 'tmp', kind: 'layout', state: 'upcoming' });
  });
});
