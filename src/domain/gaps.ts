import { ASPECTS, aspectLabel } from './catalog';
import { aspectStatus, routedComments } from './routing';
import { hoursUntilDue } from './time';
import type { Project } from './types';

export type GapSeverity = 'problem' | 'warning';

export interface Gap {
  id: string;
  severity: GapSeverity;
  text: string;
  /** Round to select when the gap is clicked. */
  roundId: string | null;
}

export function roundTitle(index: number): string {
  return `Round ${index + 1}`;
}

export function findGaps(project: Project, now: number): Gap[] {
  const gaps: Gap[] = [];
  const { rounds, people } = project;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';

  if (rounds.length === 0) {
    gaps.push({ id: 'no-rounds', severity: 'problem', text: 'The flow has no rounds yet.', roundId: null });
    return gaps;
  }

  for (const aspect of ASPECTS) {
    const reviewedSomewhere = rounds.some((r) => r.focus.includes(aspect.id));
    if (!reviewedSomewhere) {
      gaps.push({
        id: `never-${aspect.id}`,
        severity: 'problem',
        text: `${aspect.label} is never in focus. Feedback on it has nowhere to go.`,
        roundId: null,
      });
    }
  }

  rounds.forEach((round, i) => {
    const title = roundTitle(i);
    if (round.state === 'done') return;

    if (round.focus.length === 0) {
      gaps.push({ id: `nofocus-${round.id}`, severity: 'problem', text: `${title} has nothing in focus.`, roundId: round.id });
    }
    if (round.reviewerIds.length === 0) {
      gaps.push({ id: `noreviewers-${round.id}`, severity: 'problem', text: `${title} has no reviewers.`, roundId: round.id });
    }
    if (!round.finalSayId) {
      gaps.push({
        id: `nofinal-${round.id}`,
        severity: 'warning',
        text: `${title} has no final say, so anyone can hold it up.`,
        roundId: round.id,
      });
    }
    if (round.closesAfterHours === null) {
      gaps.push({ id: `nodeadline-${round.id}`, severity: 'warning', text: `${title} has no deadline.`, roundId: round.id });
    }

    for (const aspect of ASPECTS) {
      const status = aspectStatus(rounds, i, aspect.id);
      if (status.kind === 'focus' && status.reopenedFrom !== null) {
        gaps.push({
          id: `reopened-${round.id}-${aspect.id}`,
          severity: 'warning',
          text: `${aspect.label} was locked in ${roundTitle(status.reopenedFrom)} and reopens in ${title}.`,
          roundId: round.id,
        });
      }
    }

    if (round.state === 'live') {
      const due = hoursUntilDue(round, now);
      if (due !== null && due < 0) {
        gaps.push({ id: `overdue-${round.id}`, severity: 'problem', text: `${title} is past its deadline.`, roundId: round.id });
      }
      if (round.revisionsUsed >= round.revisionsAllowed && !round.extraRound) {
        gaps.push({
          id: `norevisions-${round.id}`,
          severity: 'warning',
          text: `${title} has no revisions left and no extra round on offer.`,
          roundId: round.id,
        });
      }
      const pending = round.reviewerIds.filter((id) => !round.reviewedIds.includes(id) && id !== round.finalSayId);
      if (pending.length > 0 && !round.nudge) {
        gaps.push({
          id: `nonudge-${round.id}`,
          severity: 'warning',
          text: `${pending.map(nameOf).join(', ')} still ${pending.length === 1 ? 'has' : 'have'} to review and no nudge is set.`,
          roundId: round.id,
        });
      }
    }
  });

  const unrouted = routedComments(project).filter((c) => c.route.kind === 'unrouted');
  if (unrouted.length > 0) {
    const aspects = [...new Set(unrouted.map((c) => aspectLabel(c.comment.aspect).toLowerCase()))];
    gaps.push({
      id: 'unrouted-comments',
      severity: 'problem',
      text: `${unrouted.length} ${unrouted.length === 1 ? 'comment' : 'comments'} on ${aspects.join(', ')} ${
        unrouted.length === 1 ? 'has' : 'have'
      } no round to land in.`,
      roundId: null,
    });
  }

  return gaps;
}
