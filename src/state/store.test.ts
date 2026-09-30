import { sampleProject } from '../domain/seed';
import { historyReducer, initialData, migrate, type History } from './store';

const NOW = Date.UTC(2026, 8, 30, 9);
const fresh = (): History => ({ past: [], present: initialData(NOW), future: [], lastKey: null, lastAt: 0 });

describe('history', () => {
  it('undoes and redoes edits', () => {
    let h = fresh();
    h = historyReducer(h, { type: 'do', action: { type: 'removeMeeting', id: 'm-standup' }, at: 1 });
    expect(h.present.meetings.some((m) => m.id === 'm-standup')).toBe(false);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.meetings.some((m) => m.id === 'm-standup')).toBe(true);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.meetings.some((m) => m.id === 'm-standup')).toBe(false);
  });

  it('folds quick edits with the same key into one undo step', () => {
    let h = fresh();
    const type = (title: string, at: number) =>
      (h = historyReducer(h, { type: 'do', action: { type: 'updateMeeting', id: 'm-standup', patch: { title } }, key: 'meeting:title', at }));
    type('S', 100);
    type('Sy', 300);
    type('Syn', 500);
    expect(h.past).toHaveLength(1);
    type('Sync', 5000);
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.meetings.find((m) => m.id === 'm-standup')?.title).toBe('Syn');
  });

  it('does not record no-op edits or project switches', () => {
    let h = fresh();
    h = historyReducer(h, { type: 'do', action: { type: 'removeMeeting', id: 'missing' }, at: 1 });
    expect(h.past).toHaveLength(0);
    const before = h.past.length;
    h = historyReducer(h, { type: 'do', action: { type: 'switchProject', projectId: 'monsoon-menu' }, at: 2 });
    expect(h.past).toHaveLength(before);
    h = historyReducer(h, { type: 'do', action: { type: 'updateMeeting', id: 'missing', patch: { title: 'x' } }, at: 3 });
    expect(h.past).toHaveLength(before);
  });

  it('keeps a meeting at least fifteen minutes long', () => {
    let h = fresh();
    const m = h.present.meetings[0];
    h = historyReducer(h, { type: 'do', action: { type: 'updateMeeting', id: m.id, patch: { end: m.start - 1 } }, at: 1 });
    const after = h.present.meetings.find((x) => x.id === m.id)!;
    expect(after.end - after.start).toBe(15 * 60 * 1000);
  });

  it('applies a project action to a project other than the open one', () => {
    let h = fresh();
    h = historyReducer(h, {
      type: 'do',
      action: { type: 'project', projectId: 'monsoon-menu', now: NOW, action: { type: 'setDeadline', roundId: 'r-layout', hours: 72 } },
      at: 1,
    });
    expect(h.present.projects[0].rounds[1].closesAfterHours).toBe(72);
  });
});

describe('migrate', () => {
  it('upgrades saved version 1 data with the sample meetings', () => {
    const v1 = { version: 1, projects: [sampleProject(NOW)], activeProjectId: 'monsoon-menu' };
    const data = migrate(v1, NOW)!;
    expect(data.version).toBe(2);
    expect(data.meetings.length).toBeGreaterThan(0);
  });

  it('rejects data it cannot read', () => {
    expect(migrate(null, NOW)).toBeNull();
    expect(migrate({ version: 1, projects: [] }, NOW)).toBeNull();
    expect(migrate({ version: 9, projects: [sampleProject(NOW)] }, NOW)).toBeNull();
  });
});
