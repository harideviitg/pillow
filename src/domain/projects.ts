import { DEFAULT_DEADLINE_HOURS, DEFAULT_REVISIONS, ROUND_KINDS } from './catalog';
import type { Project } from './types';

export function blankProject(id: string, client: string, name: string, now: number): Project {
  return {
    id,
    client,
    name,
    people: [],
    rounds: ROUND_KINDS.map((def, i) => ({
      id: `${id}-r${i + 1}`,
      kind: def.kind,
      state: 'upcoming',
      focus: [...def.focus],
      lockOnApprove: [...def.lockOnApprove],
      reviewerIds: [],
      finalSayId: null,
      reviewedIds: [],
      closesAfterHours: DEFAULT_DEADLINE_HOURS,
      nudge: null,
      revisionsAllowed: DEFAULT_REVISIONS,
      revisionsUsed: 0,
      extraRound: null,
      startedAt: null,
      approvedAt: null,
      approvedById: null,
      decisionNote: '',
      nudgedAt: {},
    })),
    comments: [],
    activity: [{ id: `${id}-created`, at: now, text: `Project created for ${client}` }],
  };
}
