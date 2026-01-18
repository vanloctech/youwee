import { useTheme } from '@/contexts/ThemeContext';
import { themes } from '@/lib/themes';
import type { ThemeName } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { Check, Sun, Moon, Github, ExternalLink } from 'lucide-react';

// Gradient backgrounds for theme preview
const themeGradients: Record<ThemeName, string> = {
  midnight: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500',
  aurora: 'bg-gradient-to-br from-emerald-400 via-cyan-500 to-blue-500',
  sunset: 'bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500',
  ocean: 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500',
  forest: 'bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500',
  candy: 'bg-gradient-to-br from-pink-500 via-rose-500 to-red-500',
};

export function SettingsPage() {
  const { theme, setTheme, mode, setMode } = useTheme();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center h-14 px-6 border-b bg-card/30 backdrop-blur-xl">
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {/* Appearance Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Appearance</h2>
            <p className="text-xs text-muted-foreground">
              Customize how Youwee looks
            </p>
          </div>

          <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-4 space-y-5">
            {/* Mode Toggle - Compact */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Mode</span>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
                <button
                  onClick={() => setMode('light')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                    mode === 'light'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Sun className="w-4 h-4" />
                  <span className="hidden sm:inline">Light</span>
                </button>
                <button
                  onClick={() => setMode('dark')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                    mode === 'dark'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Moon className="w-4 h-4" />
                  <span className="hidden sm:inline">Dark</span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Theme Colors - Compact Grid */}
            <div className="space-y-3">
              <span className="text-sm font-medium">Theme</span>
              <div className="flex flex-wrap gap-2">
                {themes.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setTheme(t.name)}
                    className={cn(
                      'group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                      theme === t.name
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-transparent bg-muted/30 hover:bg-muted/50'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full shadow-sm flex items-center justify-center',
                        themeGradients[t.name]
                      )}
                    >
                      {theme === t.name && (
                        <Check className="w-3 h-3 text-white drop-shadow" />
                      )}
                    </div>
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">About</h2>
            <p className="text-xs text-muted-foreground">
              Application information
            </p>
          </div>

          <div className="rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden">
            {/* App Info Header */}
            <div className="p-5 flex items-center gap-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg ring-1 ring-border">
                <img 
                  src="/logo-128.png" 
                  alt="Youwee" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold gradient-text">Youwee</h3>
                <p className="text-sm text-muted-foreground">Version 0.1.0</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Modern YouTube Video Downloader
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="p-4 border-b">
              <p className="text-sm text-muted-foreground leading-relaxed">
                A beautiful, fast, and modern YouTube video downloader built with Tauri and React. 
                Download videos in various qualities (up to 4K) and formats with H.264 codec support for maximum compatibility.
              </p>
            </div>

            {/* Features */}
            <div className="p-4 border-b">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Features</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Batch downloads</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Playlist support</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>4K/2K/1080p quality</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>H.264 codec</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Audio extraction</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>6 color themes</span>
                </div>
              </div>
            </div>

            {/* Tech Stack & Links */}
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 rounded bg-muted/50">Tauri 2.0</span>
                <span className="px-2 py-1 rounded bg-muted/50">React 19</span>
                <span className="px-2 py-1 rounded bg-muted/50">yt-dlp</span>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href="https://github.com/vanloctech/youwee" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
                >
                  <Github className="w-4 h-4" />
                  <span>GitHub</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* License */}
            <div className="px-4 py-3 bg-muted/30 text-xs text-muted-foreground text-center">
              Open source under MIT License • Made with ❤️ by VietNam
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
