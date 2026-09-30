import { useCallback, useEffect, useMemo, useState } from 'react';
import { aspectLabel, blockLabel, channelLabel, hoursLabel, roundKindDef, type Block } from '../domain/catalog';
import { findGaps, type Gap } from '../domain/gaps';
import { layoutFlow } from '../domain/layout';
import { blankProject } from '../domain/projects';
import { applyBlockToRound, personName, uid } from '../domain/reducer';
import { firstEditableIndex, liveRoundIndex } from '../domain/routing';
import type { Project, RoundKind } from '../domain/types';
import { useNow, useStore } from '../state/store';
import { BlocksPanel } from './BlocksPanel';
import { FlowCanvas } from './FlowCanvas';
import { ApproveModal, NewProjectModal, PersonModal } from './Forms';
import { Header } from './Header';
import { Inspector } from './Inspector';
import { Modal } from './Modal';
import { ReviewerView } from './ReviewerView';
import { selectionKey, type NodeSelection } from './selection';
import { useToast } from './Toast';
import { joinList } from './ui';

function useMediaQuery(query: string): boolean {
  const get = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return matches;
}

function defaultSelection(project: Project): NodeSelection {
  const live = liveRoundIndex(project.rounds);
  return live >= 0 ? { type: 'round', roundId: project.rounds[live].id } : { type: 'trigger' };
}

function blockMessage(project: Project, index: number, block: Block, changed: boolean): string {
  const round = project.rounds[index];
  const title = `Round ${index + 1}`;
  if (block.type === 'nudge') {
    return changed
      ? `${title} nudges on ${channelLabel(block.channel)} after ${round.nudge?.afterHours ?? 24}h`
      : `${title} already nudges on ${channelLabel(block.channel)}`;
  }
  if (block.type !== 'rule') return '';
  switch (block.rule) {
    case 'final-say':
      return changed ? `Final say added to ${title}. ${personName(project, round.finalSayId)} decides` : `${title} already has a final say`;
    case 'lock-layer':
      return changed
        ? `${title} locks ${joinList(round.lockOnApprove.map((a) => aspectLabel(a).toLowerCase()))} once approved`
        : round.focus.length === 0
          ? `${title} has nothing in focus to lock`
          : `${title} already has a lock rule`;
    case 'deadline':
      return changed ? `${title} closes ${hoursLabel(round.closesAfterHours ?? 48)} after it starts` : `${title} already has a deadline`;
    case 'extra-round':
      return changed ? `${title} offers an extra round. Set its fee in the panel` : `${title} already offers an extra round`;
  }
}

