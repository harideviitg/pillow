import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  atMinutes,
  deadlineHours,
  formatDayLong,
  formatTime,
  minutesIntoDay,
  MINUTE,
  nextHalfHour,
  rangeTitle,
  roundEvents,
  sameDay,
  startOfDay,
  startOfMonth,
} from '../../domain/calendar';
import { uid } from '../../domain/reducer';
import type { Meeting, Person } from '../../domain/types';
import { isTypingTarget, navigate, useHotkeys } from '../../nav';
import { useNow, useStore } from '../../state/store';
import { useMediaQuery } from '../Builder';
import { Icon } from '../Icon';
import { MOD, BottomTabs, ViewSwitch } from '../Shell';
import { useToast } from '../Toast';
import { Agenda, LiveClock, MiniMonth, PeopleList, ProjectFilters, weekDaysFor, ZONES } from './CalendarSidebar';
import { MeetingEditor } from './MeetingEditor';
import { MonthGrid } from './MonthGrid';
import { TimeGrid } from './TimeGrid';

type View = 'day' | 'week' | 'month';

const PREFS_KEY = 'lockstep:calendar';
const PALETTE = ['#2A45B8', '#1C6B3A', '#9A4A0C', '#7A3FB0', '#0F6E7A', '#A12C5B'];

interface Prefs {
  view: View | null;
  zone: string | null;
  hidden: string[];
}

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { view: null, zone: null, hidden: [], ...JSON.parse(raw) };
  } catch {
    // Preferences are a convenience; defaults are fine.
  }
  return { view: null, zone: null, hidden: [] };
}

function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore: the calendar still works without saved preferences.
  }
}

