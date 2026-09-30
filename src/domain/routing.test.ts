import { aspectStatus, firstEditableIndex, roundInbox, routedComments } from './routing';
import { sampleProject } from './seed';
import type { Round } from './types';

const NOW = Date.UTC(2026, 8, 30, 9);

describe('aspectStatus', () => {
  const project = sampleProject(NOW);
  const r = project.rounds;

  it('matches what the design shows for the live layout round', () => {
    expect(aspectStatus(r, 1, 'layout')).toEqual({ kind: 'focus', reopenedFrom: null });
    expect(aspectStatus(r, 1, 'copy')).toEqual({ kind: 'parked', roundIndex: 2 });
    expect(aspectStatus(r, 1, 'imagery')).toEqual({ kind: 'parked', roundIndex: 3 });
    expect(aspectStatus(r, 1, 'color')).toEqual({ kind: 'locked', roundIndex: 0 });
  });

  it('treats planned locks from earlier rounds as locked', () => {
    expect(aspectStatus(r, 2, 'layout')).toEqual({ kind: 'locked', roundIndex: 1 });
  });

  it('marks an aspect with no later round as unscheduled', () => {
    const rounds: Round[] = r.map((round) => ({ ...round, focus: round.focus.filter((a) => a !== 'imagery') }));
    expect(aspectStatus(rounds, 1, 'imagery')).toEqual({ kind: 'unscheduled' });
  });

  it('reports a reopen, then treats the aspect as open until it is locked again', () => {
    const rounds: Round[] = r.map((round, i) => (i === 2 ? { ...round, focus: [...round.focus, 'color'], lockOnApprove: ['copy'] } : round));
    expect(aspectStatus(rounds, 2, 'color')).toEqual({ kind: 'focus', reopenedFrom: 0 });
    expect(aspectStatus(rounds, 3, 'color')).toEqual({ kind: 'unscheduled' });

    const relocked: Round[] = rounds.map((round, i) => (i === 2 ? { ...round, lockOnApprove: ['copy', 'color'] } : round));
    expect(aspectStatus(relocked, 3, 'color')).toEqual({ kind: 'locked', roundIndex: 2 });
  });
});

describe('comment routing', () => {
  const project = sampleProject(NOW);

  it('parks off-focus feedback and turns locked feedback into reopen requests', () => {
    const kinds = routedComments(project).map((c) => c.route.kind);
    expect(kinds.filter((k) => k === 'counts')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'parked')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'reopen-request')).toHaveLength(1);
  });

  it('shows the inbox counts the design shows on Round 2 and Round 3', () => {
    expect(roundInbox(project, 1).parkedOut).toBe(4);
    expect(roundInbox(project, 2)).toEqual({
      parkedOut: 0,
      parkedIn: [{ fromIndex: 1, count: 4 }],
      reopenRequests: [{ aspect: 'color', count: 1 }],
    });
  });

  it('reroutes live when the flow changes', () => {
    const changed = {
      ...project,
      rounds: project.rounds.map((round, i) => (i === 1 ? { ...round, focus: [...round.focus, 'copy' as const] } : round)),
    };
    expect(roundInbox(changed, 1).parkedOut).toBe(0);
    expect(routedComments(changed).filter((c) => c.route.kind === 'counts')).toHaveLength(6);
  });
});

describe('firstEditableIndex', () => {
  it('only allows inserting after the live round', () => {
    expect(firstEditableIndex(sampleProject(NOW).rounds)).toBe(2);
  });
});
