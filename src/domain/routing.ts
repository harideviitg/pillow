import { ASPECTS } from './catalog';
import type { AspectId, Comment, Project, Round } from './types';

/**
 * Where an aspect stands for a given round. Everything is derived from the
 * rounds' focus and lock rules, so changing the flow reroutes feedback live.
 */
export type AspectStatus =
  | { kind: 'focus'; reopenedFrom: number | null }
  | { kind: 'locked'; roundIndex: number }
  | { kind: 'parked'; roundIndex: number }
  | { kind: 'unscheduled' };

export function aspectStatus(rounds: Round[], roundIndex: number, aspect: AspectId): AspectStatus {
  let lockedAt = -1;
  for (let j = 0; j < roundIndex; j++) {
    if (rounds[j].lockOnApprove.includes(aspect)) lockedAt = j;
    // Reopened and reviewed again later without a new lock: no longer locked.
    else if (lockedAt >= 0 && rounds[j].focus.includes(aspect)) lockedAt = -1;
  }

  if (rounds[roundIndex].focus.includes(aspect)) {
    return { kind: 'focus', reopenedFrom: lockedAt >= 0 ? lockedAt : null };
  }
  if (lockedAt >= 0) return { kind: 'locked', roundIndex: lockedAt };

  for (let k = roundIndex + 1; k < rounds.length; k++) {
    if (rounds[k].focus.includes(aspect)) return { kind: 'parked', roundIndex: k };
  }
  return { kind: 'unscheduled' };
}

export function aspectStatuses(rounds: Round[], roundIndex: number) {
  return ASPECTS.map((a) => ({ aspect: a.id, status: aspectStatus(rounds, roundIndex, a.id) }));
}

/** Where a piece of feedback ends up once the flow's rules are applied. */
export type CommentRoute =
  | { kind: 'counts'; roundIndex: number }
  | { kind: 'parked'; fromIndex: number; toIndex: number }
  | { kind: 'reopen-request'; fromIndex: number; lockedIndex: number; surfacesAt: number }
  | { kind: 'unrouted'; fromIndex: number }
  | { kind: 'declined'; fromIndex: number }
  | { kind: 'reopened'; fromIndex: number };

export function routeComment(project: Project, comment: Comment): CommentRoute | null {
  const fromIndex = project.rounds.findIndex((r) => r.id === comment.roundId);
  if (fromIndex < 0) return null;
  if (comment.resolution === 'declined') return { kind: 'declined', fromIndex };
  if (comment.resolution === 'reopened') return { kind: 'reopened', fromIndex };

  const status = aspectStatus(project.rounds, fromIndex, comment.aspect);
  switch (status.kind) {
    case 'focus':
      return { kind: 'counts', roundIndex: fromIndex };
    case 'parked':
      return { kind: 'parked', fromIndex, toIndex: status.roundIndex };
    case 'locked':
      return { kind: 'reopen-request', fromIndex, lockedIndex: status.roundIndex, surfacesAt: reopenBoundary(project, fromIndex) };
    case 'unscheduled':
      return { kind: 'unrouted', fromIndex };
  }
}

/** A reopen request is weighed at the next round that hasn't run yet. */
function reopenBoundary(project: Project, fromIndex: number): number {
  for (let k = fromIndex + 1; k < project.rounds.length; k++) {
    if (project.rounds[k].state !== 'done') return k;
  }
  return Math.min(fromIndex + 1, project.rounds.length - 1);
}

export interface RoutedComment {
  comment: Comment;
  route: CommentRoute;
}

export function routedComments(project: Project): RoutedComment[] {
  const out: RoutedComment[] = [];
  for (const comment of project.comments) {
    const route = routeComment(project, comment);
    if (route) out.push({ comment, route });
  }
  return out;
}

export interface RoundInbox {
  /** Comments posted in this round that were parked for later rounds. */
  parkedOut: number;
  /** Comments parked into this round, grouped by the round they came from. */
  parkedIn: { fromIndex: number; count: number }[];
  /** Reopen requests waiting on this round's boundary, grouped by aspect. */
  reopenRequests: { aspect: AspectId; count: number }[];
}

export function roundInbox(project: Project, roundIndex: number): RoundInbox {
  let parkedOut = 0;
  const parkedIn = new Map<number, number>();
  const reopen = new Map<AspectId, number>();
  for (const { comment, route } of routedComments(project)) {
    if (route.kind === 'parked') {
      if (route.fromIndex === roundIndex) parkedOut++;
      if (route.toIndex === roundIndex) parkedIn.set(route.fromIndex, (parkedIn.get(route.fromIndex) ?? 0) + 1);
    } else if (route.kind === 'reopen-request' && route.surfacesAt === roundIndex) {
      reopen.set(comment.aspect, (reopen.get(comment.aspect) ?? 0) + 1);
    }
  }
  return {
    parkedOut,
    parkedIn: [...parkedIn.entries()].sort((a, b) => a[0] - b[0]).map(([fromIndex, count]) => ({ fromIndex, count })),
    reopenRequests: [...reopen.entries()].map(([aspect, count]) => ({ aspect, count })),
  };
}

export function liveRoundIndex(rounds: Round[]): number {
  return rounds.findIndex((r) => r.state === 'live');
}

/** Rounds can only be inserted after everything that already ran or is running. */
export function firstEditableIndex(rounds: Round[]): number {
  let last = -1;
  rounds.forEach((r, i) => {
    if (r.state !== 'upcoming') last = i;
  });
  return last + 1;
}
