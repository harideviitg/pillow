import { findGaps } from './gaps';
import { blankProject } from './projects';
import { applyBlockToRound, projectReducer, type ProjectAction } from './reducer';
import { aspectStatus, routedComments } from './routing';
import { sampleProject } from './seed';
import { HOUR } from './time';
import type { Project } from './types';

const NOW = Date.UTC(2026, 8, 30, 9);
const run = (project: Project, ...actions: ProjectAction[]) => actions.reduce((p, a) => projectReducer(p, a, NOW), project);
const byId = (project: Project, id: string) => project.rounds.find((r) => r.id === id)!;

describe('projectReducer', () => {
  it('refuses to insert a round before the live one', () => {
    const project = sampleProject(NOW);
    expect(run(project, { type: 'insertRound', index: 1, kind: 'copy', id: 'x' })).toBe(project);
  });

  it('inserts a round that inherits reviewers and rules from the one before it', () => {
    const next = run(sampleProject(NOW), { type: 'insertRound', index: 2, kind: 'copy', id: 'x' });
    const round = next.rounds[2];
    expect(round.id).toBe('x');
    expect(round.state).toBe('upcoming');
    expect(round.reviewerIds).toEqual(['anika', 'dev', 'meera']);
    expect(round.finalSayId).toBe('anika');
    expect(round.focus).toEqual(['copy']);
    expect(next.activity[0].text).toBe('Added Round 3: Copy');
  });

  it('approves the live round, locks its layer and starts the next round', () => {
    const next = run(sampleProject(NOW), { type: 'approveRound', roundId: 'r-layout', note: 'Two column grid' });
    expect(byId(next, 'r-layout')).toMatchObject({ state: 'done', approvedById: 'anika', approvedAt: NOW, decisionNote: 'Two column grid' });
    expect(byId(next, 'r-copy')).toMatchObject({ state: 'live', startedAt: NOW, reviewedIds: [] });
    expect(aspectStatus(next.rounds, 2, 'layout')).toEqual({ kind: 'locked', roundIndex: 1 });
  });

  it('sends changes back until revisions run out, then needs the extra round', () => {
    let project = run(sampleProject(NOW), { type: 'requestChanges', roundId: 'r-layout' });
    expect(byId(project, 'r-layout')).toMatchObject({ revisionsUsed: 2, reviewedIds: [], startedAt: NOW });
    expect(run(project, { type: 'requestChanges', roundId: 'r-layout' })).toBe(project);

    project = run(project, { type: 'buyExtraRound', roundId: 'r-layout' });
    expect(byId(project, 'r-layout').revisionsAllowed).toBe(3);
    project = run(project, { type: 'requestChanges', roundId: 'r-layout' });
    expect(byId(project, 'r-layout').revisionsUsed).toBe(3);
  });

  it('moves an aspect to a later round when it is parked there', () => {
    const next = run(sampleProject(NOW), { type: 'setAspect', roundId: 'r-copy', aspect: 'copy', target: { kind: 'parked', roundId: 'r-polish' } });
    expect(byId(next, 'r-copy')).toMatchObject({ focus: [], lockOnApprove: [] });
    expect(byId(next, 'r-polish')).toMatchObject({ focus: ['imagery', 'copy'], lockOnApprove: ['imagery', 'copy'] });
    expect(aspectStatus(next.rounds, 1, 'copy')).toEqual({ kind: 'parked', roundIndex: 3 });
  });

  it('drags an aspect to another round, taking its lock along instead of reopening it', () => {
    const next = run(sampleProject(NOW), { type: 'moveAspect', aspect: 'copy', fromRoundId: 'r-layout', toRoundId: 'r-polish' });
    expect(byId(next, 'r-copy')).toMatchObject({ focus: [], lockOnApprove: [] });
    expect(byId(next, 'r-polish')).toMatchObject({ focus: ['imagery', 'copy'], revisionsUsed: 0 });
    expect(aspectStatus(next.rounds, 1, 'copy')).toEqual({ kind: 'parked', roundIndex: 3 });
  });

  it('reopens a locked aspect dragged onto a later round', () => {
    const next = run(sampleProject(NOW), { type: 'moveAspect', aspect: 'color', fromRoundId: 'r-layout', toRoundId: 'r-copy' });
    expect(byId(next, 'r-copy')).toMatchObject({ focus: ['copy', 'color'], revisionsUsed: 1 });
  });

  it('reorders an upcoming round but never ahead of the live one', () => {
    const project = sampleProject(NOW);
    const moved = run(project, { type: 'reorderRound', roundId: 'r-polish', toIndex: 2 });
    expect(moved.rounds.map((r) => r.id)).toEqual(['r-direction', 'r-layout', 'r-polish', 'r-copy']);
    const clamped = run(project, { type: 'reorderRound', roundId: 'r-polish', toIndex: 0 });
    expect(clamped.rounds.map((r) => r.id)).toEqual(['r-direction', 'r-layout', 'r-polish', 'r-copy']);
    expect(run(project, { type: 'reorderRound', roundId: 'r-layout', toIndex: 3 })).toBe(project);
  });

  it('charges a revision to reopen a locked aspect', () => {
    const next = run(sampleProject(NOW), { type: 'setAspect', roundId: 'r-layout', aspect: 'color', target: { kind: 'focus' } });
    expect(byId(next, 'r-layout')).toMatchObject({ focus: ['layout', 'color'], revisionsUsed: 2 });

    const spent = run(next, { type: 'setAspect', roundId: 'r-layout', aspect: 'color', target: { kind: 'focus' } });
    expect(spent).toBe(next);
  });

  it('accepts a reopen request in the round it is weighed at', () => {
    const next = run(sampleProject(NOW), { type: 'acceptReopen', commentId: 'c4' });
    expect(byId(next, 'r-copy')).toMatchObject({ focus: ['copy', 'color'], revisionsUsed: 1 });
    expect(next.comments.find((c) => c.id === 'c4')?.resolution).toBe('reopened');
    expect(routedComments(next).find((c) => c.comment.id === 'c4')?.route.kind).toBe('reopened');
  });

  it('declines a reopen request without touching the flow', () => {
    const project = sampleProject(NOW);
    const next = run(project, { type: 'declineReopen', commentId: 'c4' });
    expect(next.rounds).toBe(project.rounds);
    expect(next.comments.find((c) => c.id === 'c4')?.resolution).toBe('declined');
  });

  it('only removes and reorders rounds that have not run', () => {
    const project = sampleProject(NOW);
    expect(run(project, { type: 'removeRound', roundId: 'r-layout' })).toBe(project);
    expect(run(project, { type: 'moveRound', roundId: 'r-copy', delta: -1 })).toBe(project);

    const moved = run(project, { type: 'moveRound', roundId: 'r-copy', delta: 1 });
    expect(moved.rounds.map((r) => r.id)).toEqual(['r-direction', 'r-layout', 'r-polish', 'r-copy']);
    const removed = run(project, { type: 'removeRound', roundId: 'r-polish' });
    expect(removed.rounds.map((r) => r.id)).toEqual(['r-direction', 'r-layout', 'r-copy']);
  });

  it('removing a reviewer also clears their final say', () => {
    const next = run(sampleProject(NOW), { type: 'removeReviewer', roundId: 'r-copy', personId: 'anika' });
    expect(byId(next, 'r-copy')).toMatchObject({ reviewerIds: ['dev', 'meera'], finalSayId: null });
  });

  it('records nudges and reviews on the live round only', () => {
    let project = run(sampleProject(NOW), { type: 'nudgeReviewer', roundId: 'r-layout', personId: 'meera' });
    expect(byId(project, 'r-layout').nudgedAt.meera).toBe(NOW);
    expect(project.activity[0].text).toBe('WhatsApp nudge sent to Meera');
    project = run(project, { type: 'markReviewed', roundId: 'r-layout', personId: 'meera' });
    expect(byId(project, 'r-layout').reviewedIds).toEqual(['anika', 'dev', 'meera']);
    expect(run(project, { type: 'markReviewed', roundId: 'r-copy', personId: 'meera' })).toBe(project);
  });

  it('starts the first upcoming round when nothing is live', () => {
    const next = run(blankProject('p', 'Client', 'Poster', NOW), { type: 'startNextRound' });
    expect(next.rounds[0]).toMatchObject({ state: 'live', startedAt: NOW });
    expect(run(next, { type: 'startNextRound' })).toBe(next);
  });
});

