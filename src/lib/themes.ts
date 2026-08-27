export type ThemeName =
  | 'midnight'
  | 'sunny'
  | 'rain'
  | 'aurora'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'candy'
  | 'custom';
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
}

export interface GradientColors {
  from: string;
  via?: string;
  to: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  emoji: string;
  gradient: {
    light: GradientColors;
    dark: GradientColors;
  };
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}

export const CUSTOM_THEME_KEY = 'youwee-custom-theme';
export const LEGACY_CUSTOM_THEME_KEY = 'weeb-custom-theme';

export const themes: Theme[] = [
  {
    name: 'midnight',
    label: 'Midnight',
    emoji: '🌙',
    gradient: {
      light: { from: '221 83% 55%', via: '260 80% 60%', to: '26 100% 55%' },
      dark: { from: '221 90% 40%', via: '260 85% 45%', to: '26 100% 48%' },
    },
    colors: {
      light: {
        primary: '221 83% 53%',
        primaryForeground: '0 0% 100%',
        accent: '26 100% 95%',
        accentForeground: '26 90% 40%',
      },
      dark: {
        primary: '218 91% 60%',
        primaryForeground: '0 0% 100%',
        accent: '26 60% 14%',
        accentForeground: '26 100% 70%',
      },
    },
  },
  {
    name: 'sunny',
    label: 'Sunny',
    emoji: '☀️',
    gradient: {
      light: { from: '35 95% 55%', via: '45 100% 52%', to: '15 90% 55%' },
      dark: { from: '35 90% 40%', via: '45 95% 42%', to: '15 88% 40%' },
    },
    colors: {
      light: {
        primary: '38 92% 50%',
        primaryForeground: '0 0% 100%',
        accent: '45 100% 93%',
        accentForeground: '38 90% 35%',
      },
      dark: {
        primary: '42 95% 55%',
        primaryForeground: '30 100% 10%',
        accent: '40 60% 16%',
        accentForeground: '42 95% 80%',
      },
    },
  },
  {
    name: 'rain',
    label: 'Rain',
    emoji: '🌧️',
    gradient: {
      light: { from: '220 45% 50%', via: '200 40% 48%', to: '240 30% 42%' },
      dark: { from: '220 50% 35%', via: '205 45% 34%', to: '240 35% 30%' },
    },
    colors: {
      light: {
        primary: '215 40% 45%',
        primaryForeground: '0 0% 100%',
        accent: '215 45% 92%',
        accentForeground: '215 50% 30%',
      },
      dark: {
        primary: '215 45% 62%',
        primaryForeground: '215 60% 10%',
        accent: '215 35% 16%',
        accentForeground: '215 45% 85%',
      },
    },
  },
  {
    name: 'aurora',
    label: 'Aurora',
    emoji: '🌌',
    gradient: {
      light: { from: '160 80% 45%', via: '190 85% 50%', to: '220 80% 55%' },
      dark: { from: '160 90% 30%', via: '190 95% 35%', to: '220 90% 40%' },
    },
    colors: {
      light: {
        primary: '175 80% 40%',
        primaryForeground: '0 0% 100%',
        accent: '180 60% 94%',
        accentForeground: '175 80% 25%',
      },
      dark: {
        primary: '175 85% 50%',
        primaryForeground: '180 100% 10%',
        accent: '180 40% 18%',
        accentForeground: '175 85% 80%',
      },
    },
  },
  {
    name: 'ocean',
    label: 'Ocean',
    emoji: '🌊',
    gradient: {
      light: { from: '200 90% 50%', via: '215 85% 55%', to: '230 80% 60%' },
      dark: { from: '200 95% 35%', via: '215 90% 40%', to: '230 85% 45%' },
    },
    colors: {
      light: {
        primary: '215 90% 55%',
        primaryForeground: '0 0% 100%',
        accent: '210 80% 95%',
        accentForeground: '215 90% 30%',
      },
      dark: {
        primary: '215 95% 60%',
        primaryForeground: '215 100% 10%',
        accent: '215 50% 18%',
        accentForeground: '215 95% 85%',
      },
    },
  },
  {
    name: 'forest',
    label: 'Forest',
    emoji: '🌲',
    gradient: {
      light: { from: '140 70% 40%', via: '160 65% 45%', to: '175 60% 42%' },
      dark: { from: '140 75% 28%', via: '160 70% 32%', to: '175 65% 30%' },
    },
    colors: {
      light: {
        primary: '152 75% 40%',
        primaryForeground: '0 0% 100%',
        accent: '150 50% 94%',
        accentForeground: '152 75% 25%',
      },
      dark: {
        primary: '152 80% 48%',
        primaryForeground: '150 100% 10%',
        accent: '150 40% 16%',
        accentForeground: '152 80% 80%',
      },
    },
  },
  {
    name: 'sunset',
    label: 'Sunset',
    emoji: '🌇',
    gradient: {
      light: { from: '15 90% 55%', via: '35 95% 55%', to: '45 90% 50%' },
      dark: { from: '15 85% 40%', via: '35 90% 42%', to: '45 85% 38%' },
    },
    colors: {
      light: {
        primary: '25 95% 53%',
        primaryForeground: '0 0% 100%',
        accent: '30 100% 95%',
        accentForeground: '25 95% 30%',
      },
      dark: {
        primary: '30 95% 55%',
        primaryForeground: '30 100% 10%',
        accent: '25 50% 18%',
        accentForeground: '30 95% 80%',
      },
    },
  },
  {
    name: 'candy',
    label: 'Candy',
    emoji: '🍬',
    gradient: {
      light: { from: '330 85% 60%', via: '350 80% 65%', to: '10 85% 60%' },
      dark: { from: '330 90% 42%', via: '350 85% 48%', to: '10 90% 45%' },
    },
    colors: {
      light: {
        primary: '340 85% 55%',
        primaryForeground: '0 0% 100%',
        accent: '340 70% 96%',
        accentForeground: '340 85% 30%',
      },
      dark: {
        primary: '340 90% 60%',
        primaryForeground: '0 0% 100%',
        accent: '340 50% 18%',
        accentForeground: '340 90% 85%',
      },
    },
  },
];

