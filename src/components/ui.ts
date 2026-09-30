import type { Block, RuleBlock } from '../domain/catalog';
import type { AspectId, NudgeChannel, RoundKind } from '../domain/types';
import type { IconName } from './Icon';

export const ROUND_ICON: Record<RoundKind, IconName> = {
  direction: 'compass',
  layout: 'layout',
  copy: 'type',
  polish: 'pen',
};

export const ASPECT_ICON: Record<AspectId, IconName> = {
  layout: 'layout',
  copy: 'type',
  imagery: 'image',
  color: 'drop',
};

export const RULE_ICON: Record<RuleBlock, IconName> = {
  'final-say': 'branch',
  'lock-layer': 'lock',
  deadline: 'clock',
  'extra-round': 'plusCircle',
};

export const NUDGE_ICON: Record<NudgeChannel, IconName> = {
  email: 'mail',
  whatsapp: 'chat',
};

export function blockIcon(block: Block): IconName {
  switch (block.type) {
    case 'round':
      return ROUND_ICON[block.kind];
    case 'rule':
      return RULE_ICON[block.rule];
    case 'nudge':
      return NUDGE_ICON[block.channel];
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