describe('applyBlockToRound', () => {
  const project = sampleProject(NOW);
  const bare = { ...byId(project, 'r-copy'), finalSayId: null, lockOnApprove: [], closesAfterHours: null, extraRound: null, nudge: null };

  it('adds each rule once', () => {
    expect(applyBlockToRound(bare, { type: 'rule', rule: 'final-say' }, project.people).finalSayId).toBe('anika');
    expect(applyBlockToRound(bare, { type: 'rule', rule: 'lock-layer' }, project.people).lockOnApprove).toEqual(['copy']);
    expect(applyBlockToRound(bare, { type: 'rule', rule: 'deadline' }, project.people).closesAfterHours).toBe(48);
    expect(applyBlockToRound(bare, { type: 'rule', rule: 'extra-round' }, project.people).extraRound).toEqual({ days: 2, fee: '' });
    const full = byId(project, 'r-copy');
    expect(applyBlockToRound(full, { type: 'rule', rule: 'final-say' }, project.people)).toBe(full);
  });

  it('switches the nudge channel but keeps its timing', () => {
    const next = applyBlockToRound(byId(project, 'r-copy'), { type: 'nudge', channel: 'email' }, project.people);
    expect(next.nudge).toEqual({ channel: 'email', afterHours: 24 });
  });

  it('never changes a finished round', () => {
    const done = byId(project, 'r-direction');
    expect(applyBlockToRound(done, { type: 'nudge', channel: 'email' }, project.people)).toBe(done);
  });
});

describe('findGaps', () => {
  it('finds nothing wrong with the sample flow', () => {
    expect(findGaps(sampleProject(NOW), NOW)).toEqual([]);
  });

  it('flags missing reviewers and final say on a fresh project', () => {
    const texts = findGaps(blankProject('p', 'Client', 'Poster', NOW), NOW).map((g) => g.text);
    expect(texts).toContain('Round 1 has no reviewers.');
    expect(texts).toContain('Round 4 has no final say, so anyone can hold it up.');
    expect(texts).toHaveLength(8);
  });

  it('flags an aspect nobody reviews and feedback with nowhere to go', () => {
    const project = sampleProject(NOW);
    const noImagery = { ...project, rounds: project.rounds.map((r) => ({ ...r, focus: r.focus.filter((a) => a !== 'imagery') })) };
    const withComment = {
      ...noImagery,
      comments: [...noImagery.comments, { ...noImagery.comments[0], id: 'x', aspect: 'imagery' as const }],
    };
    const texts = findGaps(withComment, NOW).map((g) => g.text);
    expect(texts).toContain('Imagery is never in focus. Feedback on it has nowhere to go.');
    expect(texts).toContain('Round 4 has nothing in focus.');
    expect(texts).toContain('1 comment on imagery has no round to land in.');
  });

  it('flags an overdue live round', () => {
    expect(findGaps(sampleProject(NOW), NOW + 20 * HOUR).map((g) => g.text)).toContain('Round 2 is past its deadline.');
  });
});
