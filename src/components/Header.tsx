import { roundKindDef } from '../domain/catalog';
import { liveRoundIndex } from '../domain/routing';
import type { Project } from '../domain/types';
import { useStore } from '../state/store';
import { ActivityPanel } from './ActivityPanel';
import { CommentsPanel } from './CommentsPanel';
import { Icon } from './Icon';
import { MenuButton, Popover, usePopover } from './Popover';
import { MOD, ViewSwitch } from './Shell';
import { useToast } from './Toast';
import { navigate } from '../nav';

export function statusPill(project: Project): { text: string; tone: 'live' | 'done' | 'idle' } {
  const live = liveRoundIndex(project.rounds);
  if (live >= 0) return { text: `Round ${live + 1} live`, tone: 'live' };
  if (project.rounds.length > 0 && project.rounds.every((r) => r.state === 'done')) return { text: 'Signed off', tone: 'done' };
  return { text: 'Not started', tone: 'idle' };
}

export function reviewLink(projectId: string, roundId: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/review/${encodeURIComponent(projectId)}/${encodeURIComponent(roundId)}`;
}

interface HeaderProps {
  onPreview: () => void;
  onNewProject: () => void;
  onOpenBlocks: () => void;
  onSelectRound: (roundId: string) => void;
}

export function Header({ onPreview, onNewProject, onOpenBlocks, onSelectRound }: HeaderProps) {
  const { data, project, appDispatch, undo, redo, canUndo, canRedo } = useStore();
  const toast = useToast();
  const activity = usePopover();
  const comments = usePopover();
  const pill = statusPill(project);
  const live = liveRoundIndex(project.rounds);

  const share = async () => {
    if (live < 0) {
      toast('No round is live yet. Start one from the trigger first.');
      return;
    }
    const url = reviewLink(project.id, project.rounds[live].id);
    try {
      await navigator.clipboard.writeText(url);
      toast(`Link to Round ${live + 1}: ${roundKindDef(project.rounds[live].kind).label} copied`);
    } catch {
      toast(`Copy this link: ${url}`);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <a
          className="icon-btn"
          href="#/projects"
          aria-label="Back to projects"
          onClick={(e) => {
            e.preventDefault();
            navigate('#/projects');
          }}
        >
          <Icon name="back" size={18} />
        </a>
        <button type="button" className="icon-btn show-sm" aria-label="Open blocks" onClick={onOpenBlocks}>
          <Icon name="grid" size={18} />
        </button>
        <span className="crumb hide-sm">{project.client}</span>
        <span className="crumb-sep hide-sm" aria-hidden="true">
          /
        </span>
        <h1 className="project-name">{project.name}</h1>
        <MenuButton
          label="Switch project"
          className="icon-btn icon-btn-sm"
          placement="bottom-start"
          width={280}
          items={[
            { key: 'h', heading: 'Projects' },
            ...data.projects.map((p) => ({
              key: p.id,
              label: p.name,
              hint: p.client,
              checked: p.id === project.id,
              onSelect: () => appDispatch({ type: 'switchProject', projectId: p.id }),
            })),
            { key: 's', separator: true },
            { key: 'new', label: 'New project', icon: 'plus', onSelect: onNewProject },
            {
              key: 'reset',
              label: 'Reset sample project',
              icon: 'refresh',
              onSelect: () => {
                appDispatch({ type: 'resetSample', now: Date.now() });
                toast('Sample project reset');
              },
            },
          ]}
        >
          <Icon name="chevronDown" size={16} />
        </MenuButton>
        <span className={`status-pill tone-${pill.tone}`}>
          <span className="dot" />
          {pill.text}
        </span>
      </div>
      <ViewSwitch current="builder" />
      <div className="topbar-right">
        <span className="undo-group hide-sm">
          <button type="button" className="icon-btn icon-btn-md" aria-label="Undo" title={`Undo (${MOD}+Z)`} disabled={!canUndo} onClick={undo}>
            <Icon name="undo" size={17} />
          </button>
          <button type="button" className="icon-btn icon-btn-md" aria-label="Redo" title={`Redo (${MOD}+Shift+Z)`} disabled={!canRedo} onClick={redo}>
            <Icon name="redo" size={17} />
          </button>
        </span>
        <button type="button" className="icon-btn hide-sm" aria-label="Activity" {...activity.triggerProps}>
          <Icon name="clock" size={18} />
        </button>
        <Popover anchor={activity.anchor} open={activity.open} onClose={activity.close} id={activity.id} label="Activity" placement="bottom-end" width={360} className="panel-pop">
          <ActivityPanel />
        </Popover>
        <button type="button" className="icon-btn hide-sm" aria-label="All comments" {...comments.triggerProps}>
          <Icon name="comments" size={18} />
        </button>
        <Popover anchor={comments.anchor} open={comments.open} onClose={comments.close} id={comments.id} label="All comments" placement="bottom-end" width={400} className="panel-pop">
          <CommentsPanel
            onSelectRound={(id) => {
              comments.close(false);
              onSelectRound(id);
            }}
          />
        </Popover>
        <button type="button" className="btn btn-outline hide-md" onClick={onPreview}>
          <Icon name="eye" size={16} />
          Preview as reviewer
        </button>
        <button type="button" className="icon-btn show-md hide-sm" aria-label="Preview as reviewer" onClick={onPreview}>
          <Icon name="eye" size={18} />
        </button>
        <button type="button" className="btn btn-dark" onClick={share}>
          <Icon name="link" size={16} />
          <span className="hide-xs">Share round link</span>
          <span className="show-xs">Share</span>
        </button>
      </div>
    </header>
  );
}
