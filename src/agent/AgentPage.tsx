import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { uid } from '../store/reducer';
import { useStore, useViewState } from '../store/store';
import { BookingIcon, CheckIcon, FlagIcon, SendIcon, SparkIcon, TasksIcon, UndoIcon } from '../ui/icons';
import { offlineBrain, type Brain, type Step } from './brain';

interface Message {
  id: string;
  from: 'you' | 'pip';
  text: string;
  steps?: (Step & { undone?: boolean })[];
}

const HELLO: Message = {
  id: 'hello',
  from: 'pip',
  text: "Hey, I'm Pip. I keep your tasks, sessions and deadlines in line. Tell me what's on your mind, like \"add call mum due friday\" or \"plan my day\".",
};

const SUGGESTIONS = ['Plan my day', "What's due this week?", 'Block 2h tomorrow at 10 for deep work', 'Add water the plants'];

const STEP_ICON = {
  task: <TasksIcon size={13} />,
  session: <BookingIcon size={13} />,
  due: <FlagIcon size={11} />,
  done: <CheckIcon size={12} strokeWidth={3} />,
};

const STEP_LABEL = { task: 'Added task', session: 'Blocked time', due: 'Set deadline', done: 'Ticked off' };

export function AgentPage({ brain = offlineBrain }: { brain?: Brain }) {
  const { data, dispatch } = useStore();
  const [messages, setMessages] = useViewState<Message[]>('chat', [HELLO]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thinking]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text: string) => {
    const said = text.trim();
    if (!said || thinking) return;
    setDraft('');
    setMessages((m) => [...m, { id: uid('m'), from: 'you' as const, text: said }].slice(-80));
    setThinking(true);
    // A small pause so it reads like a reply, not a lookup.
    await new Promise((r) => setTimeout(r, 450 + Math.random() * 450));
    const answer = await brain.reply(said, { data: dataRef.current, now: Date.now() });
    if (answer.steps.length) dispatch({ type: 'batch', actions: answer.steps.map((s) => s.apply) });
    setMessages((m) => [...m, { id: uid('m'), from: 'pip' as const, text: answer.text, steps: answer.steps }].slice(-80));
    setThinking(false);
  };

  const undoStep = (messageId: string, index: number) => {
    const message = messages.find((m) => m.id === messageId);
    const step = message?.steps?.[index];
    if (!step || step.undone) return;
    dispatch(step.revert);
    setMessages((list) => list.map((m) => (m.id === messageId ? { ...m, steps: m.steps?.map((s, i) => (i === index ? { ...s, undone: true } : s)) } : m)));
  };

  return (
    <div className="page">
      <header className="page-bar">
        <div className="page-bar-left">
          <span className="pip-avatar is-small" aria-hidden="true">
            <SparkIcon size={14} />
          </span>
          <h1 className="page-title">Pip</h1>
          <span className="status-pill" title="Pip runs on simple rules for now. A real model can be plugged in later.">
            Offline mode
          </span>
        </div>
        <button type="button" className="tool-btn" onClick={() => setMessages([HELLO])}>
          New chat
        </button>
      </header>

      <div className="chat" ref={listRef}>
        <div className="chat-inner">
          {messages.map((m) => (
            <div key={m.id} className={`msg is-${m.from}`}>
              {m.from === 'pip' && (
                <span className="pip-avatar" aria-hidden="true">
                  <SparkIcon size={15} />
                </span>
              )}
              <div className="msg-body">
                <p className="msg-text">{m.text}</p>
                {m.steps && m.steps.length > 0 && (
                  <ul className="steps">
                    {m.steps.map((s, i) => (
                      <li key={i} className={`step kind-${s.kind}${s.undone ? ' is-undone' : ''}`}>
                        <span className="step-icon">{STEP_ICON[s.kind]}</span>
                        <span className="step-text">
                          <span className="step-kind">{STEP_LABEL[s.kind]}</span>
                          <span className="step-label">{s.label}</span>
                        </span>
                        {s.undone ? (
                          <span className="step-undone">Undone</span>
                        ) : (
                          <button type="button" className="step-undo" onClick={() => undoStep(m.id, i)}>
                            <UndoIcon />
                            Undo
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="msg is-pip">
              <span className="pip-avatar" aria-hidden="true">
                <SparkIcon size={15} />
              </span>
              <div className="typing" aria-label="Pip is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        {messages.length <= 2 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="suggestion" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder="Ask Pip to add, block, plan or check something"
            aria-label="Message Pip"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button type="submit" className="send" aria-label="Send" disabled={!draft.trim() || thinking}>
            <SendIcon size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
