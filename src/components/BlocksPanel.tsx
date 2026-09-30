import { useId } from 'react';
import { NUDGE_BLOCKS, ROUND_KINDS, RULE_BLOCKS, blockLabel, type Block } from '../domain/catalog';
import type { Gap } from '../domain/gaps';
import { GripIcon, Icon } from './Icon';
import { Popover, usePopover } from './Popover';
import { blockIcon } from './ui';

export const BLOCK_MIME = 'application/x-lockstep-block';

const SECTIONS: { title: string; blocks: Block[] }[] = [
  { title: 'Rounds', blocks: ROUND_KINDS.map((k) => ({ type: 'round', kind: k.kind })) },
  { title: 'Rules', blocks: RULE_BLOCKS.map((r) => ({ type: 'rule', rule: r.id })) },
  { title: 'Nudges', blocks: NUDGE_BLOCKS.map((n) => ({ type: 'nudge', channel: n.id })) },
];

function blockKey(block: Block): string {
  return block.type === 'round' ? block.kind : block.type === 'rule' ? block.rule : block.channel;
}

interface BlocksPanelProps {
  collapsed: boolean;
  drawerOpen: boolean;
  onToggleCollapse: () => void;
  onCloseDrawer: () => void;
  onActivate: (block: Block) => void;
  onDragStart: (block: Block) => void;
  onDragEnd: () => void;
  gaps: Gap[];
  onGapsOpenChange: (open: boolean) => void;
  onSelectGap: (gap: Gap) => void;
}

export function BlocksPanel({
  collapsed,
  drawerOpen,
  onToggleCollapse,
  onCloseDrawer,
  onActivate,
  onDragStart,
  onDragEnd,
  gaps,
  onGapsOpenChange,
  onSelectGap,
}: BlocksPanelProps) {
  const hintId = useId();
  const gapsPop = usePopover();

  const setGapsOpen = (open: boolean, restoreFocus = false) => {
    if (open) gapsPop.setOpen(true);
    else gapsPop.close(restoreFocus);
    onGapsOpenChange(open);
  };

  const problems = gaps.filter((g) => g.severity === 'problem').length;

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}${drawerOpen ? ' is-drawer-open' : ''}`} aria-label="Blocks">
      <div className="sidebar-head">
        <h2 className="sidebar-title">Blocks</h2>
        <button
          type="button"
          className="icon-btn icon-btn-md hide-sm"
          aria-label={collapsed ? 'Expand blocks panel' : 'Collapse blocks panel'}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        >
          <Icon name="panel" size={18} />
        </button>
        <button type="button" className="icon-btn icon-btn-md show-sm" aria-label="Close blocks" onClick={onCloseDrawer}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <p id={hintId} className="sr-only">
        Drag a block onto the flow, or press it to add it to the selected round.
      </p>

      {SECTIONS.map((section) => (
        <div key={section.title} className="block-group" role="group" aria-label={section.title}>
          <span className="block-group-title">{section.title}</span>
          {section.blocks.map((block) => (
            <button
              key={blockKey(block)}
              type="button"
              className="block"
              draggable
              aria-describedby={hintId}
              aria-label={collapsed ? blockLabel(block) : undefined}
              title={collapsed ? blockLabel(block) : undefined}
              onClick={() => onActivate(block)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData(BLOCK_MIME, JSON.stringify(block));
                e.dataTransfer.setData('text/plain', blockLabel(block));
                onDragStart(block);
              }}
              onDragEnd={onDragEnd}
            >
              <span className="block-icon">
                <Icon name={blockIcon(block)} size={16} />
              </span>
              <span className="block-label">{blockLabel(block)}</span>
              <span className="block-grip">
                <GripIcon />
              </span>
            </button>
          ))}
        </div>
      ))}

      <button
        type="button"
        className="btn btn-outline btn-block gaps-btn"
        aria-label={collapsed ? 'Check for gaps' : undefined}
        ref={gapsPop.triggerProps.ref}
        aria-expanded={gapsPop.open}
        aria-controls={gapsPop.open ? gapsPop.id : undefined}
        onClick={() => setGapsOpen(!gapsPop.open)}
      >
        <Icon name="scan" size={16} />
        <span className="block-label">Check for gaps</span>
      </button>
      <Popover
        anchor={gapsPop.anchor}
        open={gapsPop.open}
        onClose={(restore) => setGapsOpen(false, restore)}
        id={gapsPop.id}
        label="Gaps in this flow"
        placement="right-end"
        width={340}
        className="panel-pop"
      >
        <div className="panel">
          <div className="panel-head">
            <h2>{gaps.length === 0 ? 'No gaps found' : `${gaps.length} to look at`}</h2>
            {problems > 0 && <span className="panel-count tone-warn">{problems} blocking</span>}
          </div>
          {gaps.length === 0 ? (
            <p className="panel-empty">Every aspect has a round, and every round has reviewers, a final say and a deadline.</p>
          ) : (
            <ul className="gap-list">
              {gaps.map((gap) => (
                <li key={gap.id}>
                  {gap.roundId ? (
                    <button type="button" className={`gap-item sev-${gap.severity}`} onClick={() => onSelectGap(gap)}>
                      <Icon name="alert" size={16} />
                      <span>{gap.text}</span>
                    </button>
                  ) : (
                    <div className={`gap-item sev-${gap.severity}`}>
                      <Icon name="alert" size={16} />
                      <span>{gap.text}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </aside>
  );
}
