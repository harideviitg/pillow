import {
  aspectLabel,
  channelLabel,
  DEFAULT_DEADLINE_HOURS,
  DEFAULT_EXTRA_ROUND_DAYS,
  DEFAULT_NUDGE_HOURS,
  DEFAULT_REVISIONS,
  roundKindDef,
  type Block,
} from './catalog';
import { aspectStatus, firstEditableIndex, routeComment } from './routing';
import type { AspectId, Comment, ExtraRound, Nudge, Person, Project, Round, RoundKind } from './types';

export type AspectTarget = { kind: 'focus' } | { kind: 'parked'; roundId: string };

export type ProjectAction =
  | { type: 'insertRound'; index: number; kind: RoundKind; id: string }
  | { type: 'removeRound'; roundId: string }
  | { type: 'moveRound'; roundId: string; delta: -1 | 1 }
  | { type: 'reorderRound'; roundId: string; toIndex: number }
  | { type: 'moveAspect'; aspect: AspectId; fromRoundId: string; toRoundId: string }
  | { type: 'applyBlock'; roundId: string; block: Block }
  | { type: 'setAspect'; roundId: string; aspect: AspectId; target: AspectTarget }
  | { type: 'setLock'; roundId: string; aspects: AspectId[] }
  | { type: 'setFinalSay'; roundId: string; personId: string | null }
  | { type: 'addReviewer'; roundId: string; personId: string }
  | { type: 'addPerson'; roundId: string; person: Person }
  | { type: 'removeReviewer'; roundId: string; personId: string }
  | { type: 'setDeadline'; roundId: string; hours: number | null }
  | { type: 'setNudge'; roundId: string; nudge: Nudge | null }
  | { type: 'setRevisions'; roundId: string; allowed: number }
  | { type: 'setExtraRound'; roundId: string; extra: ExtraRound | null }
  | { type: 'nudgeReviewer'; roundId: string; personId: string }
  | { type: 'approveRound'; roundId: string; note: string }
  | { type: 'requestChanges'; roundId: string }
  | { type: 'buyExtraRound'; roundId: string }
  | { type: 'startNextRound' }
  | { type: 'addComment'; comment: Comment }
  | { type: 'markReviewed'; roundId: string; personId: string }
  | { type: 'declineReopen'; commentId: string }
  | { type: 'acceptReopen'; commentId: string };

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function roundName(project: Project, roundId: string): string {
  const i = project.rounds.findIndex((r) => r.id === roundId);
  if (i < 0) return 'Round';
  return `Round ${i + 1}: ${roundKindDef(project.rounds[i].kind).label}`;
}

export function personName(project: Project, personId: string | null): string {
  return project.people.find((p) => p.id === personId)?.name ?? 'Someone';
}

function log(project: Project, now: number, text: string): Project {
  return { ...project, activity: [{ id: uid('a'), at: now, text }, ...project.activity].slice(0, 200) };
}

function updateRound(project: Project, roundId: string, fn: (round: Round) => Round): Project {
  return { ...project, rounds: project.rounds.map((r) => (r.id === roundId ? fn(r) : r)) };
}

const without = <T,>(list: T[], item: T) => list.filter((x) => x !== item);
const withItem = <T,>(list: T[], item: T) => (list.includes(item) ? list : [...list, item]);

export function newRound(project: Project, index: number, kind: RoundKind, id: string): Round {
  const def = roundKindDef(kind);
  const prev = project.rounds[index - 1] ?? project.rounds[index];
  const reviewerIds = prev ? [...prev.reviewerIds] : project.people.map((p) => p.id);
  return {
    id,
    kind,
    state: 'upcoming',
    focus: [...def.focus],
    lockOnApprove: [...def.lockOnApprove],
    reviewerIds,
    finalSayId: prev?.finalSayId && reviewerIds.includes(prev.finalSayId) ? prev.finalSayId : null,
    reviewedIds: [],
    closesAfterHours: prev ? prev.closesAfterHours : DEFAULT_DEADLINE_HOURS,
    nudge: prev?.nudge ? { ...prev.nudge } : null,
    revisionsAllowed: DEFAULT_REVISIONS,
    revisionsUsed: 0,
    extraRound: prev?.extraRound ? { ...prev.extraRound } : null,
    startedAt: null,
    approvedAt: null,
    approvedById: null,
    decisionNote: '',
    nudgedAt: {},
  };
}

