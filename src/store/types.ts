import type { DayKey } from '../lib/time';

export type Tone = 'green' | 'blue' | 'violet' | 'amber' | 'coral';

export const TONES: Record<Tone, { bar: string; fill: string; ink: string }> = {
  green: { bar: '#2e9b5f', fill: '#dff2e6', ink: '#1d5e3a' },
  blue: { bar: '#3b7be8', fill: '#dfe9fb', ink: '#1f4a94' },
  violet: { bar: '#7a5ae0', fill: '#ebe4fb', ink: '#4a3294' },
  amber: { bar: '#d98b1a', fill: '#fbecd2', ink: '#7a4b08' },
  coral: { bar: '#e8604c', fill: '#fde3dd', ink: '#8c2f20' },
};

export const TONE_ORDER: Tone[] = ['violet', 'green', 'blue', 'coral', 'amber'];

export interface Task {
  id: string;
  title: string;
  done: boolean;
  /** Tasks grouped on the flow canvas belong to a project. */
  projectId: string | null;
  due: DayKey | null;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  tone: Tone;
  due: DayKey | null;
  createdAt: number;
}

/**
 * A block on the calendar. A session is time set aside for a task or a
 * project; an event is anything else (a meeting, the gym).
 */
export interface CalItem {
  id: string;
  kind: 'session' | 'event';
  taskId: string | null;
  projectId: string | null;
  /** Events keep their own title; sessions show their task's or project's. */
  title: string;
  day: DayKey;
  start: number;
  length: number;
  tone: Tone;
}

/** Where a task's card sits on the flow canvas. */
export interface FlowNode {
  taskId: string;
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

export interface Data {
  version: 1;
  tasks: Task[];
  projects: Project[];
  items: CalItem[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Something that can be dragged out of the tray: a task or a whole project. */
export type TrayRef = { kind: 'task'; id: string } | { kind: 'project'; id: string };
