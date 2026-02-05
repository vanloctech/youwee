import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import { App } from './App.tsx';

// Disable context menu and reload shortcuts in production
if (import.meta.env.PROD) {
  // Block right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Block keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // F5 - Reload
    if (e.key === 'F5') {
      e.preventDefault();
    }
    // Ctrl+R or Cmd+R - Reload
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
    }
    // Ctrl+Shift+R or Cmd+Shift+R - Hard reload
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault();
    }
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
