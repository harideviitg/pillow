import type { AspectId, NudgeChannel, RoundKind } from './types';

export const ASPECTS: { id: AspectId; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'copy', label: 'Copy' },
  { id: 'imagery', label: 'Imagery' },
  { id: 'color', label: 'Color' },
];

export function aspectLabel(id: AspectId): string {
  return ASPECTS.find((a) => a.id === id)?.label ?? id;
}

export interface RoundKindDef {
  kind: RoundKind;
  label: string;
  focus: AspectId[];
  lockOnApprove: AspectId[];
}

export const ROUND_KINDS: RoundKindDef[] = [
  { kind: 'direction', label: 'Direction', focus: ['color'], lockOnApprove: ['color'] },
  { kind: 'layout', label: 'Layout', focus: ['layout'], lockOnApprove: ['layout'] },
  { kind: 'copy', label: 'Copy', focus: ['copy'], lockOnApprove: ['copy'] },
  { kind: 'polish', label: 'Polish', focus: ['imagery'], lockOnApprove: ['imagery'] },
];

export function roundKindDef(kind: RoundKind): RoundKindDef {
  const def = ROUND_KINDS.find((k) => k.kind === kind);
  if (!def) throw new Error(`Unknown round kind: ${kind}`);
  return def;
}

export type RuleBlock = 'final-say' | 'lock-layer' | 'deadline' | 'extra-round';

export const RULE_BLOCKS: { id: RuleBlock; label: string }[] = [
  { id: 'final-say', label: 'Final say' },
  { id: 'lock-layer', label: 'Lock layer' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'extra-round', label: 'Extra round' },
];

export const NUDGE_BLOCKS: { id: NudgeChannel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

export function channelLabel(channel: NudgeChannel): string {
  return channel === 'email' ? 'Email' : 'WhatsApp';
}

export type Block =
  | { type: 'round'; kind: RoundKind }
  | { type: 'rule'; rule: RuleBlock }
  | { type: 'nudge'; channel: NudgeChannel };

export function blockLabel(block: Block): string {
  switch (block.type) {
    case 'round':
      return roundKindDef(block.kind).label;
    case 'rule':
      return RULE_BLOCKS.find((r) => r.id === block.rule)!.label;
    case 'nudge':
      return channelLabel(block.channel);
  }
}

export const DEADLINE_OPTIONS = [24, 48, 72, 168];
export const NUDGE_HOUR_OPTIONS = [12, 24, 48];
export const DEFAULT_DEADLINE_HOURS = 48;
export const DEFAULT_NUDGE_HOURS = 24;
export const DEFAULT_REVISIONS = 2;
export const DEFAULT_EXTRA_ROUND_DAYS = 2;

export function hoursLabel(hours: number): string {
  if (hours % 24 === 0 && hours >= 168) return hours === 168 ? '1 week' : `${hours / 168} weeks`;
  return `${hours} hours`;
}
