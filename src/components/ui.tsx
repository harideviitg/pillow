import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../domain/types';

const COLORS = 6;

/** Each project gets one of a few soft colours, stable for its id. */
export function projectColor(id: string | null): string {
  if (!id) return 'var(--faint)';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `var(--c${(Math.abs(h) % COLORS) + 1})`;
}

export function ProjectTag({ project, fallback }: { project: Project | null; fallback?: string }) {
  if (!project && !fallback) return null;
  return (
    <span className="tag">
      <span className="dot" style={{ background: projectColor(project?.id ?? null) }} />
      <span className="tag-name">{project?.name ?? fallback}</span>
    </span>
  );
}

export function Section({ title, count, action, children, className = '' }: { title: string; count?: number | string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className}`}>
      <header className="section-head">
        <h2>
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A round checkbox with a check that draws itself in. */
export function Check({ checked, onChange, label, size = 'md' }: { checked: boolean; onChange: () => void; label: string; size?: 'md' | 'lg' }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={`check check-${size}${checked ? ' is-on' : ''}`} onClick={onChange}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 12.5l4 4 8-9" />
      </svg>
    </button>
  );
}

/** A text field that looks like plain text until you use it; saves on blur or Enter. */
export function InlineText({
  value,
  onSave,
  label,
  className = '',
  placeholder,
  multiline = false,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  useAutosize(multiline ? ref : null, draft);

  const commit = () => {
    editing.current = false;
    const next = draft.trim();
    if (!next && !multiline) {
      setDraft(value);
      return;
    }
    if (next !== value) onSave(next);
  };

  const props = {
    ref,
    value: draft,
    'aria-label': label,
    placeholder,
    className: `inline-text ${className}`,
    onFocus: () => {
      editing.current = true;
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setDraft(value);
        editing.current = false;
        requestAnimationFrame(() => ref.current?.blur());
      }
    },
  };
  return multiline ? <textarea rows={1} {...props} /> : <input type="text" autoComplete="off" {...props} />;
}

export function useAutosize(ref: React.RefObject<HTMLTextAreaElement | null> | null, value: string) {
  useLayoutEffect(() => {
    const el = ref?.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

/** An always-there input for adding the next row; Enter adds and keeps focus for the one after. */
export function AddRow({ placeholder, onAdd, label, autoFocus }: { placeholder: string; onAdd: (text: string) => void; label: string; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        onAdd(t);
        setText('');
      }}
    >
      <span className="add-plus" aria-hidden="true">
        +
      </span>
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={label} autoComplete="off" autoFocus={autoFocus} />
    </form>
  );
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}
