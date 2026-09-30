import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { snooze, touch, type Session } from '../domain/session';

const KEY = 'pillow:session';

function read(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function write(session: Session): Session {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Only the break nudge depends on this.
  }
  return session;
}

interface SessionValue {
  session: Session | null;
  snooze: () => void;
}

const SessionContext = createContext<SessionValue>({ session: null, snooze: () => {} });

/** Tracks how long you've been going, from clicks and key presses, for the break nudge. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(read);

  useEffect(() => {
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 60_000) return;
      last = now;
      setSession((s) => write(touch(s, now)));
    };
    onActivity();
    window.addEventListener('pointerdown', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    return () => {
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
    };
  }, []);

  const snoozeNow = useCallback(() => setSession((s) => (s ? write(snooze(s, Date.now())) : s)), []);
  const value = useMemo(() => ({ session, snooze: snoozeNow }), [session, snoozeNow]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
