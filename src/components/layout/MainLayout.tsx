import type { ReactNode } from 'react';
import type { Page } from './Sidebar';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: ReactNode;
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export function MainLayout({ children, currentPage, onPageChange }: MainLayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-background relative">
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
      <div className="relative z-10 flex-1 flex p-3 gap-3">
        {/* Sidebar */}
        <Sidebar currentPage={currentPage} onPageChange={onPageChange} />

        {/* Content area */}
        <main className="flex-1 flex flex-col overflow-hidden rounded-2xl bg-card/30 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.05] shadow-[0_8px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
          {children}
        </main>
      </div>
    </div>
  );
}