/** What dropping a rule or nudge block on a round does. Returns the same round when nothing changes. */
export function applyBlockToRound(round: Round, block: Block, people: Person[]): Round {
  if (round.state === 'done') return round;
  if (block.type === 'nudge') {
    if (round.nudge?.channel === block.channel) return round;
    return { ...round, nudge: { channel: block.channel, afterHours: round.nudge?.afterHours ?? DEFAULT_NUDGE_HOURS } };
  }
  if (block.type !== 'rule') return round;
  switch (block.rule) {
    case 'final-say': {
      if (round.finalSayId) return round;
      const personId = round.reviewerIds[0] ?? people[0]?.id;
      if (!personId) return round;
      return { ...round, finalSayId: personId, reviewerIds: withItem(round.reviewerIds, personId) };
    }
    case 'lock-layer':
      if (round.lockOnApprove.length > 0 || round.focus.length === 0) return round;
      return { ...round, lockOnApprove: [...round.focus] };
    case 'deadline':
      if (round.closesAfterHours !== null) return round;
      return { ...round, closesAfterHours: DEFAULT_DEADLINE_HOURS };
    case 'extra-round':
      if (round.extraRound) return round;
      return { ...round, extraRound: { days: DEFAULT_EXTRA_ROUND_DAYS, fee: '' } };
  }
}

export function canReopen(round: Round): boolean {
  return round.state !== 'done' && round.revisionsUsed < round.revisionsAllowed;
}

function reopenAspect(project: Project, roundIndex: number, aspect: AspectId, now: number): Project | null {
  const round = project.rounds[roundIndex];
  if (!round || !canReopen(round)) return null;
  const next = updateRound(project, round.id, (r) => ({
    ...r,
    focus: withItem(r.focus, aspect),
    revisionsUsed: r.revisionsUsed + 1,
  }));
  return log(next, now, `${aspectLabel(aspect)} reopened in ${roundName(project, round.id)}. That used a revision`);
}

/**
 * Makes round `to` the one that reviews an aspect, taking it (and its lock rule)
 * away from round `home`. Reopens it, at the cost of a revision, if it is locked there.
 */
function relocateAspect(project: Project, home: number, to: number, aspect: AspectId, now: number): Project | null {
  const target = project.rounds[to];
  if (!target || target.state === 'done') return null;
  let next = project;
  const source = project.rounds[home];
  if (source && home !== to && source.state !== 'done') {
    const hadLock = source.lockOnApprove.includes(aspect);
    next = updateRound(next, source.id, (r) => ({ ...r, focus: without(r.focus, aspect), lockOnApprove: without(r.lockOnApprove, aspect) }));
    if (hadLock) next = updateRound(next, target.id, (r) => ({ ...r, lockOnApprove: withItem(r.lockOnApprove, aspect) }));
  }
  const status = aspectStatus(next.rounds, to, aspect);
  if (status.kind === 'focus') return next;
  if (status.kind === 'locked') return reopenAspect(next, to, aspect, now);
  return updateRound(next, target.id, (r) => ({ ...r, focus: withItem(r.focus, aspect) }));
}

