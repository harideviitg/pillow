import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastFn = (text: string, action?: { label: string; run: () => void }) => void;

const Ctx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; key: number; action?: { label: string; run: () => void } } | null>(null);
  const timer = useRef(0);

  const show = useCallback<ToastFn>((text, action) => {
    window.clearTimeout(timer.current);
    setToast({ text, key: Date.now(), action });
    timer.current = window.setTimeout(() => setToast(null), action ? 4500 : 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toast && (
            <div key={toast.key} className="toast">
              <span>{toast.text}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.run();
                    setToast(null);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
