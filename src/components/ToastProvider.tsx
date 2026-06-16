import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Alert, AlertGroup, AlertActionCloseButton } from "@patternfly/react-core";
import "./ToastProvider.css";

export type ToastVariant = "success" | "danger" | "warning" | "info";

interface Toast {
  id: number;
  variant: ToastVariant;
  title: string;
  body?: string;
}

interface ToastContextValue {
  addToast: (variant: ToastVariant, title: string, body?: string) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  warn: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((variant: ToastVariant, title: string, body?: string) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, variant, title, body }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const success = useCallback((title: string, body?: string) => addToast("success", title, body), [addToast]);
  const error = useCallback((title: string, body?: string) => addToast("danger", title, body), [addToast]);
  const warn = useCallback((title: string, body?: string) => addToast("warning", title, body), [addToast]);
  const info = useCallback((title: string, body?: string) => addToast("info", title, body), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, success, error, warn, info }}>
      {children}
      <AlertGroup isToast isLiveRegion className="cc-toast-group">
        {toasts.map(t => (
          <Alert
            key={t.id}
            variant={t.variant}
            title={t.title}
            timeout={AUTO_DISMISS_MS}
            onTimeout={() => dismiss(t.id)}
            actionClose={<AlertActionCloseButton onClose={() => dismiss(t.id)} />}
          >
            {t.body}
          </Alert>
        ))}
      </AlertGroup>
    </ToastContext.Provider>
  );
}

const NOOP_TOAST: ToastContextValue = {
  addToast: () => {},
  success: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
};

export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? NOOP_TOAST;
}