export function CalendarPage({ focusMeetingId }: { focusMeetingId: string | null }) {
  const { data, dispatch, appDispatch, undo, redo, canUndo, canRedo } = useStore();
  const toast = useToast();
  const now = useNow(30_000);
  const narrow = useMediaQuery('(max-width: 700px)');
  const wide = useMediaQuery('(min-width: 1181px)');
  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState<View>(() => prefs.view ?? (narrow ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(Date.now()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);

  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });

  const withUndo = useCallback((message: string) => toast(message, { action: { label: 'Undo', onClick: undo } }), [toast, undo]);

  const colorOf = useCallback(
    (projectId: string | null) => {
      const i = data.projects.findIndex((p) => p.id === projectId);
      return i < 0 ? 'var(--faint)' : PALETTE[i % PALETTE.length];
    },
    [data.projects],
  );

  const visibleProjects = data.projects.filter((p) => !hidden.has(p.id));
  const meetings = data.meetings.filter((m) => (m.projectId ? !hidden.has(m.projectId) : !hidden.has('none')));
  const events = useMemo(() => roundEvents(visibleProjects), [visibleProjects]);
  const people = useMemo(() => {
    const seen = new Map<string, Person>();
    for (const p of data.projects) for (const person of p.people) if (!seen.has(person.id)) seen.set(person.id, person);
    return [...seen.values()];
  }, [data.projects]);
  const selected = data.meetings.find((m) => m.id === selectedId) ?? null;

  // Open a meeting linked from elsewhere, like a round's inspector.
  useEffect(() => {
    if (!focusMeetingId) return;
    const m = data.meetings.find((x) => x.id === focusMeetingId);
    if (!m) return;
    setSelectedId(m.id);
    setAnchor(startOfDay(m.start));
    setMiniMonth(startOfMonth(m.start));
    if (view === 'month') setView('week');
  }, [focusMeetingId]);

  useEffect(() => {
    if (selectedId && !data.meetings.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [data.meetings, selectedId]);

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (narrow) return [anchor, addDays(anchor, 1), addDays(anchor, 2)];
    return weekDaysFor(anchor);
  }, [view, anchor, narrow]);

  const step = (dir: 1 | -1) => {
    if (view === 'month') {
      const next = addMonths(anchor, dir);
      setAnchor(next);
      setMiniMonth(next);
    } else {
      const next = addDays(anchor, dir * (view === 'day' ? 1 : narrow ? 3 : 7));
      setAnchor(next);
      setMiniMonth(startOfMonth(next));
    }
  };

  const goToday = () => {
    setAnchor(startOfDay(Date.now()));
    setMiniMonth(startOfMonth(Date.now()));
  };

  const changeView = (v: View) => {
    setView(v);
    updatePrefs({ view: v });
  };

  const create = (start: number, end: number, attendeeIds: string[] = []) => {
    const meeting: Meeting = {
      id: uid('m'),
      title: attendeeIds.length === 1 ? `Call with ${people.find((p) => p.id === attendeeIds[0])?.name ?? 'someone'}` : 'New meeting',
      kind: attendeeIds.length ? 'client' : 'internal',
      start,
      end,
      attendeeIds,
      projectId: null,
      roundId: null,
      link: '',
      notes: '',
    };
    const owner = attendeeIds.length ? data.projects.find((p) => p.people.some((person) => person.id === attendeeIds[0])) : undefined;
    if (owner) meeting.projectId = owner.id;
    appDispatch({ type: 'addMeeting', meeting });
    setSelectedId(meeting.id);
    setFreshId(meeting.id);
    withUndo(`${meeting.title} on ${formatDayLong(start)} at ${formatTime(start)}`);
  };

  const newMeeting = () => {
    const today = sameDay(anchor, Date.now()) || view !== 'day';
    const base = today && days.some((d) => sameDay(d, Date.now())) ? nextHalfHour(Date.now()) : atMinutes(anchor, 10 * 60);
    create(base, base + 30 * MINUTE);
  };

  const moveMeeting = (id: string, start: number, end: number) => {
    const m = data.meetings.find((x) => x.id === id);
    if (!m || (m.start === start && m.end === end)) return;
    appDispatch({ type: 'updateMeeting', id, patch: { start, end } });
    withUndo(`${m.title || 'Meeting'} moved to ${sameDay(start, Date.now()) ? 'today' : formatDayLong(start)}, ${formatTime(start)}`);
  };

  const moveDeadline = (eventId: string, due: number) => {
    const roundId = eventId.replace(/^due:/, '');
    const project = data.projects.find((p) => p.rounds.some((r) => r.id === roundId));
    const round = project?.rounds.find((r) => r.id === roundId);
    if (!project || !round || round.startedAt === null) return;
    if (due <= round.startedAt) {
      toast('A deadline has to come after the round starts');
      return;
    }
    dispatch({ type: 'setDeadline', roundId, hours: deadlineHours(round.startedAt, due) }, project.id);
    withUndo(`Round ${project.rounds.indexOf(round) + 1} now closes ${formatDayLong(due)}, ${formatTime(due)}`);
  };

  const removeMeeting = (id: string) => {
    const m = data.meetings.find((x) => x.id === id);
    appDispatch({ type: 'removeMeeting', id });
    setSelectedId(null);
    withUndo(`${m?.title || 'Meeting'} deleted`);
  };

  const nudgeSelected = (minutes: number) => {
    if (!selected) return;
    const start = selected.start + minutes * MINUTE;
    appDispatch({ type: 'updateMeeting', id: selected.id, patch: { start, end: selected.end + minutes * MINUTE } }, `meeting:${selected.id}:keys`);
    if (!days.some((d) => sameDay(d, start))) setAnchor(startOfDay(start));
  };

  const hotkeys = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey) return;
      const k = e.key;
      if (e.altKey && selected) {
        if (k === 'ArrowUp') nudgeSelected(-15);
        else if (k === 'ArrowDown') nudgeSelected(15);
        else if (k === 'ArrowLeft') nudgeSelected(-24 * 60);
        else if (k === 'ArrowRight') nudgeSelected(24 * 60);
        else return;
      } else if (k === 'n' || k === 'N') newMeeting();
      else if (k === 't' || k === 'T') goToday();
      else if (k === 'ArrowLeft' || k === 'j') step(-1);
      else if (k === 'ArrowRight' || k === 'k') step(1);
      else if (k === 'd' || k === 'D') changeView('day');
      else if (k === 'w' || k === 'W') changeView('week');
      else if (k === 'm' || k === 'M') changeView('month');
      else if (k === 'Escape') setSelectedId(null);
      else if ((k === 'Delete' || k === 'Backspace') && selected) removeMeeting(selected.id);
      else return;
      e.preventDefault();
    },
    [selected, view, anchor, days, narrow],
  );
  useHotkeys(hotkeys);

  const busyDays = useMemo(() => new Set(data.meetings.map((m) => startOfDay(m.start))), [data.meetings]);
  const editorOpen = !!selected;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="icon-btn show-sm" aria-label="Open calendar panel" onClick={() => setSidebarOpen(true)}>
            <Icon name="calendar" size={18} />
          </button>
          <h1 className="project-name">Calendar</h1>
          <span className="topbar-clock hide-sm" aria-hidden="true">
            <LiveTime />
          </span>
        </div>
        <ViewSwitch current="calendar" />
        <div className="topbar-right">
          <span className="undo-group hide-sm">
            <button type="button" className="icon-btn icon-btn-md" aria-label="Undo" title={`Undo (${MOD}+Z)`} disabled={!canUndo} onClick={undo}>
              <Icon name="undo" size={17} />
            </button>
            <button type="button" className="icon-btn icon-btn-md" aria-label="Redo" title={`Redo (${MOD}+Shift+Z)`} disabled={!canRedo} onClick={redo}>
              <Icon name="redo" size={17} />
            </button>
          </span>
          <button type="button" className="btn btn-dark" onClick={newMeeting}>
            <Icon name="plus" size={16} strokeWidth={2} />
            <span className="hide-xs">New meeting</span>
            <span className="show-xs">New</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && <div className="scrim show-sm" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
        <aside className={`sidebar cal-sidebar${sidebarOpen ? ' is-drawer-open' : ''}`} aria-label="Calendar tools">
          <div className="sidebar-head show-sm-flex">
            <h2 className="sidebar-title">Calendar</h2>
            <button type="button" className="icon-btn icon-btn-md" aria-label="Close calendar panel" onClick={() => setSidebarOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <LiveClock secondaryZone={prefs.zone} />
          <MiniMonth
            month={miniMonth}
            now={now}
            selectedDays={view === 'month' ? [] : days}
            busyDays={busyDays}
            onMonth={setMiniMonth}
            onPick={(day) => {
              setAnchor(day);
              if (view === 'month') changeView('week');
              setSidebarOpen(false);
            }}
          />
          <Agenda
            meetings={meetings}
            events={events}
            onOpen={(item) => {
              setAnchor(startOfDay(item.at));
              setMiniMonth(startOfMonth(item.at));
              if (view === 'month') changeView('week');
              if (item.meetingId) setSelectedId(item.meetingId);
              setSidebarOpen(false);
            }}
          />
          <PeopleList people={people} />
          <ProjectFilters
            projects={data.projects}
            hidden={hidden}
            colorOf={colorOf}
            onToggle={(id) => updatePrefs({ hidden: hidden.has(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id] })}
          />
          <section aria-label="Second time zone">
            <label className="side-title" htmlFor="tz2">
              Second time zone
            </label>
            <select id="tz2" value={prefs.zone ?? ''} onChange={(e) => updatePrefs({ zone: e.target.value || null })}>
              <option value="">None</option>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </section>
        </aside>

        <main className="cal-main" aria-label="Calendar">
          <div className="cal-toolbar">
            <button type="button" className="btn btn-sm btn-outline" onClick={goToday}>
              Today
            </button>
            <span className="cal-steps">
              <button type="button" className="icon-btn icon-btn-md" aria-label="Previous" onClick={() => step(-1)}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <button type="button" className="icon-btn icon-btn-md" aria-label="Next" onClick={() => step(1)}>
                <Icon name="chevronRight" size={18} />
              </button>
            </span>
            <h2 className="cal-title" aria-live="polite">
              {view === 'week' && narrow ? `${formatDayLong(days[0])} to ${formatDayLong(days[2])}` : rangeTitle(view, anchor)}
            </h2>
            <div className="segmented cal-views" role="radiogroup" aria-label="Calendar view">
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} className={`segment${view === v ? ' is-on' : ''}`} onClick={() => changeView(v)}>
                  {v === 'day' ? 'Day' : v === 'week' ? (narrow ? '3 days' : 'Week') : 'Month'}
                </button>
              ))}
            </div>
          </div>

          <div className="cal-body" key={`${view}:${narrow}`}>
            {view === 'month' ? (
              <MonthGrid
                anchor={anchor}
                now={now}
                meetings={meetings}
                events={events}
                selectedId={selectedId}
                projectColor={colorOf}
                onSelect={setSelectedId}
                onCreate={create}
                onOpenDay={(day) => {
                  setAnchor(day);
                  changeView('day');
                }}
                onMoveToDay={(id, day) => {
                  const m = data.meetings.find((x) => x.id === id);
                  if (!m) return;
                  const start = atMinutes(day, minutesIntoDay(m.start));
                  moveMeeting(id, start, start + (m.end - m.start));
                }}
              />
            ) : (
              <TimeGrid
                days={days}
                meetings={meetings}
                events={events}
                people={people}
                now={now}
                selectedId={selectedId}
                hourHeight={narrow ? 48 : 52}
                secondaryZone={prefs.zone}
                projectColor={colorOf}
                onSelect={setSelectedId}
                onCreate={create}
                onChange={moveMeeting}
                onDeadline={moveDeadline}
                onAddAttendee={(meetingId, personId) => {
                  const m = data.meetings.find((x) => x.id === meetingId);
                  if (!m) return;
                  appDispatch({ type: 'updateMeeting', id: meetingId, patch: { attendeeIds: [...m.attendeeIds, personId] } });
                  withUndo(`${people.find((p) => p.id === personId)?.name ?? 'Someone'} invited to ${m.title || 'the meeting'}`);
                }}
              />
            )}
          </div>
        </main>

        <aside className={`inspector cal-editor${editorOpen ? ' is-open' : ''}`} aria-label="Meeting details">
          {selected ? (
            <div key={selected.id} className="insp-swap">
              <MeetingEditor
                meeting={selected}
                projects={data.projects}
                people={people}
                autoFocusTitle={freshId === selected.id}
                onClose={() => setSelectedId(null)}
                onDelete={removeMeeting}
              />
            </div>
          ) : (
            wide && (
              <div className="inspector-empty cal-empty">
                <Icon name="calendar" size={22} />
                <p>Drag across the grid to book a meeting, or pick one to edit it.</p>
                <p className="insp-sub">
                  Press <kbd>N</kbd> for a new meeting, <kbd>?</kbd> for all shortcuts.
                </p>
              </div>
            )
          )}
        </aside>
      </div>
      <BottomTabs current="calendar" />
    </div>
  );
}

function LiveTime() {
  const now = useNow(1000);
  return <>{new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</>;
}

export { navigate };
