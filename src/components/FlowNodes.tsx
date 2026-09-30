import { memo } from 'react';
import { aspectLabel, blockLabel, channelLabel, roundKindDef } from '../domain/catalog';
import type { DragPayload } from '../dnd/DragProvider';
import type { FlowNode, FlowNodeType } from '../domain/layout';
import { personName } from '../domain/reducer';
import { roundInbox } from '../domain/routing';
import { dueLabel, shortDate } from '../domain/time';
import type { Project, Round } from '../domain/types';
import { Icon, MoreIcon } from './Icon';
import { MenuButton, type MenuItem } from './Popover';
import { initials, joinList, plural, ROUND_ICON } from './ui';

export function focusSummary(round: Round): string {
  if (round.focus.length === 0) return 'Nothing is in focus yet.';
  return `Only ${joinList(round.focus.map((a) => aspectLabel(a).toLowerCase()))} feedback counts this round.`;
}

export function nodeLabel(project: Project, node: FlowNode): string {
  const index = node.roundId ? project.rounds.findIndex((r) => r.id === node.roundId) : -1;
  const round = index >= 0 ? project.rounds[index] : null;
  if (!round && node.roundId) return 'Round';
  const title = round ? `Round ${index + 1}: ${roundKindDef(round.kind).label}` : '';
  switch (node.type) {
    case 'trigger':
      return 'Trigger: New version uploaded';
    case 'round': {
      const state = round!.state === 'done' ? 'locked' : round!.state === 'live' ? 'live' : 'upcoming';
      return `${title}, ${state}`;
    }
    case 'gate':
      return `${title} final say: ${personName(project, round!.finalSayId)} decides`;
    case 'lock':
      return `${title} on approval: lock ${joinList(round!.lockOnApprove.map((a) => aspectLabel(a).toLowerCase()))}`;
    case 'revise':
      return `${title} revision: revise and resend`;
    case 'end':
      return 'End of flow';
  }
}

function Mono({ children }: { children: string }) {
  return <span className="mono-label">{children}</span>;
}

export function TriggerNodeBody() {
  return (
    <div className="node-row">
      <span className="node-icon node-icon-dark node-icon-sm">
        <Icon name="upload" size={15} strokeWidth={1.9} />
      </span>
      <span className="node-titles">
        <Mono>TRIGGER</Mono>
        <span className="node-title-sm">New version uploaded</span>
      </span>
    </div>
  );
}

interface RoundNodeBodyProps {
  project: Project;
  round: Round;
  index: number;
  now: number;
  isNext: boolean;
}

