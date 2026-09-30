export type AspectId = 'layout' | 'copy' | 'imagery' | 'color';
export type RoundKind = 'direction' | 'layout' | 'copy' | 'polish';
export type RoundState = 'done' | 'live' | 'upcoming';
export type NudgeChannel = 'email' | 'whatsapp';

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface Nudge {
  channel: NudgeChannel;
  afterHours: number;
}

export interface ExtraRound {
  days: number;
  /** Free text so studios can write it in their own currency, e.g. "₹8,000". */
  fee: string;
}

export interface Round {
  id: string;
  kind: RoundKind;
  state: RoundState;
  /** Aspects reviewers can comment on in this round. */
  focus: AspectId[];
  /** Lock layer rule: aspects that lock once this round is approved. */
  lockOnApprove: AspectId[];
  reviewerIds: string[];
  /** Final say rule: the one person whose decision closes the round. */
  finalSayId: string | null;
  /** Reviewers who have finished reviewing the current version. */
  reviewedIds: string[];
  /** Deadline rule. */
  closesAfterHours: number | null;
  nudge: Nudge | null;
  revisionsAllowed: number;
  revisionsUsed: number;
  extraRound: ExtraRound | null;
  startedAt: number | null;
  approvedAt: number | null;
  approvedById: string | null;
  decisionNote: string;
  /** Last manual nudge per reviewer id. */
  nudgedAt: Record<string, number>;
}

export type CommentResolution = 'open' | 'declined' | 'reopened';

export interface Comment {
  id: string;
  authorId: string;
  /** The round the comment was posted in. */
  roundId: string;
  aspect: AspectId;
  text: string;
  createdAt: number;
  resolution: CommentResolution;
}

export interface ActivityEntry {
  id: string;
  at: number;
  text: string;
}

export interface Project {
  id: string;
  client: string;
  name: string;
  people: Person[];
  rounds: Round[];
  comments: Comment[];
  activity: ActivityEntry[];
}

export interface AppData {
  version: 1;
  projects: Project[];
  activeProjectId: string;
}