export function Builder() {
  const { project, dispatch, appDispatch } = useStore();
  const toast = useToast();
  const now = useNow();
  const wide = useMediaQuery('(min-width: 1181px)');

  const [selection, setSelection] = useState<NodeSelection | null>(() => defaultSelection(project));
  const [inspectorOpen, setInspectorOpen] = useState(wide);
  const [dragBlock, setDragBlock] = useState<Block | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [approveRoundId, setApproveRoundId] = useState<string | null>(null);
  const [personRoundId, setPersonRoundId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [reveal, setReveal] = useState<{ key: string; n: number } | null>(null);

  useEffect(() => {
    setSelection(defaultSelection(project));
    // Only a different project resets the selection.
  }, [project.id]);

  // Drop a selection whose round was removed.
  useEffect(() => {
    if (selection && selection.type !== 'trigger' && !project.rounds.some((r) => r.id === selection.roundId)) {
      setSelection(defaultSelection(project));
    }
  }, [project, selection]);

  const layout = useMemo(() => layoutFlow(project), [project]);
  const gaps = useMemo(() => findGaps(project, now), [project, now]);
  const flagged = useMemo(() => new Set(gapsOpen ? gaps.map((g) => g.roundId).filter((id): id is string => id !== null) : []), [gaps, gapsOpen]);

  const select = useCallback((sel: NodeSelection, revealIt = false) => {
    setSelection(sel);
    setInspectorOpen(true);
    if (revealIt) setReveal((r) => ({ key: selectionKey(sel)!, n: (r?.n ?? 0) + 1 }));
  }, []);

  const insertRound = (index: number, kind: RoundKind) => {
    const id = uid('r');
    dispatch({ type: 'insertRound', index, kind, id });
    select({ type: 'round', roundId: id }, true);
    toast(`Added Round ${index + 1}: ${roundKindDef(kind).label}`);
  };

  const applyBlock = (roundId: string, block: Block) => {
    const index = project.rounds.findIndex((r) => r.id === roundId);
    const round = project.rounds[index];
    if (!round) return;
    if (round.state === 'done') {
      toast(`Round ${index + 1} is locked. Pick a live or upcoming round.`);
      return;
    }
    const next = applyBlockToRound(round, block, project.people);
    if (block.type === 'rule' && block.rule === 'final-say' && next === round && !round.finalSayId) {
      toast(`Add a reviewer to Round ${index + 1} first`);
      return;
    }
    dispatch({ type: 'applyBlock', roundId, block });
    const after = { ...project, rounds: project.rounds.map((r) => (r.id === roundId ? next : r)) };
    toast(blockMessage(after, index, block, next !== round));
    select({ type: 'round', roundId }, true);
  };

  const targetRoundId = (): string | null => {
    if (selection && selection.type !== 'trigger') return selection.roundId;
    const live = liveRoundIndex(project.rounds);
    if (live >= 0) return project.rounds[live].id;
    return project.rounds.find((r) => r.state !== 'done')?.id ?? null;
  };

  const activateBlock = (block: Block) => {
    setDrawerOpen(false);
    if (block.type === 'round') {
      const selectedIndex = selection && selection.type !== 'trigger' ? project.rounds.findIndex((r) => r.id === selection.roundId) : -1;
      const editableFrom = firstEditableIndex(project.rounds);
      const index = selectedIndex >= 0 && selectedIndex + 1 >= editableFrom ? selectedIndex + 1 : project.rounds.length;
      insertRound(index, block.kind);
      return;
    }
    const roundId = targetRoundId();
    if (!roundId) {
      toast(`Add a round before adding ${blockLabel(block)}`);
      return;
    }
    applyBlock(roundId, block);
  };

  const dropBlock = (block: Block, target: { roundId: string } | { insertIndex: number }) => {
    setDragBlock(null);
    if ('insertIndex' in target) {
      if (block.type === 'round') insertRound(target.insertIndex, block.kind);
      return;
    }
    if (block.type === 'round') {
      const index = project.rounds.findIndex((r) => r.id === target.roundId);
      if (index + 1 >= firstEditableIndex(project.rounds)) insertRound(index + 1, block.kind);
      return;
    }
    applyBlock(target.roundId, block);
  };

  const selectGap = (gap: Gap) => {
    if (gap.roundId) select({ type: 'round', roundId: gap.roundId }, true);
  };

  const closeInspector = () => {
    if (wide) setSelection(null);
    setInspectorOpen(false);
  };

  const liveIndex = liveRoundIndex(project.rounds);

  return (
    <div className="app">
      <Header
        onPreview={() => setPreviewOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
        onOpenBlocks={() => setDrawerOpen(true)}
        onSelectRound={(roundId) => select({ type: 'round', roundId }, true)}
      />
      <div className="workspace">
        {drawerOpen && <div className="scrim show-sm" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
        <BlocksPanel
          collapsed={collapsed}
          drawerOpen={drawerOpen}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onCloseDrawer={() => setDrawerOpen(false)}
          onActivate={activateBlock}
          onDragStart={setDragBlock}
          onDragEnd={() => setDragBlock(null)}
          gaps={gaps}
          onGapsOpenChange={setGapsOpen}
          onSelectGap={selectGap}
        />
        <FlowCanvas
          project={project}
          layout={layout}
          now={now}
          selection={selection}
          onSelect={(sel) => select(sel)}
          dragBlock={dragBlock}
          onDropBlock={dropBlock}
          onInsert={(index, block) => insertRound(index, block.kind)}
          onApprove={setApproveRoundId}
          onRequestChanges={(roundId) => dispatch({ type: 'requestChanges', roundId })}
          onMove={(roundId, delta) => dispatch({ type: 'moveRound', roundId, delta })}
          onRemove={(roundId) => {
            const index = project.rounds.findIndex((r) => r.id === roundId);
            dispatch({ type: 'removeRound', roundId });
            toast(`Removed Round ${index + 1}`);
          }}
          flaggedRoundIds={flagged}
          revealRequest={reveal}
        />
        <Inspector
          selection={selection}
          now={now}
          open={wide || inspectorOpen}
          onClose={closeInspector}
          onSelect={(sel) => select(sel)}
          onApprove={setApproveRoundId}
          onAddPerson={setPersonRoundId}
          onApplyBlock={applyBlock}
        />
      </div>

      {previewOpen && (
        <Modal title="Preview as reviewer" onClose={() => setPreviewOpen(false)} width={560}>
          {liveIndex >= 0 ? (
            <ReviewerView roundId={project.rounds[liveIndex].id} />
          ) : (
            <p className="panel-empty">No round is live. Start the next round from the trigger to see what reviewers get.</p>
          )}
        </Modal>
      )}

      {approveRoundId && (
        <ApproveModal
          project={project}
          roundId={approveRoundId}
          onClose={() => setApproveRoundId(null)}
          onApprove={(note) => {
            const index = project.rounds.findIndex((r) => r.id === approveRoundId);
            dispatch({ type: 'approveRound', roundId: approveRoundId, note });
            setApproveRoundId(null);
            const next = project.rounds[index + 1];
            if (next) select({ type: 'round', roundId: next.id }, true);
            toast(next ? `Round ${index + 1} approved. Round ${index + 2} is live` : 'Final round approved. The flow is signed off');
          }}
        />
      )}

      {personRoundId && (
        <PersonModal
          onClose={() => setPersonRoundId(null)}
          onSave={(name, role) => {
            dispatch({ type: 'addPerson', roundId: personRoundId, person: { id: uid('p'), name, role } });
            setPersonRoundId(null);
            toast(`${name} added as a reviewer`);
          }}
        />
      )}

      {newProjectOpen && (
        <NewProjectModal
          onClose={() => setNewProjectOpen(false)}
          onCreate={(client, name) => {
            appDispatch({ type: 'createProject', project: blankProject(uid('proj'), client, name, Date.now()) });
            setNewProjectOpen(false);
            toast(`${name} created`);
          }}
        />
      )}
    </div>
  );
}
