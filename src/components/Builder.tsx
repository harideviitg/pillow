import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { atMinutes, addDays, startOfDay } from '../domain/calendar';
import { aspectLabel, blockLabel, channelLabel, hoursLabel, roundKindDef, type Block } from '../domain/catalog';
import { findGaps, type Gap } from '../domain/gaps';
import { blankProject } from '../domain/projects';
import { applyBlockToRound, personName, projectReducer, uid } from '../domain/reducer';
import { firstEditableIndex, liveRoundIndex } from '../domain/routing';
import type { AspectId, Meeting, Project, RoundKind } from '../domain/types';
import { isTypingTarget, navigate, useHotkeys } from '../nav';
import { useNow, useStore } from '../state/store';
import { BlocksPanel } from './BlocksPanel';
import { FlowCanvas, type CanvasActions, type CanvasHandle } from './FlowCanvas';
import { ApproveModal, NewProjectModal, PersonModal } from './Forms';
import { Header } from './Header';
import { Inspector } from './Inspector';
import { Modal } from './Modal';
import { ReviewerView } from './ReviewerView';
import { BottomTabs } from './Shell';
import { selectionKey, type NodeSelection } from './selection';
import { useToast } from './Toast';
import { joinList } from './ui';

export function useMediaQuery(query: string): boolean {
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

export function Builder({ focusRoundId }: { focusRoundId: string | null }) {
  const { data, project, dispatch, appDispatch, undo } = useStore();
  const toast = useToast();
  const now = useNow();
  const wide = useMediaQuery('(min-width: 1181px)');
  const canvas = useRef<CanvasHandle>(null);

  const [selection, setSelection] = useState<NodeSelection | null>(() => defaultSelection(project));
  const [inspectorOpen, setInspectorOpen] = useState(wide);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [approveRoundId, setApproveRoundId] = useState<string | null>(null);
  const [personRoundId, setPersonRoundId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [reveal, setReveal] = useState<{ key: string; n: number } | null>(null);
  const pinnedToastAt = useRef(0);

  const withUndo = useCallback((message: string) => toast(message, { action: { label: 'Undo', onClick: undo } }), [toast, undo]);

  const select = useCallback((sel: NodeSelection, revealIt = false) => {
    setSelection(sel);
    setInspectorOpen(true);
    if (revealIt) setReveal((r) => ({ key: selectionKey(sel)!, n: (r?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    setSelection(defaultSelection(project));
    // Only a different project resets the selection.
  }, [project.id]);

  // Arriving from the calendar with a round to show.
  useEffect(() => {
    if (!focusRoundId) return;
    const owner = data.projects.find((p) => p.rounds.some((r) => r.id === focusRoundId));
    if (!owner) return;
    if (owner.id !== project.id) appDispatch({ type: 'switchProject', projectId: owner.id });
    const id = window.setTimeout(() => select({ type: 'round', roundId: focusRoundId }, true), 0);
    return () => window.clearTimeout(id);
  }, [focusRoundId]);

  // Drop a selection whose round was removed.
  useEffect(() => {
    if (selection && selection.type !== 'trigger' && !project.rounds.some((r) => r.id === selection.roundId)) {
      setSelection(defaultSelection(project));
    }
  }, [project, selection]);

  const gaps = useMemo(() => findGaps(project, now), [project, now]);
  const flagged = useMemo(() => new Set(gapsOpen ? gaps.map((g) => g.roundId).filter((id): id is string => id !== null) : []), [gaps, gapsOpen]);
  const indexOf = (roundId: string) => project.rounds.findIndex((r) => r.id === roundId);

  const insertRound = (index: number, kind: RoundKind, id = uid('r')) => {
    dispatch({ type: 'insertRound', index, kind, id });
    select({ type: 'round', roundId: id }, true);
    withUndo(`Added ${roundKindDef(kind).label} as Round ${index + 1}`);
  };

  const applyBlock = (roundId: string, block: Block) => {
    const index = indexOf(roundId);
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
    const message = blockMessage(after, index, block, next !== round);
    if (next !== round) withUndo(message);
    else toast(message);
    select({ type: 'round', roundId }, true);
  };

  const targetRoundId = (): string | null => {
    if (selection && selection.type !== 'trigger') return selection.roundId;
    const live = liveRoundIndex(project.rounds);
    if (live >= 0) return project.rounds[live].id;
    return project.rounds.find((r) => r.state !== 'done')?.id ?? null;
  };

  const addReviewer = (roundId: string, personId: string) => {
    const index = indexOf(roundId);
    const round = project.rounds[index];
    if (!round || round.state === 'done') return;
    if (round.reviewerIds.includes(personId)) {
      toast(`${personName(project, personId)} already reviews Round ${index + 1}`);
      return;
    }
    dispatch({ type: 'addReviewer', roundId, personId });
    withUndo(`${personName(project, personId)} now reviews Round ${index + 1}`);
  };

  const activateBlock = (block: Block) => {
    setDrawerOpen(false);
    if (block.type === 'round') {
      const selectedIndex = selection && selection.type !== 'trigger' ? indexOf(selection.roundId) : -1;
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

  const removeRound = (roundId: string) => {
    const index = indexOf(roundId);
    if (project.rounds[index]?.state !== 'upcoming') {
      toast('Only rounds that have not started can be removed');
      return;
    }
    dispatch({ type: 'removeRound', roundId });
    withUndo(`Removed Round ${index + 1}: ${roundKindDef(project.rounds[index].kind).label}`);
  };

  const actions: CanvasActions = {
    onSelect: (sel) => select(sel),
    onInsert: (index, kind, id) => insertRound(index, kind, id),
    onReorder: (roundId, toIndex) => {
      const from = indexOf(roundId);
      if (from === toIndex) return;
      dispatch({ type: 'reorderRound', roundId, toIndex });
      select({ type: 'round', roundId });
      withUndo(`Moved ${roundKindDef(project.rounds[from].kind).label} to Round ${toIndex + 1}`);
    },
    onRemove: removeRound,
    onApplyBlock: applyBlock,
    onAddReviewer: addReviewer,
    onFinalSay: (roundId, personId) => {
      dispatch({ type: 'setFinalSay', roundId, personId });
      withUndo(`${personName(project, personId)} has the final say in Round ${indexOf(roundId) + 1}`);
    },
    onMoveAspect: (aspect: AspectId, fromRoundId: string, toRoundId: string) => {
      const to = indexOf(toRoundId);
      const action = { type: 'moveAspect' as const, aspect, fromRoundId, toRoundId };
      const after = projectReducer(project, action, Date.now());
      if (after === project) {
        toast(`${aspectLabel(aspect)} can't move there. Round ${to + 1} has no revisions left to reopen it`);
        return;
      }
      const reopened = after.rounds[to].revisionsUsed > project.rounds[to].revisionsUsed;
      dispatch(action);
      withUndo(`${aspectLabel(aspect)} is reviewed in Round ${to + 1}${reopened ? '. Reopening it used a revision' : ''}`);
      select({ type: 'round', roundId: toRoundId });
    },
    onApprove: setApproveRoundId,
    onRequestChanges: (roundId) => {
      dispatch({ type: 'requestChanges', roundId });
      withUndo(`Changes requested. Round ${indexOf(roundId) + 1} starts over with the revised version`);
    },
    onMove: (roundId, delta) => dispatch({ type: 'moveRound', roundId, delta }),
    onPinned: (roundId) => {
      if (Date.now() - pinnedToastAt.current < 2500) return;
      pinnedToastAt.current = Date.now();
      const round = project.rounds[indexOf(roundId)];
      toast(`Round ${indexOf(roundId) + 1} ${round?.state === 'live' ? 'is live' : 'already ran'}, so it stays where it is`);
    },
  };

  const scheduleMeeting = (roundId: string) => {
    const index = indexOf(roundId);
    const round = project.rounds[index];
    if (!round) return;
    let start = atMinutes(addDays(startOfDay(Date.now()), 1), 11 * 60);
    while ([0, 6].includes(new Date(start).getDay())) start = addDays(start, 1);
    const meeting: Meeting = {
      id: uid('m'),
      title: `${roundKindDef(round.kind).label} review call`,
      kind: 'review',
      start,
      end: start + 45 * 60 * 1000,
      attendeeIds: [...round.reviewerIds],
      projectId: project.id,
      roundId,
      link: '',
      notes: '',
    };
    appDispatch({ type: 'addMeeting', meeting });
    navigate(`#/calendar?m=${meeting.id}`);
    withUndo(`${meeting.title} added to the calendar`);
  };

  const hotkeys = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey) return;
      if (e.key === '+' || e.key === '=') canvas.current?.zoomIn();
      else if (e.key === '-' || e.key === '_') canvas.current?.zoomOut();
      else if (e.key === '0') canvas.current?.actualSize();
      else if (e.key === 'f' || e.key === 'F') canvas.current?.fit();
      else if (e.key === 'Escape') setSelection(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.type === 'round') {
        const round = project.rounds.find((r) => r.id === selection.roundId);
        if (round?.state === 'upcoming') removeRound(round.id);
      } else return;
      e.preventDefault();
    },
    [selection, project],
  );
  useHotkeys(hotkeys);

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
          people={project.people}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onCloseDrawer={() => setDrawerOpen(false)}
          onActivate={activateBlock}
          onActivatePerson={(personId) => {
            setDrawerOpen(false);
            const roundId = targetRoundId();
            if (roundId) addReviewer(roundId, personId);
          }}
          gaps={gaps}
          onGapsOpenChange={setGapsOpen}
          onSelectGap={(gap: Gap) => gap.roundId && select({ type: 'round', roundId: gap.roundId }, true)}
        />
        <FlowCanvas ref={canvas} project={project} now={now} selection={selection} actions={actions} flaggedRoundIds={flagged} revealRequest={reveal} />
        <Inspector
          selection={selection}
          now={now}
          open={wide || inspectorOpen}
          onClose={closeInspector}
          onSelect={(sel) => select(sel)}
          onApprove={setApproveRoundId}
          onAddPerson={setPersonRoundId}
          onApplyBlock={applyBlock}
          onScheduleMeeting={scheduleMeeting}
          onOpenMeeting={(id) => navigate(`#/calendar?m=${id}`)}
        />
      </div>
      <BottomTabs current="builder" />

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
            const index = indexOf(approveRoundId);
            dispatch({ type: 'approveRound', roundId: approveRoundId, note });
            setApproveRoundId(null);
            const next = project.rounds[index + 1];
            if (next) select({ type: 'round', roundId: next.id }, true);
            withUndo(next ? `Round ${index + 1} approved. Round ${index + 2} is live` : 'Final round approved. The flow is signed off');
          }}
        />
      )}

      {personRoundId && (
        <PersonModal
          onClose={() => setPersonRoundId(null)}
          onSave={(name, role) => {
            dispatch({ type: 'addPerson', roundId: personRoundId, person: { id: uid('p'), name, role } });
            setPersonRoundId(null);
            withUndo(`${name} added as a reviewer`);
          }}
        />
      )}

      {newProjectOpen && (
        <NewProjectModal
          onClose={() => setNewProjectOpen(false)}
          onCreate={(client, name) => {
            appDispatch({ type: 'createProject', project: blankProject(uid('proj'), client, name, Date.now()) });
            setNewProjectOpen(false);
            withUndo(`${name} created`);
          }}
        />
      )}
    </div>
  );
}
