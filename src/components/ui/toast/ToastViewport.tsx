import { ToastItem } from './ToastItem';
import type { ToastRecord } from './toast.types';

interface ToastViewportProps {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss, onPause, onResume }: ToastViewportProps) {
  return (
    <div className="pointer-events-none fixed end-4 top-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onPause={onPause}
          onResume={onResume}
        />
      ))}
    </div>
  );
}
