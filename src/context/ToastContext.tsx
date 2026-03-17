
import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastContainer, ToastMessage, ToastType } from '../components/Toast';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  /** Show a toast with an undo/action button */
  showUndoToast: (title: string, onUndo: () => void, message?: string, duration?: number) => void;
  /** Show a toast with a custom action button */
  showActionToast: (type: ToastType, title: string, action: ToastAction, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastType, title: string, message?: string, duration = 5000) => {
    const id = crypto.randomUUID();
    const newToast: ToastMessage = { id, type, title, message, duration };

    // Add to top of stack
    setToasts(prev => [newToast, ...prev]);
  }, []);

  const showUndoToast = useCallback((title: string, onUndo: () => void, message?: string, duration = 8000) => {
    const id = crypto.randomUUID();
    const newToast: ToastMessage = {
      id,
      type: 'info',
      title,
      message,
      duration,
      action: { label: 'Undo', onClick: onUndo },
    };
    setToasts(prev => [newToast, ...prev]);
  }, []);

  const showActionToast = useCallback((type: ToastType, title: string, action: ToastAction, message?: string, duration = 8000) => {
    const id = crypto.randomUUID();
    const newToast: ToastMessage = { id, type, title, message, duration, action };
    setToasts(prev => [newToast, ...prev]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showUndoToast, showActionToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};