export function projectReducer(project: Project, action: ProjectAction, now: number): Project {
  const findIndex = (roundId: string) => project.rounds.findIndex((r) => r.id === roundId);

  switch (action.type) {
    case 'insertRound': {
      if (action.index < firstEditableIndex(project.rounds) || action.index > project.rounds.length) return project;
      const round = newRound(project, action.index, action.kind, action.id);
      const rounds = [...project.rounds];
      rounds.splice(action.index, 0, round);
      const next = { ...project, rounds };
      return log(next, now, `Added ${roundName(next, round.id)}`);
    }

    case 'removeRound': {
      const i = findIndex(action.roundId);
      if (i < 0 || project.rounds[i].state !== 'upcoming') return project;
      const name = roundName(project, action.roundId);
      return log({ ...project, rounds: project.rounds.filter((r) => r.id !== action.roundId) }, now, `Removed ${name}`);
    }

    case 'moveRound': {
      const i = findIndex(action.roundId);
      const j = i + action.delta;
      if (i < 0 || j < 0 || j >= project.rounds.length) return project;
      if (project.rounds[i].state !== 'upcoming' || project.rounds[j].state !== 'upcoming') return project;
      const rounds = [...project.rounds];
      [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
      return { ...project, rounds };
    }

    case 'reorderRound': {
      const i = findIndex(action.roundId);
      const round = project.rounds[i];
      if (!round || round.state !== 'upcoming') return project;
      const rest = project.rounds.filter((r) => r.id !== round.id);
      const to = Math.min(rest.length, Math.max(firstEditableIndex(rest), action.toIndex));
      if (to === i) return project;
      rest.splice(to, 0, round);
      return log({ ...project, rounds: rest }, now, `Moved ${roundKindDef(round.kind).label} to Round ${to + 1}`);
    }

    case 'moveAspect': {
      const from = findIndex(action.fromRoundId);
      const to = findIndex(action.toRoundId);
      if (from < 0 || to < 0) return project;
      if (from === to) return projectReducer(project, { type: 'setAspect', roundId: action.toRoundId, aspect: action.aspect, target: { kind: 'focus' } }, now);
      const status = aspectStatus(project.rounds, from, action.aspect);
      const home = status.kind === 'focus' ? from : status.kind === 'parked' ? status.roundIndex : -1;
      return relocateAspect(project, home, to, action.aspect, now) ?? project;
    }

    case 'applyBlock':
      return updateRound(project, action.roundId, (r) => applyBlockToRound(r, action.block, project.people));

    case 'setAspect': {
      const i = findIndex(action.roundId);
      const round = project.rounds[i];
      if (!round || round.state === 'done') return project;
      if (action.target.kind === 'focus') {
        const status = aspectStatus(project.rounds, i, action.aspect);
        if (status.kind === 'focus') return project;
        if (status.kind === 'locked') return reopenAspect(project, i, action.aspect, now) ?? project;
        return updateRound(project, round.id, (r) => ({ ...r, focus: withItem(r.focus, action.aspect) }));
      }
      const k = findIndex(action.target.roundId);
      if (k <= i) return project;
      return relocateAspect(project, i, k, action.aspect, now) ?? project;
    }

    case 'setLock':
      return updateRound(project, action.roundId, (r) => (r.state === 'done' ? r : { ...r, lockOnApprove: [...action.aspects] }));

    case 'setFinalSay':
      return updateRound(project, action.roundId, (r) => {
        if (r.state === 'done') return r;
        if (action.personId === null) return { ...r, finalSayId: null };
        return { ...r, finalSayId: action.personId, reviewerIds: withItem(r.reviewerIds, action.personId) };
      });

    case 'addReviewer':
      return updateRound(project, action.roundId, (r) =>
        r.state === 'done' ? r : { ...r, reviewerIds: withItem(r.reviewerIds, action.personId) },
      );

    case 'addPerson': {
      const next = { ...project, people: [...project.people, action.person] };
      return updateRound(next, action.roundId, (r) =>
        r.state === 'done' ? r : { ...r, reviewerIds: withItem(r.reviewerIds, action.person.id) },
      );
    }

    case 'removeReviewer':
      return updateRound(project, action.roundId, (r) =>
        r.state === 'done'
          ? r
          : {
              ...r,
              reviewerIds: without(r.reviewerIds, action.personId),
              reviewedIds: without(r.reviewedIds, action.personId),
              finalSayId: r.finalSayId === action.personId ? null : r.finalSayId,
            },
      );

    case 'setDeadline':
      return updateRound(project, action.roundId, (r) => (r.state === 'done' ? r : { ...r, closesAfterHours: action.hours }));

    case 'setNudge':
      return updateRound(project, action.roundId, (r) => (r.state === 'done' ? r : { ...r, nudge: action.nudge }));

    case 'setRevisions':
      return updateRound(project, action.roundId, (r) =>
        r.state === 'done' ? r : { ...r, revisionsAllowed: Math.max(r.revisionsUsed, Math.min(6, action.allowed)) },
      );

    case 'setExtraRound':
      return updateRound(project, action.roundId, (r) => (r.state === 'done' ? r : { ...r, extraRound: action.extra }));

    case 'nudgeReviewer': {
      const round = project.rounds[findIndex(action.roundId)];
      if (!round || round.state !== 'live') return project;
      const channel = channelLabel(round.nudge?.channel ?? 'email');
      const next = updateRound(project, round.id, (r) => ({ ...r, nudgedAt: { ...r.nudgedAt, [action.personId]: now } }));
      return log(next, now, `${channel} nudge sent to ${personName(project, action.personId)}`);
    }

    case 'approveRound': {
      const i = findIndex(action.roundId);
      const round = project.rounds[i];
      if (!round || round.state !== 'live') return project;
      const rounds = project.rounds.map((r, idx) => {
        if (idx === i) {
          return {
            ...r,
            state: 'done' as const,
            approvedAt: now,
            approvedById: r.finalSayId,
            decisionNote: action.note.trim() || 'Approved as sent',
          };
        }
        if (idx === i + 1 && r.state === 'upcoming') return { ...r, state: 'live' as const, startedAt: now, reviewedIds: [] };
        return r;
      });
      const locked = round.lockOnApprove.map((a) => aspectLabel(a)).join(' and ');
      let next = log(
        { ...project, rounds },
        now,
        `${personName(project, round.finalSayId)} approved ${roundName(project, round.id)}${locked ? `. ${locked} is locked` : ''}`,
      );
      if (rounds[i + 1]?.state === 'live') next = log(next, now, `${roundName(next, rounds[i + 1].id)} is live`);
      return next;
    }

    case 'requestChanges': {
      const round = project.rounds[findIndex(action.roundId)];
      if (!round || round.state !== 'live' || round.revisionsUsed >= round.revisionsAllowed) return project;
      const next = updateRound(project, round.id, (r) => ({
        ...r,
        revisionsUsed: r.revisionsUsed + 1,
        reviewedIds: [],
        nudgedAt: {},
        startedAt: now,
      }));
      return log(
        next,
        now,
        `${personName(project, round.finalSayId)} asked for changes in ${roundName(project, round.id)}. Revision ${
          round.revisionsUsed + 1
        } of ${round.revisionsAllowed} sent back`,
      );
    }

    case 'buyExtraRound': {
      const round = project.rounds[findIndex(action.roundId)];
      if (!round || round.state === 'done' || !round.extraRound) return project;
      const { days, fee } = round.extraRound;
      const next = updateRound(project, round.id, (r) => ({ ...r, revisionsAllowed: r.revisionsAllowed + 1 }));
      return log(next, now, `Extra round added to ${roundName(project, round.id)}: +${days} days${fee ? `, ${fee}` : ''}`);
    }

    case 'startNextRound': {
      if (project.rounds.some((r) => r.state === 'live')) return project;
      const i = project.rounds.findIndex((r) => r.state === 'upcoming');
      if (i < 0) return project;
      const next = updateRound(project, project.rounds[i].id, (r) => ({ ...r, state: 'live', startedAt: now, reviewedIds: [] }));
      return log(next, now, `New version uploaded. ${roundName(next, project.rounds[i].id)} is live`);
    }

    case 'addComment': {
      const next = { ...project, comments: [...project.comments, action.comment] };
      return log(next, now, `${personName(project, action.comment.authorId)} commented on ${aspectLabel(action.comment.aspect).toLowerCase()}`);
    }

    case 'markReviewed': {
      const round = project.rounds[findIndex(action.roundId)];
      if (!round || round.state !== 'live' || round.reviewedIds.includes(action.personId)) return project;
      const next = updateRound(project, round.id, (r) => ({ ...r, reviewedIds: [...r.reviewedIds, action.personId] }));
      return log(next, now, `${personName(project, action.personId)} finished reviewing ${roundName(project, round.id)}`);
    }

    case 'declineReopen': {
      const comment = project.comments.find((c) => c.id === action.commentId);
      if (!comment) return project;
      const next = {
        ...project,
        comments: project.comments.map((c) => (c.id === comment.id ? { ...c, resolution: 'declined' as const } : c)),
      };
      return log(next, now, `Reopen request on ${aspectLabel(comment.aspect).toLowerCase()} declined`);
    }

    case 'acceptReopen': {
      const comment = project.comments.find((c) => c.id === action.commentId);
      if (!comment) return project;
      const route = routeComment(project, comment);
      if (!route || route.kind !== 'reopen-request') return project;
      const alreadyOpen = aspectStatus(project.rounds, route.surfacesAt, comment.aspect).kind === 'focus';
      const reopened = alreadyOpen ? project : reopenAspect(project, route.surfacesAt, comment.aspect, now);
      if (!reopened) return project;
      return {
        ...reopened,
        comments: reopened.comments.map((c) => (c.id === comment.id ? { ...c, resolution: 'reopened' as const } : c)),
      };
    }
  }
}
