import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ToastAction {
  label: string;
  onClick: () => void;
}

type ToastFn = (message: string, options?: { action?: ToastAction }) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; key: number; action?: ToastAction } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback<ToastFn>((text, options) => {
    window.clearTimeout(timer.current);
    setMessage({ text, key: Date.now(), action: options?.action });
    timer.current = window.setTimeout(() => setMessage(null), options?.action ? 5000 : 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
      <div className="toast-region" role="status" aria-live="polite">
        {message && (
          <div key={message.key} className="toast">
            <span>{message.text}</span>
            {message.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  message.action!.onClick();
                  setMessage(null);
                }}
              >
                {message.action.label}
              </button>
            )}
          </div>
        )}
      </div>,
      document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
