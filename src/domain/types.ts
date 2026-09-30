/** A local calendar day, written as YYYY-MM-DD. */
export type DayKey = string;

export interface Project {
  id: string;
  name: string;
  /** Where you stopped, in your own words, so future you can pick it back up. */
  leftOffAt: string;
  leftOffAtUpdated: number | null;
  archived: boolean;
  createdAt: number;
}

/** A checklist item. Without a project it sits in the inbox. */
export interface Task {
  id: string;
  text: string;
  projectId: string | null;
  done: boolean;
  doneAt: number | null;
  due: DayKey | null;
  createdAt: number;
}

/** Something parked on an agent, a deploy, a review or a person. */
export interface Wait {
  id: string;
  text: string;
  projectId: string | null;
  since: number;
  doneAt: number | null;
}

export interface Block {
  id: string;
  title: string;
  start: number;
  end: number;
  projectId: string | null;
}

export type RoutineKind = 'start' | 'shutdown' | 'custom';

export interface Step {
  id: string;
  text: string;
}

export interface Routine {
  id: string;
  name: string;
  kind: RoutineKind;
  steps: Step[];
  /** Steps ticked on one day; a new day starts empty. */
  progress: { day: DayKey; done: string[] };
  /** Days every step was ticked. */
  completions: DayKey[];
}

export interface Data {
  version: 1;
  projects: Project[];
  tasks: Task[];
  waits: Wait[];
  blocks: Block[];
  routines: Routine[];
}