export function RoundNodeBody({ project, round, index, now, isNext }: RoundNodeBodyProps) {
  const def = roundKindDef(round.kind);
  const header = (badge: React.ReactNode) => (
    <div className="node-row">
      <span className="node-icon">
        <Icon name={ROUND_ICON[round.kind]} size={16} />
      </span>
      <span className="node-titles grow">
        <Mono>{`ROUND ${index + 1}`}</Mono>
        <span className="node-title">{def.label}</span>
      </span>
      {badge}
    </div>
  );

  if (round.state === 'done') {
    const reviewers = round.reviewerIds.slice(0, 4);
    return (
      <>
        {header(
          <span className="badge badge-blue">
            <Icon name="lock" size={12} strokeWidth={2.2} />
            Locked
          </span>,
        )}
        <div className="node-text">{round.decisionNote || 'Approved'}</div>
        <div className="node-foot">
          <span className="avatar-stack">
            {reviewers.map((id) => (
              <span key={id} className="avatar avatar-xs">
                {initials(personName(project, id))}
              </span>
            ))}
          </span>
          <span>
            Approved{round.approvedById ? ` by ${personName(project, round.approvedById)}` : ''}
            {round.approvedAt ? `, ${shortDate(round.approvedAt)}` : ''}
          </span>
        </div>
      </>
    );
  }

  const inbox = roundInbox(project, index);

  if (round.state === 'live') {
    const reviewed = round.reviewedIds.filter((id) => round.reviewerIds.includes(id)).length;
    const due = dueLabel(round, now);
    return (
      <>
        {header(
          <span className="badge badge-green">
            <span className="dot" />
            Live
          </span>,
        )}
        <div className="node-text">{focusSummary(round)}</div>
        <div className="chip-row">
          <span className="chip">
            <Icon name="checkCircle" size={14} strokeWidth={1.9} />
            {reviewed} of {round.reviewerIds.length} reviewed
          </span>
          {due && (
            <span className={`chip${due.startsWith('Overdue') ? ' chip-warn' : ''}`}>
              <Icon name="clock" size={14} strokeWidth={1.9} />
              {due}
            </span>
          )}
          {inbox.parkedOut > 0 && (
            <span className="chip">
              <Icon name="inbox" size={14} strokeWidth={1.9} />
              {inbox.parkedOut} parked
            </span>
          )}
        </div>
      </>
    );
  }

  const rows = [
    ...inbox.parkedIn.map((p) => (
      <span key={`p${p.fromIndex}`} className="row-chip">
        <Icon name="inbox" size={14} strokeWidth={1.9} />
        {plural(p.count, 'comment')} parked from Round {p.fromIndex + 1}
      </span>
    )),
    ...inbox.reopenRequests.map((r) => (
      <span key={`r${r.aspect}`} className="row-chip row-chip-warn">
        <Icon name="lock" size={14} strokeWidth={2} />
        {plural(r.count, 'reopen request')}: {aspectLabel(r.aspect).toLowerCase()}
      </span>
    )),
  ];

  return (
    <>
      {header(<span className="badge badge-gray">{isNext ? 'Up next' : 'Queued'}</span>)}
      <div className="row-stack">
        {rows.length > 0 ? (
          rows
        ) : (
          <span className="row-chip row-chip-muted">
            {round.focus.length > 0
              ? `Reviewers comment on ${joinList(round.focus.map((a) => aspectLabel(a).toLowerCase()))}`
              : 'Nothing in focus yet'}
          </span>
        )}
      </div>
    </>
  );
}

export function GateNodeBody({ project, round }: { project: Project; round: Round }) {
  return (
    <div className="node-row">
      <span className="node-icon node-icon-round node-icon-sm">
        <Icon name="branch" size={15} />
      </span>
      <span className="node-titles">
        <Mono>FINAL SAY</Mono>
        <span className="node-title-sm">{personName(project, round.finalSayId)} decides</span>
      </span>
    </div>
  );
}

export function LockNodeBody({ round }: { round: Round }) {
  return (
    <div className="node-row">
      <span className="node-icon node-icon-blue">
        <Icon name="lock" size={16} strokeWidth={1.9} />
      </span>
      <span className="node-titles">
        <span className="node-title-sm strong">Lock {joinList(round.lockOnApprove.map((a) => aspectLabel(a).toLowerCase()))}</span>
        <span className="node-sub">Reopening it costs a round</span>
      </span>
    </div>
  );
}

export function ReviseNodeBody({ round, index }: { round: Round; index: number }) {
  const left = round.revisionsAllowed - round.revisionsUsed;
  return (
    <>
      <div className="node-row">
        <span className="node-icon">
          <Icon name="refresh" size={16} />
        </span>
        <span className="node-titles">
          <Mono>REVISION</Mono>
          <span className="node-title">Revise and resend</span>
        </span>
      </div>
      <div className={`node-text${left <= 0 ? ' text-warn' : ''}`}>
        {left > 0
          ? `${left} of ${round.revisionsAllowed} ${round.revisionsAllowed === 1 ? 'revision' : 'revisions'} left`
          : round.extraRound
            ? 'No revisions left. Extra round on offer'
            : 'No revisions left'}
      </div>
      <span className="tag-chip">
        <Icon name="returnArrow" size={13} strokeWidth={2} />
        Back to Round {index + 1}
      </span>
    </>
  );
}

export function EndNodeBody() {
  return (
    <div className="node-row">
      <span className="node-icon node-icon-round node-icon-sm">
        <Icon name="flag" size={15} />
      </span>
      <span className="node-titles">
        <Mono>END</Mono>
        <span className="node-title-sm">Files signed off</span>
      </span>
    </div>
  );
}

