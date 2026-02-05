import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ThemeMode, ThemeName } from '@/lib/themes';
import { getTheme } from '@/lib/themes';

interface ThemeContextType {
  theme: ThemeName;
  mode: ThemeMode;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  // Meteor transition
  isTransitioning: boolean;
  pendingMode: ThemeMode | null;
  oldMode: ThemeMode | null;
  applyPendingTheme: () => void;
  onTransitionComplete: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'youwee-theme';
const MODE_KEY = 'youwee-mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(THEME_KEY) as ThemeName) || 'ocean';
    }
    return 'ocean';
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MODE_KEY) as ThemeMode;
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  // Meteor transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pendingMode, setPendingMode] = useState<ThemeMode | null>(null);
  const [oldMode, setOldMode] = useState<ThemeMode | null>(null);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  };

  const setMode = useCallback(
    (newMode: ThemeMode) => {
      // If same mode, do nothing
      if (newMode === mode) return;

      // Start meteor transition - save old mode for the shrinking overlay
      setOldMode(mode);
      setIsTransitioning(true);
      setPendingMode(newMode);
    },
    [mode],
  );

  // Apply theme immediately when reveal starts (called from MeteorTransition)
  const applyPendingTheme = useCallback(() => {
    if (pendingMode) {
      setModeState(pendingMode);
      localStorage.setItem(MODE_KEY, pendingMode);
    }
  }, [pendingMode]);

  const onTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
    setPendingMode(null);
    setOldMode(null);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  // Apply theme CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const themeConfig = getTheme(theme);
    const colors = themeConfig.colors[mode];
    const gradient = themeConfig.gradient[mode];

    // Toggle dark class
    root.classList.toggle('dark', mode === 'dark');

    // Apply theme colors
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--primary-foreground', colors.primaryForeground);
    root.style.setProperty('--accent', colors.accent);
    root.style.setProperty('--accent-foreground', colors.accentForeground);
    root.style.setProperty('--ring', colors.primary);

    // Apply gradient colors
    root.style.setProperty('--gradient-from', gradient.from);
    root.style.setProperty('--gradient-via', gradient.via || gradient.from);
    root.style.setProperty('--gradient-to', gradient.to);

    // Set theme attribute for additional styling
    root.setAttribute('data-theme', theme);
  }, [theme, mode]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        setTheme,
        setMode,
        toggleMode,
        isTransitioning,
        pendingMode,
        oldMode,
        applyPendingTheme,
        onTransitionComplete,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
