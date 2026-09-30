import { useId, type ReactNode } from 'react';
import {
  ASPECTS,
  aspectLabel,
  channelLabel,
  DEADLINE_OPTIONS,
  hoursLabel,
  NUDGE_HOUR_OPTIONS,
  roundKindDef,
  type Block,
} from '../domain/catalog';
import { canReopen, personName } from '../domain/reducer';
import { aspectStatus, type AspectStatus } from '../domain/routing';
import { closesLabel, relativeTime, shortDate } from '../domain/time';
import type { AspectId, NudgeChannel, Project, Round } from '../domain/types';
import { useStore } from '../state/store';
import { formatDayLong, formatTime } from '../domain/calendar';
import { useDraggable } from '../dnd/DragProvider';
import { PersonGhost } from './BlocksPanel';
import { ExtraRoundEditor } from './ExtraRoundEditor';
import { focusSummary } from './FlowNodes';
import { GripIcon, Icon, MoreIcon, type IconName } from './Icon';
import { MenuButton, type MenuItem } from './Popover';
import type { NodeSelection } from './selection';
import { ASPECT_ICON, initials, joinList, plural, ROUND_ICON, RULE_ICON } from './ui';

interface InspectorProps {
  selection: NodeSelection | null;
  now: number;
  onClose: () => void;
  onSelect: (sel: NodeSelection) => void;
  onApprove: (roundId: string) => void;
  onAddPerson: (roundId: string) => void;
  onApplyBlock: (roundId: string, block: Block) => void;
  onScheduleMeeting: (roundId: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  open: boolean;
}

export function Inspector(props: InspectorProps) {
  const { project } = useStore();
  const { selection, open } = props;
  const index = selection && selection.type !== 'trigger' ? project.rounds.findIndex((r) => r.id === selection.roundId) : -1;
  const round = index >= 0 ? project.rounds[index] : null;

  let content: ReactNode;
  let label = 'Settings';
  if (selection?.type === 'trigger') {
    label = 'Trigger settings';
    content = <TriggerInspector {...props} />;
  } else if (round && selection) {
    label = `Round ${index + 1} settings`;
    const common = { ...props, project, round, index };
    if (selection.type === 'round') content = <RoundInspector {...common} />;
    else if (selection.type === 'gate') content = <GateInspector {...common} />;
    else if (selection.type === 'lock') content = <LockInspector {...common} />;
    else content = <ReviseInspector {...common} />;
  } else {
    content = (
      <div className="inspector-empty">
        <p>Select a round or rule on the canvas to edit it.</p>
      </div>
    );
  }

  return (
    <aside className={`inspector${open ? ' is-open' : ''}`} aria-label={label}>
      <div key={selection ? `${selection.type}:${'roundId' in selection ? selection.roundId : ''}` : 'none'} className="insp-swap">
        {content}
      </div>
    </aside>
  );
}

function InspectorHead({ icon, eyebrow, title, onClose, dark }: { icon: IconName; eyebrow: string; title: string; onClose: () => void; dark?: boolean }) {
  return (
    <div className="insp-head">
      <span className={`node-icon node-icon-lg${dark ? ' node-icon-dark' : ''}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="node-titles grow">
        <span className="mono-label">{eyebrow}</span>
        <h2 className="insp-title">{title}</h2>
      </span>
      <button type="button" className="icon-btn icon-btn-md" aria-label="Close panel" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function Section({ title, sub, aside, children }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="insp-section" aria-labelledby={id}>
      <div className="insp-section-head">
        <span className="insp-section-titles">
          <h3 id={id}>{title}</h3>
          {sub && <span className="insp-sub">{sub}</span>}
        </span>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      {children}
    </div>
  );
}

interface RoundProps extends InspectorProps {
  project: Project;
  round: Round;
  index: number;
}

function statusLine(project: Project, round: Round, index: number, now: number) {
  if (round.state === 'done') {
    return {
      pill: (
        <span className="badge badge-blue">
          <Icon name="lock" size={12} strokeWidth={2.2} />
          Locked
        </span>
      ),
      text: `Approved${round.approvedById ? ` by ${personName(project, round.approvedById)}` : ''}${
        round.approvedAt ? `, ${shortDate(round.approvedAt)}` : ''
      }`,
    };
  }
  if (round.state === 'live') {
    return {
      pill: (
        <span className="badge badge-green">
          <span className="dot" />
          Live
        </span>
      ),
      text: closesLabel(round, now) ?? 'No deadline',
    };
  }
  const prevLive = project.rounds.findIndex((r) => r.state !== 'done');
  return {
    pill: <span className="badge badge-gray">Upcoming</span>,
    text: index > 0 && prevLive >= 0 && prevLive < index ? `Starts after Round ${index}` : 'Starts with the next upload',
  };
}

function aspectButton(status: AspectStatus): { text: string; tone: string; icon?: IconName } {
  switch (status.kind) {
    case 'focus':
      return status.reopenedFrom === null ? { text: 'In focus', tone: 'green' } : { text: 'Reopened here', tone: 'orange' };
    case 'parked':
      return { text: `Parked for Round ${status.roundIndex + 1}`, tone: 'gray' };
    case 'locked':
      return { text: `Locked in Round ${status.roundIndex + 1}`, tone: 'blue', icon: 'lock' };
    case 'unscheduled':
      return { text: 'Not scheduled', tone: 'orange', icon: 'alert' };
  }
}

function AspectRow({ project, round, index, aspect }: { project: Project; round: Round; index: number; aspect: AspectId }) {
  const { dispatch } = useStore();
  const status = aspectStatus(project.rounds, index, aspect);
  const view = aspectButton(status);
  const label = aspectLabel(aspect);
  const content = (
    <>
      {view.icon && <Icon name={view.icon} size={12} strokeWidth={2.2} />}
      {view.text}
    </>
  );

  const items: MenuItem[] = [];
  if (status.kind === 'locked') {
    items.push({ key: 'locked', label: view.text, checked: true, onSelect: () => {} });
    items.push({
      key: 'reopen',
      label: 'Reopen in this round',
      hint: canReopen(round) ? 'Uses one of this round’s revisions' : 'No revisions left in this round',
      checked: false,
      disabled: !canReopen(round),
      onSelect: () => dispatch({ type: 'setAspect', roundId: round.id, aspect, target: { kind: 'focus' } }),
    });
  } else {
    items.push({
      key: 'focus',
      label: 'In focus',
      hint: 'Feedback counts this round',
      checked: status.kind === 'focus',
      onSelect: () => dispatch({ type: 'setAspect', roundId: round.id, aspect, target: { kind: 'focus' } }),
    });
  }
  project.rounds.forEach((later, k) => {
    if (k <= index) return;
    items.push({
      key: later.id,
      label: `Parked for Round ${k + 1}`,
      hint: roundKindDef(later.kind).label,
      checked: status.kind === 'parked' && status.roundIndex === k,
      onSelect: () => dispatch({ type: 'setAspect', roundId: round.id, aspect, target: { kind: 'parked', roundId: later.id } }),
    });
  });

  const drag = useDraggable(round.state === 'done' ? null : { kind: 'aspect', aspect, fromRoundId: round.id }, {
    anchor: 'cursor',
    ghost: () => (
      <div className="ghost-chip">
        <span className="block-icon">
          <Icon name={ASPECT_ICON[aspect]} size={16} />
        </span>
        <span className="ghost-text">
          <span className="ghost-title">{label}</span>
          <span className="ghost-sub">Drop on the round that should review it</span>
        </span>
      </div>
    ),
  });

  return (
    <div className={`aspect-row${round.state !== 'done' ? ' is-draggable' : ''}`} {...drag}>
      {round.state !== 'done' && (
        <span className="row-grip" aria-hidden="true">
          <GripIcon />
        </span>
      )}
      <span className="node-icon node-icon-sm">
        <Icon name={ASPECT_ICON[aspect]} size={15} />
      </span>
      <span className="aspect-name">{label}</span>
      {round.state === 'done' ? (
        <span className={`status-btn tone-${view.tone} is-static`}>{content}</span>
      ) : (
        <span data-no-drag>
          <MenuButton label={`${label} feedback: ${view.text}, change`} className={`status-btn tone-${view.tone}`} items={items} width={250}>
            {content}
            <Icon name="chevronDown" size={12} strokeWidth={2.2} />
          </MenuButton>
        </span>
      )}
    </div>
  );
}

function ReviewerRow({ project, round, personId, now }: { project: Project; round: Round; personId: string; now: number }) {
  const { dispatch } = useStore();
  const person = project.people.find((p) => p.id === personId);
  const drag = useDraggable(person ? { kind: 'person', personId } : null, { ghost: () => (person ? <PersonGhost person={person} /> : null), anchor: 'cursor' });
  if (!person) return null;
  const isFinal = round.finalSayId === personId;
  const reviewed = round.reviewedIds.includes(personId);
  const pending = round.state === 'live' && !reviewed;
  const nudgedAt = round.nudgedAt[personId];
  const recentlyNudged = nudgedAt !== undefined && now - nudgedAt < 60 * 60 * 1000;

  let trailing: ReactNode = null;
  if (isFinal) trailing = <span className="badge badge-dark">Final say</span>;
  else if (round.state === 'live' && reviewed)
    trailing = (
      <span className="reviewed">
        <Icon name="check" size={14} strokeWidth={2.2} />
        Reviewed
      </span>
    );
  else if (pending)
    trailing = (
      <button
        type="button"
        className="btn btn-sm btn-outline"
        aria-label={recentlyNudged ? `${person.name} was nudged ${relativeTime(nudgedAt, now)}` : `Nudge ${person.name}`}
        disabled={recentlyNudged}
        onClick={() => dispatch({ type: 'nudgeReviewer', roundId: round.id, personId })}
      >
        {recentlyNudged ? 'Nudged' : 'Nudge'}
      </button>
    );

  const items: MenuItem[] = [
    {
      key: 'final',
      label: isFinal ? 'Remove final say' : 'Give final say',
      icon: 'branch',
      onSelect: () => dispatch({ type: 'setFinalSay', roundId: round.id, personId: isFinal ? null : personId }),
    },
  ];
  if (pending) {
    items.push({
      key: 'reviewed',
      label: 'Mark as reviewed',
      icon: 'check',
      onSelect: () => dispatch({ type: 'markReviewed', roundId: round.id, personId }),
    });
  }
  items.push({ key: 'sep', separator: true });
  items.push({
    key: 'remove',
    label: 'Remove from round',
    icon: 'trash',
    danger: true,
    onSelect: () => dispatch({ type: 'removeReviewer', roundId: round.id, personId }),
  });

  return (
    <li className="reviewer-row is-draggable" {...drag}>
      <span className="avatar" aria-hidden="true">
        {initials(person.name)}
      </span>
      <span className="reviewer-names">
        <span className="reviewer-name">{person.name}</span>
        <span className="reviewer-role">
          {person.role}
          {pending && isFinal ? ', deciding' : pending ? ', pending' : ''}
        </span>
      </span>
      <span className="reviewer-trailing" data-no-drag>
        {trailing}
        {round.state !== 'done' && (
          <MenuButton label={`More options for ${person.name}`} className="icon-btn icon-btn-sm muted" items={items} width={210}>
            <MoreIcon />
          </MenuButton>
        )}
      </span>
    </li>
  );
}

function RoundInspector({ project, round, index, now, onClose, onAddPerson, onApplyBlock, onScheduleMeeting, onOpenMeeting }: RoundProps) {
  const { dispatch, data } = useStore();
  const meetings = data.meetings.filter((m) => m.roundId === round.id).sort((a, b) => a.start - b.start);
  const def = roundKindDef(round.kind);
  const status = statusLine(project, round, index, now);
  const editable = round.state !== 'done';
  const others = project.people.filter((p) => !round.reviewerIds.includes(p.id));

  const deadlineItems: MenuItem[] = [
    { key: 'none', label: 'No deadline', checked: round.closesAfterHours === null, onSelect: () => dispatch({ type: 'setDeadline', roundId: round.id, hours: null }) },
    ...DEADLINE_OPTIONS.map((h) => ({
      key: String(h),
      label: hoursLabel(h),
      checked: round.closesAfterHours === h,
      onSelect: () => dispatch({ type: 'setDeadline', roundId: round.id, hours: h }),
    })),
  ];

  const nudgeText = round.nudge ? `After ${round.nudge.afterHours}h, ${channelLabel(round.nudge.channel)}` : 'Off';
  const nudgeItems: MenuItem[] = [
    { key: 'off', label: 'Off', checked: round.nudge === null, onSelect: () => dispatch({ type: 'setNudge', roundId: round.id, nudge: null }) },
    ...NUDGE_HOUR_OPTIONS.flatMap((h) =>
      (['email', 'whatsapp'] as NudgeChannel[]).map((channel) => ({
        key: `${h}-${channel}`,
        label: `After ${h}h, ${channelLabel(channel)}`,
        checked: round.nudge?.afterHours === h && round.nudge.channel === channel,
        onSelect: () => dispatch({ type: 'setNudge', roundId: round.id, nudge: { afterHours: h, channel } }),
      })),
    ),
  ];

  const missing: { block: Block; label: string; icon: IconName }[] = [];
  if (editable && !round.finalSayId) missing.push({ block: { type: 'rule', rule: 'final-say' }, label: 'Final say', icon: RULE_ICON['final-say'] });
  if (editable && round.lockOnApprove.length === 0 && round.focus.length > 0)
    missing.push({ block: { type: 'rule', rule: 'lock-layer' }, label: 'Lock layer', icon: RULE_ICON['lock-layer'] });

  return (
    <div className="insp">
      <div className="insp-top">
        <InspectorHead icon={ROUND_ICON[round.kind]} eyebrow={`ROUND ${index + 1}`} title={def.label} onClose={onClose} />
        <div className="insp-status">
          {status.pill}
          <span className="insp-status-text">{status.text}</span>
        </div>
        {round.state === 'done' && round.decisionNote && <p className="insp-note">{round.decisionNote}</p>}
      </div>

      <Section title="What reviewers can comment on" sub="Everything else waits or stays locked. Nothing gets lost.">
        <div className="aspect-list">
          {ASPECTS.map((a) => (
            <AspectRow key={a.id} project={project} round={round} index={index} aspect={a.id} />
          ))}
        </div>
        {round.state !== 'done' && <p className="insp-sub">{focusSummary(round)}</p>}
      </Section>

      <Section title="Reviewers">
        {round.reviewerIds.length === 0 ? (
          <p className="insp-sub">Nobody reviews this round yet.</p>
        ) : (
          <ul className="reviewer-list">
            {round.reviewerIds.map((id) => (
              <ReviewerRow key={id} project={project} round={round} personId={id} now={now} />
            ))}
          </ul>
        )}
        {editable && (
          <MenuButton
            label="Add reviewer"
            className="btn btn-sm btn-ghost add-btn"
            placement="bottom-start"
            width={240}
            items={[
              ...others.map((p) => ({
                key: p.id,
                label: p.name,
                hint: p.role,
                onSelect: () => dispatch({ type: 'addReviewer', roundId: round.id, personId: p.id }),
              })),
              ...(others.length > 0 ? [{ key: 'sep', separator: true as const }] : []),
              { key: 'new', label: 'Someone new', icon: 'userPlus' as IconName, onSelect: () => onAddPerson(round.id) },
            ]}
          >
            <Icon name="plus" size={14} strokeWidth={2} />
            Add reviewer
          </MenuButton>
        )}
      </Section>

      <Section title="Timing">
        <div className="setting-list">
          <SettingRow label="Round closes after">
            {editable ? (
              <MenuButton
                label={`Round closes after: ${round.closesAfterHours === null ? 'no deadline' : hoursLabel(round.closesAfterHours)}, change`}
                className="value-btn"
                items={deadlineItems}
                width={200}
              >
                {round.closesAfterHours === null ? 'No deadline' : hoursLabel(round.closesAfterHours)}
                <Icon name="chevronDown" size={12} strokeWidth={2.2} />
              </MenuButton>
            ) : (
              <span className="setting-value">{round.closesAfterHours === null ? 'No deadline' : hoursLabel(round.closesAfterHours)}</span>
            )}
          </SettingRow>
          <SettingRow label="Nudge if no reply">
            {editable ? (
              <MenuButton label={`Nudge if no reply: ${nudgeText}, change`} className="value-btn" items={nudgeItems} width={220}>
                {nudgeText}
                <Icon name="chevronDown" size={12} strokeWidth={2.2} />
              </MenuButton>
            ) : (
              <span className="setting-value">{nudgeText}</span>
            )}
          </SettingRow>
        </div>
      </Section>

      <RevisionSection round={round} />

      <Section title="Meetings" sub={meetings.length === 0 ? 'Nothing on the calendar for this round yet.' : undefined}>
        {meetings.length > 0 && (
          <ul className="meeting-links">
            {meetings.map((m) => (
              <li key={m.id}>
                <button type="button" className={`meeting-link kind-${m.kind}${m.end < now ? ' is-past' : ''}`} onClick={() => onOpenMeeting(m.id)}>
                  <span className="meeting-link-title">{m.title}</span>
                  <span className="meeting-link-time">
                    {formatDayLong(m.start)}, {formatTime(m.start)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <button type="button" className="btn btn-sm btn-ghost add-btn" onClick={() => onScheduleMeeting(round.id)}>
            <Icon name="calendar" size={14} />
            Schedule a review call
          </button>
        )}
      </Section>

      {missing.length > 0 && (
        <Section title="Add a rule" sub="Rules keep a round from dragging on.">
          <div className="rule-chips">
            {missing.map((m) => (
              <button key={m.label} type="button" className="btn btn-sm btn-outline" onClick={() => onApplyBlock(round.id, m.block)}>
                <Icon name={m.icon} size={14} />
                {m.label}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function RevisionSection({ round, showBuy }: { round: Round; showBuy?: boolean }) {
  const { dispatch } = useStore();
  const editable = round.state !== 'done';
  const segments = Array.from({ length: Math.max(round.revisionsAllowed, 1) }, (_, i) => i < round.revisionsUsed);
  const left = round.revisionsAllowed - round.revisionsUsed;

  return (
    <Section
      title="Revision rounds"
      aside={<span className="insp-sub">{round.revisionsAllowed === 0 ? 'None included' : `${round.revisionsUsed} of ${round.revisionsAllowed} used`}</span>}
    >
      <div className="rev-bar" style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {segments.map((used, i) => (
          <span key={i} className={used ? 'is-used' : ''} />
        ))}
      </div>
      <div className="setting-list">
        {editable && (
          <SettingRow label="Included">
            <MenuButton
              label={`Included revisions: ${round.revisionsAllowed}, change`}
              className="value-btn"
              width={180}
              items={[0, 1, 2, 3, 4, 5, 6].map((n) => ({
                key: String(n),
                label: plural(n, 'revision'),
                checked: round.revisionsAllowed === n,
                disabled: n < round.revisionsUsed,
                onSelect: () => dispatch({ type: 'setRevisions', roundId: round.id, allowed: n }),
              }))}
            >
              {plural(round.revisionsAllowed, 'revision')}
              <Icon name="chevronDown" size={12} strokeWidth={2.2} />
            </MenuButton>
          </SettingRow>
        )}
        <SettingRow label="Extra round">
          <ExtraRoundEditor extra={round.extraRound} disabled={!editable} onChange={(extra) => dispatch({ type: 'setExtraRound', roundId: round.id, extra })} />
        </SettingRow>
      </div>
      {showBuy && round.state === 'live' && left <= 0 && round.extraRound && (
        <button type="button" className="btn btn-outline btn-block" onClick={() => dispatch({ type: 'buyExtraRound', roundId: round.id })}>
          <Icon name="plusCircle" size={16} />
          Add the extra round
        </button>
      )}
    </Section>
  );
}

function GateInspector({ project, round, index, onClose, onApprove }: RoundProps) {
  const { dispatch } = useStore();
  const name = `finalsay-${round.id}`;
  const left = round.revisionsAllowed - round.revisionsUsed;
  return (
    <div className="insp">
      <div className="insp-top">
        <InspectorHead icon="branch" eyebrow={`ROUND ${index + 1} · FINAL SAY`} title={`${personName(project, round.finalSayId)} decides`} onClose={onClose} />
        <p className="insp-sub">One person closes the round. Everyone else’s feedback feeds their call.</p>
      </div>

      <Section title="Who decides">
        <fieldset className="radio-list">
          <legend className="sr-only">Who has the final say in Round {index + 1}</legend>
          {round.reviewerIds.map((id) => (
            <label key={id} className="radio-row">
              <input
                type="radio"
                name={name}
                checked={round.finalSayId === id}
                disabled={round.state === 'done'}
                onChange={() => dispatch({ type: 'setFinalSay', roundId: round.id, personId: id })}
              />
              <span className="avatar avatar-sm" aria-hidden="true">
                {initials(personName(project, id))}
              </span>
              <span className="reviewer-names">
                <span className="reviewer-name">{personName(project, id)}</span>
                <span className="reviewer-role">{project.people.find((p) => p.id === id)?.role}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Section>

      {round.state === 'live' && (
        <Section title="Record the decision" sub={left > 0 ? `${plural(left, 'revision')} left before an extra round is needed.` : 'No revisions left.'}>
          <div className="decision-actions">
            <button type="button" className="btn btn-dark" onClick={() => onApprove(round.id)}>
              <Icon name="check" size={16} strokeWidth={2.2} />
              Approve round
            </button>
            <button type="button" className="btn btn-outline" disabled={left <= 0} onClick={() => dispatch({ type: 'requestChanges', roundId: round.id })}>
              <Icon name="pen" size={16} />
              Request changes
            </button>
          </div>
          {left <= 0 && round.extraRound && (
            <button type="button" className="btn btn-outline btn-block" onClick={() => dispatch({ type: 'buyExtraRound', roundId: round.id })}>
              <Icon name="plusCircle" size={16} />
              Add the extra round
            </button>
          )}
        </Section>
      )}

      {round.state !== 'done' && (
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => dispatch({ type: 'setFinalSay', roundId: round.id, personId: null })}>
          <Icon name="trash" size={16} />
          Remove final say
        </button>
      )}
    </div>
  );
}

function LockInspector({ round, index, onClose }: RoundProps) {
  const { dispatch } = useStore();
  const toggle = (aspect: AspectId, on: boolean) =>
    dispatch({
      type: 'setLock',
      roundId: round.id,
      aspects: on ? [...round.lockOnApprove, aspect] : round.lockOnApprove.filter((a) => a !== aspect),
    });
  return (
    <div className="insp">
      <div className="insp-top">
        <InspectorHead
          icon="lock"
          eyebrow={`ROUND ${index + 1} · ON APPROVAL`}
          title={`Lock ${joinList(round.lockOnApprove.map((a) => aspectLabel(a).toLowerCase()))}`}
          onClose={onClose}
        />
        <p className="insp-sub">Once locked, feedback on it turns into a reopen request. Reopening uses a revision.</p>
      </div>
      <Section title={`Lock when Round ${index + 1} is approved`}>
        <fieldset className="check-list">
          <legend className="sr-only">Aspects to lock</legend>
          {ASPECTS.map((a) => (
            <label key={a.id} className="check-row">
              <input
                type="checkbox"
                checked={round.lockOnApprove.includes(a.id)}
                disabled={round.state === 'done'}
                onChange={(e) => toggle(a.id, e.target.checked)}
              />
              <span className="node-icon node-icon-sm">
                <Icon name={ASPECT_ICON[a.id]} size={15} />
              </span>
              <span>{a.label}</span>
            </label>
          ))}
        </fieldset>
      </Section>
      {round.state !== 'done' && (
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => dispatch({ type: 'setLock', roundId: round.id, aspects: [] })}>
          <Icon name="trash" size={16} />
          Remove lock rule
        </button>
      )}
    </div>
  );
}

function ReviseInspector({ round, index, onClose }: RoundProps) {
  return (
    <div className="insp">
      <div className="insp-top">
        <InspectorHead icon="refresh" eyebrow={`ROUND ${index + 1} · REVISION`} title="Revise and resend" onClose={onClose} />
        <p className="insp-sub">When changes are requested, the revised version goes back to Round {index + 1}.</p>
      </div>
      <RevisionSection round={round} showBuy />
    </div>
  );
}

function TriggerInspector({ onClose }: InspectorProps) {
  const { project, dispatch } = useStore();
  const live = project.rounds.findIndex((r) => r.state === 'live');
  const next = project.rounds.findIndex((r) => r.state === 'upcoming');
  return (
    <div className="insp">
      <div className="insp-top">
        <InspectorHead icon="upload" eyebrow="TRIGGER" title="New version uploaded" onClose={onClose} dark />
        <p className="insp-sub">Each round starts when you upload a new version for review.</p>
      </div>
      <Section title="Right now">
        {live >= 0 ? (
          <p className="insp-sub">
            Round {live + 1}: {roundKindDef(project.rounds[live].kind).label} is live.
          </p>
        ) : next >= 0 ? (
          <button type="button" className="btn btn-dark btn-block" onClick={() => dispatch({ type: 'startNextRound' })}>
            <Icon name="play" size={14} />
            Upload version and start Round {next + 1}
          </button>
        ) : (
          <p className="insp-sub">{project.rounds.length === 0 ? 'Add a round to get started.' : 'Every round is signed off.'}</p>
        )}
      </Section>
    </div>
  );
}