interface RoundMenuProps {
  project: Project;
  round: Round;
  index: number;
  onApprove: (roundId: string) => void;
  onRequestChanges: (roundId: string) => void;
  onMove: (roundId: string, delta: -1 | 1) => void;
  onRemove: (roundId: string) => void;
}

export function RoundMenu({ project, round, index, onApprove, onRequestChanges, onMove, onRemove }: RoundMenuProps) {
  const title = `Round ${index + 1}`;
  let items: MenuItem[];
  if (round.state === 'live') {
    const left = round.revisionsAllowed - round.revisionsUsed;
    items = [
      { key: 'approve', label: 'Record approval', icon: 'check', onSelect: () => onApprove(round.id) },
      {
        key: 'changes',
        label: 'Request changes',
        hint: left > 0 ? `${plural(left, 'revision')} left` : 'No revisions left',
        icon: 'pen',
        disabled: left <= 0,
        onSelect: () => onRequestChanges(round.id),
      },
    ];
  } else {
    const prev = project.rounds[index - 1];
    const next = project.rounds[index + 1];
    items = [
      { key: 'up', label: 'Move up', icon: 'arrowUp', disabled: !prev || prev.state !== 'upcoming', onSelect: () => onMove(round.id, -1) },
      { key: 'down', label: 'Move down', icon: 'arrowDown', disabled: !next, onSelect: () => onMove(round.id, 1) },
      { key: 'sep', separator: true },
      { key: 'remove', label: 'Remove round', icon: 'trash', danger: true, onSelect: () => onRemove(round.id) },
    ];
  }
  return (
    <span className="node-more" data-no-drag>
      <MenuButton label={`More options for ${title}`} className="icon-btn icon-btn-sm" items={items} placement="bottom-end" width={220}>
        <MoreIcon />
      </MenuButton>
    </span>
  );
}

interface NodeBodyProps {
  type: FlowNodeType;
  project: Project;
  round: Round | null;
  index: number | null;
  now: number;
  isNext: boolean;
}

/** Node contents only re-render when their data changes, not on every animation frame. */
export const NodeBody = memo(function NodeBody({ type, project, round, index, now, isNext }: NodeBodyProps) {
  switch (type) {
    case 'trigger':
      return <TriggerNodeBody />;
    case 'round':
      return <RoundNodeBody project={project} round={round!} index={index!} now={now} isNext={isNext} />;
    case 'gate':
      return <GateNodeBody project={project} round={round!} />;
    case 'lock':
      return <LockNodeBody round={round!} />;
    case 'revise':
      return <ReviseNodeBody round={round!} index={index!} />;
    case 'end':
      return <EndNodeBody />;
  }
});

/** What dropping the dragged thing on this node would do, or null if it can't land here. */
export function dropHint(payload: DragPayload, type: FlowNodeType, project: Project, round: Round | null): string | null {
  if (!round || round.state === 'done') return null;
  switch (payload.kind) {
    case 'block': {
      if (payload.block.type === 'round') return null;
      if (payload.block.type === 'nudge') {
        return round.nudge?.channel === payload.block.channel ? null : `Nudge on ${channelLabel(payload.block.channel)}`;
      }
      const rule = payload.block.rule;
      if (rule === 'final-say' && round.finalSayId) return null;
      if (rule === 'lock-layer' && (round.lockOnApprove.length > 0 || round.focus.length === 0)) return null;
      if (rule === 'deadline' && round.closesAfterHours !== null) return null;
      if (rule === 'extra-round' && round.extraRound) return null;
      return `Add ${blockLabel(payload.block).toLowerCase()}`;
    }
    case 'person': {
      const name = personName(project, payload.personId);
      if (type === 'gate') return round.finalSayId === payload.personId ? null : `Make ${name} the final say`;
      return round.reviewerIds.includes(payload.personId) ? null : `Add ${name} as reviewer`;
    }
    case 'aspect': {
      if (payload.fromRoundId === round.id && round.focus.includes(payload.aspect)) return null;
      const label = aspectLabel(payload.aspect).toLowerCase();
      return payload.fromRoundId === round.id ? `Bring ${label} into focus` : `Review ${label} here`;
    }
    default:
      return null;
  }
}
