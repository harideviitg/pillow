import { relativeTime } from '../domain/time';
import { useNow, useStore } from '../state/store';

export function ActivityPanel() {
  const { project } = useStore();
  const now = useNow();
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Activity</h2>
      </div>
      {project.activity.length === 0 ? (
        <p className="panel-empty">Nothing has happened on this project yet.</p>
      ) : (
        <ol className="activity-list">
          {project.activity.map((entry) => (
            <li key={entry.id}>
              <span className="activity-text">{entry.text}</span>
              <time className="activity-time" dateTime={new Date(entry.at).toISOString()}>
                {relativeTime(entry.at, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
