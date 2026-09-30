import { useId, useState } from 'react';
import { aspectLabel, roundKindDef } from '../domain/catalog';
import { personName } from '../domain/reducer';
import type { Project } from '../domain/types';
import { Modal } from './Modal';
import { joinList } from './ui';

export function ApproveModal({ project, roundId, onApprove, onClose }: { project: Project; roundId: string; onApprove: (note: string) => void; onClose: () => void }) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const index = project.rounds.findIndex((r) => r.id === roundId);
  const round = project.rounds[index];
  if (!round) return null;
  const next = project.rounds[index + 1];
  const locks = round.lockOnApprove.map((a) => aspectLabel(a).toLowerCase());
  const decider = round.finalSayId ? personName(project, round.finalSayId) : 'The team';

  return (
    <Modal title={`Record approval for Round ${index + 1}: ${roundKindDef(round.kind).label}`} onClose={onClose} width={480}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          onApprove(note);
        }}
      >
        <p className="form-help">
          {decider} approves this round.
          {locks.length > 0 && ` ${joinList(locks).replace(/^./, (c) => c.toUpperCase())} locks.`}
          {next ? ` Round ${index + 2}: ${roundKindDef(next.kind).label} goes live.` : ' That signs off the whole flow.'}
        </p>
        <label htmlFor={noteId}>Decision note (optional)</label>
        <textarea id={noteId} rows={3} value={note} placeholder="e.g. Picked B: warm type, full-bleed photo" onChange={(e) => setNote(e.target.value)} data-autofocus />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark">
            Approve round
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PersonModal({ onSave, onClose }: { onSave: (name: string, role: string) => void; onClose: () => void }) {
  const nameId = useId();
  const roleId = useId();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  return (
    <Modal title="Add someone new" onClose={onClose} width={420}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), role.trim());
        }}
      >
        <label htmlFor={nameId}>Name</label>
        <input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" data-autofocus />
        <label htmlFor={roleId}>Role</label>
        <input id={roleId} type="text" value={role} placeholder="e.g. Brand head" onChange={(e) => setRole(e.target.value)} autoComplete="off" />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark" disabled={!name.trim()}>
            Add reviewer
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NewProjectModal({ onCreate, onClose }: { onCreate: (client: string, name: string) => void; onClose: () => void }) {
  const clientId = useId();
  const nameId = useId();
  const [client, setClient] = useState('');
  const [name, setName] = useState('');
  return (
    <Modal title="New project" onClose={onClose} width={440}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (client.trim() && name.trim()) onCreate(client.trim(), name.trim());
        }}
      >
        <p className="form-help">You get a four round flow to start from: direction, layout, copy and polish.</p>
        <label htmlFor={clientId}>Client</label>
        <input id={clientId} type="text" value={client} onChange={(e) => setClient(e.target.value)} required autoComplete="off" data-autofocus />
        <label htmlFor={nameId}>Project</label>
        <input id={nameId} type="text" value={name} placeholder="e.g. Diwali menu poster" onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark" disabled={!client.trim() || !name.trim()}>
            Create project
          </button>
        </div>
      </form>
    </Modal>
  );
}
