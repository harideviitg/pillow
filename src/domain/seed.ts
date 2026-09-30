import { DAY, HOUR } from './time';
import type { Comment, Project, Round } from './types';

const baseRound = {
  reviewerIds: ['anika', 'dev', 'meera'],
  finalSayId: 'anika',
  reviewedIds: [],
  closesAfterHours: 48,
  nudge: { channel: 'whatsapp' as const, afterHours: 24 },
  revisionsAllowed: 2,
  revisionsUsed: 0,
  extraRound: { days: 2, fee: '' },
  startedAt: null,
  approvedAt: null,
  approvedById: null,
  decisionNote: '',
  nudgedAt: {},
};

/** The sample project the design shows: a menu poster midway through its layout round. */
export function sampleProject(now: number): Project {
  const rounds: Round[] = [
    {
      ...baseRound,
      id: 'r-direction',
      kind: 'direction',
      state: 'done',
      focus: ['color'],
      lockOnApprove: ['color'],
      reviewedIds: ['anika', 'dev', 'meera'],
      startedAt: now - 21 * DAY,
      approvedAt: now - 18 * DAY,
      approvedById: 'anika',
      decisionNote: 'Picked B: warm type, full-bleed photo',
    },
    {
      ...baseRound,
      id: 'r-layout',
      kind: 'layout',
      state: 'live',
      focus: ['layout'],
      lockOnApprove: ['layout'],
      reviewedIds: ['anika', 'dev'],
      revisionsUsed: 1,
      startedAt: now - 30 * HOUR,
    },
    { ...baseRound, id: 'r-copy', kind: 'copy', state: 'upcoming', focus: ['copy'], lockOnApprove: ['copy'] },
    { ...baseRound, id: 'r-polish', kind: 'polish', state: 'upcoming', focus: ['imagery'], lockOnApprove: ['imagery'] },
  ];

  const comment = (id: string, authorId: string, aspect: Comment['aspect'], text: string, hoursAgo: number): Comment => ({
    id,
    authorId,
    roundId: 'r-layout',
    aspect,
    text,
    createdAt: now - hoursAgo * HOUR,
    resolution: 'open',
  });

  return {
    id: 'monsoon-menu',
    client: 'Kettle & Co',
    name: 'Monsoon menu poster',
    people: [
      { id: 'anika', name: 'Anika', role: 'Brand head', timezone: 'Asia/Kolkata' },
      { id: 'dev', name: 'Dev', role: 'Marketing', timezone: 'Asia/Kolkata' },
      { id: 'meera', name: 'Meera', role: 'Founder', timezone: 'Europe/London' },
    ],
    rounds,
    comments: [
      comment('c1', 'dev', 'layout', 'The price column sits too far from the dish names.', 22),
      comment('c2', 'dev', 'copy', '"Monsoon specials" reads better than "Rainy day menu".', 21),
      comment('c3', 'dev', 'copy', 'Add a veg or non-veg marker next to each dish.', 21),
      comment('c4', 'dev', 'color', 'Could the green be a shade darker?', 20),
      comment('c5', 'anika', 'layout', 'Give the hero photo more room at the top.', 7),
      comment('c6', 'anika', 'copy', 'The masala chai description is too long.', 7),
      comment('c7', 'anika', 'copy', 'The tagline needs a second pass.', 6),
    ],
    activity: [
      { id: 'a6', at: now - 6 * HOUR, text: 'WhatsApp nudge sent to Meera' },
      { id: 'a5', at: now - 6 * HOUR, text: 'Anika finished reviewing Round 2: Layout' },
      { id: 'a4', at: now - 20 * HOUR, text: 'Dev finished reviewing Round 2: Layout' },
      { id: 'a3', at: now - 30 * HOUR, text: 'Revised version uploaded. Round 2: Layout restarted' },
      { id: 'a2', at: now - 40 * HOUR, text: 'Anika asked for changes in Round 2: Layout' },
      { id: 'a1', at: now - 18 * DAY, text: 'Anika approved Round 1: Direction. Color is locked' },
    ],
  };
}
