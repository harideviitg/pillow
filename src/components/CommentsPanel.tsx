import { aspectLabel } from '../domain/catalog';
import { canReopen, personName } from '../domain/reducer';
import { aspectStatus, routedComments, type CommentRoute, type RoutedComment } from '../domain/routing';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { initials } from './ui';

function routeText(route: CommentRoute): string {
  switch (route.kind) {
    case 'counts':
      return `Counts in Round ${route.roundIndex + 1}`;
    case 'parked':
      return `Parked for Round ${route.toIndex + 1}`;
    case 'reopen-request':
      return `Locked in Round ${route.lockedIndex + 1}. Weighed at Round ${route.surfacesAt + 1}`;
    case 'unrouted':
      return 'No round reviews this yet';
    case 'declined':
      return 'Reopen declined';
    case 'reopened':
      return 'Reopened';
  }
}

const GROUPS: { key: string; title: string; kinds: CommentRoute['kind'][] }[] = [
  { key: 'reopen', title: 'Reopen requests', kinds: ['reopen-request'] },
  { key: 'unrouted', title: 'Nowhere to go', kinds: ['unrouted'] },
  { key: 'counts', title: 'Counting now', kinds: ['counts'] },
  { key: 'parked', title: 'Parked for later', kinds: ['parked'] },
  { key: 'resolved', title: 'Resolved', kinds: ['declined', 'reopened'] },
];

export function CommentsPanel({ onSelectRound }: { onSelectRound: (roundId: string) => void }) {
  const { project, dispatch } = useStore();
  const all = routedComments(project);

  const item = ({ comment, route }: RoutedComment) => {
    const author = personName(project, comment.authorId);
    const target = route.kind === 'reopen-request' ? project.rounds[route.surfacesAt] : undefined;
    const alreadyOpen = route.kind === 'reopen-request' && aspectStatus(project.rounds, route.surfacesAt, comment.aspect).kind === 'focus';
    const reopenable = target ? alreadyOpen || canReopen(target) : false;
    return (
      <li key={comment.id} className="comment">
        <span className="avatar avatar-sm" aria-hidden="true">
          {initials(author)}
        </span>
        <div className="comment-body">
          <div className="comment-meta">
            <span className="comment-author">{author}</span>
            <span className="tag">{aspectLabel(comment.aspect)}</span>
            <button type="button" className="link-btn" onClick={() => onSelectRound(comment.roundId)}>
              Round {project.rounds.findIndex((r) => r.id === comment.roundId) + 1}
            </button>
          </div>
          <p className="comment-text">{comment.text}</p>
          <p className={`comment-route route-${route.kind}`}>{routeText(route)}</p>
          {route.kind === 'reopen-request' && (
            <div className="comment-actions">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={!reopenable}
                title={reopenable ? undefined : 'No revisions left in that round. Add an extra round first.'}
                onClick={() => dispatch({ type: 'acceptReopen', commentId: comment.id })}
              >
                <Icon name="lock" size={14} />
                Reopen in Round {route.surfacesAt + 1}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'declineReopen', commentId: comment.id })}>
                Decline
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>All comments</h2>
        <span className="panel-count">{all.length}</span>
      </div>
      {all.length === 0 && <p className="panel-empty">No comments yet. They show up here as reviewers leave them.</p>}
      {GROUPS.map((group) => {
        const list = all.filter((c) => group.kinds.includes(c.route.kind));
        if (list.length === 0) return null;
        return (
          <section key={group.key} className="panel-section" aria-label={group.title}>
            <h3>
              {group.title} <span className="panel-count">{list.length}</span>
            </h3>
            <ul className="comment-list">{list.map(item)}</ul>
          </section>
        );
      })}
      {all.some((c) => c.route.kind === 'reopen-request') && (
        <p className="panel-note">Reopening a locked aspect uses one of that round's revisions.</p>
      )}
    </div>
  );
}
