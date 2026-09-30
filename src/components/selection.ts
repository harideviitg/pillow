export type NodeSelection =
  | { type: 'trigger' }
  | { type: 'round' | 'gate' | 'lock' | 'revise'; roundId: string };

export function selectionKey(sel: NodeSelection | null): string | null {
  if (!sel) return null;
  if (sel.type === 'trigger') return 'trigger';
  return sel.type === 'round' ? sel.roundId : `${sel.roundId}:${sel.type}`;
}
