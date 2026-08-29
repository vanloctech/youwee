import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Page } from './Sidebar';
import { Sidebar } from './Sidebar';

const isMacOS = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const isWindows = typeof navigator !== 'undefined' && navigator.platform.includes('Win');

/** Windows-only window control buttons (minimize / maximize-restore / close). */
function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win
      .isMaximized()
      .then(setMaximized)
      .catch(() => {});

    const unlisten = win.onResized(() => {
      win
        .isMaximized()
        .then(setMaximized)
        .catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const btnBase =
    'w-[46px] h-full inline-flex items-center justify-center text-foreground/80 transition-colors';

  return (
    <div className="flex h-8 shrink-0">
      <button
        type="button"
        onClick={() => getCurrentWindow().minimize()}
        className={`${btnBase} hover:bg-foreground/10`}
      >
        {/* Minimize icon */}
        <svg width="10" height="1" viewBox="0 0 10 1" className="fill-current" aria-hidden="true">
          <rect width="10" height="1" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => getCurrentWindow().toggleMaximize()}
        className={`${btnBase} hover:bg-foreground/10`}
      >
        {maximized ? (
          /* Restore icon (two overlapping rectangles) */
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="fill-none stroke-current"
            strokeWidth="1"
            aria-hidden="true"
          >
            <rect x="0" y="2.5" width="7.5" height="7.5" />
            <polyline points="2.5,2.5 2.5,0 10,0 10,7.5 7.5,7.5" />
          </svg>
        ) : (
          /* Maximize icon */
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="fill-none stroke-current"
            strokeWidth="1"
            aria-hidden="true"
          >
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={() => getCurrentWindow().close()}
        className={`${btnBase} hover:bg-red-500 hover:text-white`}
      >
        {/* Close icon */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="fill-none stroke-current"
          strokeWidth="1.2"
          aria-hidden="true"
        >
          <line x1="0" y1="0" x2="10" y2="10" />
          <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
      </button>
    </div>
  );
}

interface MainLayoutProps {
  children: ReactNode;
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export function MainLayout({ children, currentPage, onPageChange }: MainLayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-background relative">
      {/* macOS: transparent drag region for overlay title bar */}
      {isMacOS && (
        <div data-tauri-drag-region className="absolute top-0 left-0 right-0 z-30 h-10" />
      )}

      {/* Windows: custom title bar replacing native decorations */}
      {isWindows && (
        <div className="absolute top-0 left-0 right-0 z-30 h-8 flex" dir="ltr">
          {/* Drag area — fills remaining space, separate from buttons */}
          <div
            role="toolbar"
            data-tauri-drag-region
            className="flex-1 h-full"
            onDoubleClick={() => getCurrentWindow().toggleMaximize()}
          />
          {/* Window controls — NOT inside the drag region */}
          <WindowControls />
        </div>
      )}

      {/* Animated gradient background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse 100% 80% at 10% -30%, hsl(var(--gradient-from) / 0.15), transparent 50%),
            radial-gradient(ellipse 80% 60% at 90% 10%, hsl(var(--gradient-via) / 0.12), transparent 50%),
            radial-gradient(ellipse 60% 40% at 50% 110%, hsl(var(--gradient-to) / 0.10), transparent 50%)
          `,
        }}
      />

      {/* Main container - unified floating panel */}
      <div
        className="relative z-10 flex-1 flex min-w-0 p-3 gap-3"
        style={isMacOS || isWindows ? { paddingTop: isMacOS ? '2.6rem' : '2rem' } : undefined}
      >
        {/* Sidebar */}
        <Sidebar currentPage={currentPage} onPageChange={onPageChange} />

        {/* Content area */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-2xl bg-card/30 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.05] shadow-[0_8px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
          {children}
        </main>
      </div>
    </div>
  );
}