export type CustomPalette = {
  primary: string; // "H S% L%"
  accent: string; // "H S% L%"
};

export function hexToHsl(hex: string): string {
  let hx = hex.replace('#', '');
  if (hx.length === 3) {
    hx = hx
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(hx.slice(0, 2), 16) / 255;
  const g = parseInt(hx.slice(2, 4), 16) / 255;
  const b = parseInt(hx.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const S = Math.round(s * 100);
  const L = Math.round(l * 100);
  return `${h} ${S}% ${L}%`;
}

export function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function getCustomPalette(): CustomPalette | null {
  if (typeof window === 'undefined') return null;
  try {
    let raw = window.localStorage.getItem(CUSTOM_THEME_KEY);
    if (!raw) {
      // Migrate the pre-rebrand key if present
      const legacyRaw = window.localStorage.getItem(LEGACY_CUSTOM_THEME_KEY);
      if (legacyRaw) {
        window.localStorage.setItem(CUSTOM_THEME_KEY, legacyRaw);
        window.localStorage.removeItem(LEGACY_CUSTOM_THEME_KEY);
        raw = legacyRaw;
      }
    }
    if (!raw) return null;
    return JSON.parse(raw) as CustomPalette;
  } catch {
    return null;
  }
}

export function saveCustomPalette(palette: CustomPalette): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(palette));
}

export function buildCustomTheme(palette: CustomPalette): Theme {
  const { primary, accent } = palette;
  const pMatch = primary.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  const aMatch = accent.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  const pH = pMatch ? pMatch[1] : '221';
  const pS = pMatch ? pMatch[2] : '83';
  const aH = aMatch ? aMatch[1] : '26';
  const aS = aMatch ? aMatch[2] : '100';
  return {
    name: 'custom',
    label: 'Custom',
    emoji: '🎨',
    gradient: {
      light: { from: `${pH} ${pS}% 55%`, via: '260 60% 60%', to: `${aH} ${aS}% 55%` },
      dark: { from: `${pH} ${pS}% 40%`, via: '260 65% 40%', to: `${aH} ${aS}% 45%` },
    },
    colors: {
      light: {
        primary: `${pH} ${pS}% 53%`,
        primaryForeground: '0 0% 100%',
        accent: `${aH} 100% 95%`,
        accentForeground: `${aH} 90% 40%`,
      },
      dark: {
        primary: `${pH} ${pS}% 62%`,
        primaryForeground: '0 0% 100%',
        accent: `${aH} 55% 14%`,
        accentForeground: `${aH} 100% 72%`,
      },
    },
  };
}

export const getTheme = (name: ThemeName): Theme => {
  if (name === 'custom') {
    const palette = getCustomPalette();
    if (palette) return buildCustomTheme(palette);
    return buildCustomTheme(DEFAULT_CUSTOM_PALETTE);
  }
  return themes.find((t) => t.name === name) || themes[0];
};

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  primary: "221 83% 53%",
  accent: "26 100% 50%",
};

export const getAllThemes = (): Theme[] => {
  const custom = getCustomPalette();
  if (!custom) return [...themes, buildCustomTheme(DEFAULT_CUSTOM_PALETTE)];
  return [...themes, buildCustomTheme(custom)];
};