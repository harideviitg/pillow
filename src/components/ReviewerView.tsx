import { useEffect, useId, useState } from 'react';
import { ASPECTS, aspectLabel, roundKindDef } from '../domain/catalog';
import { personName, uid } from '../domain/reducer';
import { aspectStatus, routeComment, type AspectStatus } from '../domain/routing';
import { dueLabel } from '../domain/time';
import type { AspectId, Comment, Project } from '../domain/types';
import { useNow, useStore } from '../state/store';
import { Icon } from './Icon';
import { ASPECT_ICON, ROUND_ICON } from './ui';

function statusCopy(status: AspectStatus): string {
  switch (status.kind) {
    case 'focus':
      return status.reopenedFrom === null ? 'Comment now' : `Reopened from Round ${status.reopenedFrom + 1}`;
    case 'parked':
      return `Comes up in Round ${status.roundIndex + 1}`;
    case 'locked':
      return `Locked in Round ${status.roundIndex + 1}`;
    case 'unscheduled':
      return 'Not in any round yet';
  }
}

export function routeMessage(project: Project, comment: Comment): string {
  const route = routeComment(project, comment);
  const aspect = aspectLabel(comment.aspect);
  if (!route) return 'Comment saved.';
  switch (route.kind) {
    case 'counts':
      return `Counts this round. ${aspect} is in focus.`;
    case 'parked':
      return `Parked for Round ${route.toIndex + 1}. It will be waiting there when ${aspect.toLowerCase()} comes up.`;
    case 'reopen-request':
      return `${aspect} was locked in Round ${route.lockedIndex + 1}, so this went in as a reopen request.`;
    case 'unrouted':
      return `No round reviews ${aspect.toLowerCase()} yet. The studio will see it when they check for gaps.`;
    default:
      return 'Comment saved.';
  }
}

export function ReviewerView({ roundId }: { roundId: string }) {
  const { project, dispatch } = useStore();
  const now = useNow();
  const index = project.rounds.findIndex((r) => r.id === roundId);
  const round = project.rounds[index];
  const reviewerFieldId = useId();
  const textId = useId();
  const [reviewerId, setReviewerId] = useState(() => round?.reviewerIds.find((id) => !round.reviewedIds.includes(id)) ?? round?.reviewerIds[0] ?? '');
  const firstFocus = round?.focus[0] ?? 'layout';
  const [aspect, setAspect] = useState<AspectId>(firstFocus);
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (round && !round.reviewerIds.includes(reviewerId)) setReviewerId(round.reviewerIds[0] ?? '');
  }, [round, reviewerId]);

  if (!round) return <p className="panel-empty">This round no longer exists.</p>;

  const def = roundKindDef(round.kind);
  const due = dueLabel(round, now);
  const statuses = ASPECTS.map((a) => ({ ...a, status: aspectStatus(project.rounds, index, a.id) }));
  const mine = project.comments.filter((c) => c.roundId === round.id && c.authorId === reviewerId);
  const reviewed = round.reviewedIds.includes(reviewerId);
  const canComment = round.state === 'live' && reviewerId !== '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !canComment) return;
    const comment: Comment = {
      id: uid('c'),
      authorId: reviewerId,
      roundId: round.id,
      aspect,
      text: text.trim(),
      createdAt: Date.now(),
      resolution: 'open',
    };
    setResult(routeMessage(project, comment));
    dispatch({ type: 'addComment', comment });
    setText('');
  };

  return (
    <div className="reviewer-view">
      <div className="rv-brief">
        <div className="node-row">
          <span className="node-icon node-icon-lg">
            <Icon name={ROUND_ICON[round.kind]} size={18} />
          </span>
          <span className="node-titles grow">
            <span className="mono-label">{`ROUND ${index + 1}`}</span>
            <span className="insp-title">{def.label}</span>
          </span>
          {round.state === 'live' ? (
            <span className="badge badge-green">
              <span className="dot" />
              {due ?? 'Live'}
            </span>
          ) : (
            <span className="badge badge-gray">{round.state === 'done' ? 'Closed' : 'Not open yet'}</span>
          )}
        </div>
        <ul className="rv-aspects">
          {statuses.map((s) => (
            <li key={s.id} className={`rv-aspect is-${s.status.kind}`}>
              <Icon name={s.status.kind === 'locked' ? 'lock' : ASPECT_ICON[s.id]} size={15} />
              <span className="rv-aspect-name">{s.label}</span>
              <span className="rv-aspect-status">{statusCopy(s.status)}</span>
            </li>
          ))}
        </ul>
      </div>

      {round.reviewerIds.length === 0 ? (
        <p className="panel-empty">This round has no reviewers yet.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor={reviewerFieldId}>Reviewing as</label>
            <select id={reviewerFieldId} value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              {round.reviewerIds.map((id) => (
                <option key={id} value={id}>
                  {personName(project, id)}
                </option>
              ))}
            </select>
          </div>

          <form className="rv-form" onSubmit={submit}>
            <fieldset className="aspect-picker" disabled={!canComment}>
              <legend>What is your comment about?</legend>
              {statuses.map((s) => (
                <label key={s.id} className={`aspect-choice${aspect === s.id ? ' is-checked' : ''}`}>
                  <input type="radio" name="rv-aspect" value={s.id} checked={aspect === s.id} onChange={() => setAspect(s.id)} />
                  <Icon name={ASPECT_ICON[s.id]} size={14} />
                  {s.label}
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor={textId}>Comment</label>
              <textarea
                id={textId}
                rows={3}
                value={text}
                disabled={!canComment}
                placeholder={canComment ? `What should change about the ${aspectLabel(aspect).toLowerCase()}?` : 'This round is not open for comments.'}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="rv-actions">
              <button type="submit" className="btn btn-dark" disabled={!canComment || !text.trim()}>
                <Icon name="send" size={15} />
                Add comment
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={!canComment || reviewed}
                onClick={() => {
                  dispatch({ type: 'markReviewed', roundId: round.id, personId: reviewerId });
                  setResult(`${personName(project, reviewerId)}'s review is marked done.`);
                }}
              >
                <Icon name="check" size={15} strokeWidth={2.2} />
                {reviewed ? 'Review done' : 'Mark my review done'}
              </button>
            </div>
            <p className="rv-result" role="status" aria-live="polite">
              {result}
            </p>
          </form>

          {mine.length > 0 && (
            <section className="rv-mine" aria-label="Your comments this round">
              <h3>Your comments this round</h3>
              <ul>
                {mine.map((c) => (
                  <li key={c.id}>
                    <span className="tag">{aspectLabel(c.aspect)}</span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
