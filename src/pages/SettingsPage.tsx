import { useTheme } from '@/contexts/ThemeContext';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useDownload } from '@/contexts/DownloadContext';
import { useUpdater } from '@/contexts/UpdaterContext';
import { useHistory } from '@/contexts/HistoryContext';
import { themes } from '@/lib/themes';
import type { ThemeName } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { 
  Check, 
  Sun, 
  Moon, 
  Github, 
  ExternalLink, 
  Terminal,
  RefreshCw,
  Download,
  CheckCircle2,
  Loader2,
  Film,
  Palette,
  Bell,
  Package,
  Info,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const { settings, updateAutoCheckUpdate } = useDownload();
  const { maxEntries, setMaxEntries, totalCount } = useHistory();
  const updater = useUpdater();
  
  const {
    ytdlpInfo,
    latestVersion,
    isLoading,
    isChecking,
    isUpdating,
    error,
    updateSuccess,
    checkForUpdate,
    updateYtdlp,
    ffmpegStatus,
    ffmpegLoading,
    ffmpegDownloading,
    ffmpegError,
    ffmpegSuccess,
    checkFfmpeg,
    downloadFfmpeg,
  } = useDependencies();

  const isUpdateAvailable = latestVersion && ytdlpInfo && latestVersion !== ytdlpInfo.version;
  const isAppUpdateAvailable = updater.status === 'available';
  const isAppChecking = updater.status === 'checking';
  const isAppUpToDate = updater.status === 'up-to-date';
  const isAppError = updater.status === 'error';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center h-14 px-6">
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">
          
          {/* Appearance Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Appearance</h2>
                <p className="text-xs text-muted-foreground">Customize the look and feel</p>
              </div>
            </div>

            <div className="space-y-4 pl-12">
              {/* Mode Toggle */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">Color Mode</p>
                  <p className="text-xs text-muted-foreground">Switch between light and dark</p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
                  <button
                    onClick={() => setMode('light')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      mode === 'light'
                        ? 'bg-background text-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    onClick={() => setMode('dark')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      mode === 'dark'
                        ? 'bg-background text-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                </div>
              </div>

              {/* Theme Colors */}
              <div className="py-3">
                <p className="text-sm font-medium mb-3">Color Theme</p>
                <div className="grid grid-cols-3 gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setTheme(t.name)}
                      className={cn(
                        'group flex items-center gap-3 p-3 rounded-xl transition-all',
                        'border-2',
                        theme === t.name
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110',
                          themeGradients[t.name]
                        )}
                      >
                        {theme === t.name && (
                          <Check className="w-4 h-4 text-white drop-shadow" />
                        )}
                      </div>
                      <span className="text-sm font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* App Updates Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold">App Updates</h2>
                <p className="text-xs text-muted-foreground">Keep Youwee up to date</p>
              </div>
            </div>

            <div className="space-y-3 pl-12">
              {/* Current Version Card */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg ring-2 ring-primary/20">
                    <img src="/logo-64.png" alt="Youwee" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Youwee</span>
                      <Badge variant="secondary" className="font-mono text-xs">v0.3.0</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isAppChecking ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Checking...
                        </span>
                      ) : isAppUpdateAvailable && updater.updateInfo ? (
                        <span className="text-primary font-medium">
                          v{updater.updateInfo.version} available
                        </span>
                      ) : isAppUpToDate ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="w-3 h-3" />
                          Up to date
                        </span>
                      ) : isAppError ? (
                        <span className="text-destructive">{updater.error || 'Check failed'}</span>
                      ) : (
                        'Modern YouTube downloader'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAppUpdateAvailable && (
                    <Button size="sm" onClick={updater.downloadAndInstall}>
                      <Download className="w-4 h-4 mr-1.5" />
                      Update
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={updater.checkForUpdate}
                    disabled={isAppChecking}
                  >
                    <RefreshCw className={cn("w-4 h-4", isAppChecking && "animate-spin")} />
                  </Button>
                </div>
              </div>

              {/* Auto Update Toggle */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">Auto-check on startup</p>
                  <p className="text-xs text-muted-foreground">Check for updates when app opens</p>
                </div>
                <Switch
                  checked={settings.autoCheckUpdate}
                  onCheckedChange={updateAutoCheckUpdate}
                />
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* Dependencies Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Dependencies</h2>
                <p className="text-xs text-muted-foreground">External tools for downloading</p>
              </div>
            </div>

            <div className="space-y-3 pl-12">
              {/* yt-dlp */}
              <div className="p-4 rounded-xl bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                      <Terminal className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">yt-dlp</span>
                        {isLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : ytdlpInfo ? (
                          <Badge variant="secondary" className="font-mono text-xs">{ytdlpInfo.version}</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Not found</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isUpdating ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Updating...
                          </span>
                        ) : updateSuccess ? (
                          <span className="text-emerald-500">Updated!</span>
                        ) : error ? (
                          <span className="text-destructive">{error}</span>
                        ) : isUpdateAvailable ? (
                          <span className="text-primary">{latestVersion} available</span>
                        ) : latestVersion ? (
                          <span className="text-emerald-500">Up to date</span>
                        ) : (
                          'Video download engine'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isUpdateAvailable && (
                      <Button size="sm" onClick={updateYtdlp} disabled={isUpdating}>
                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={checkForUpdate}
                      disabled={isChecking || isUpdating}
                    >
                      <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
                    </Button>
                  </div>
                </div>
                <a 
                  href="https://github.com/yt-dlp/yt-dlp" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
                >
                  <Github className="w-3 h-3" />
                  yt-dlp/yt-dlp
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* FFmpeg */}
              <div className="p-4 rounded-xl bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                      <Film className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">FFmpeg</span>
                        {ffmpegLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : ffmpegStatus?.installed ? (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {ffmpegStatus.version || 'Installed'}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Not found</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ffmpegDownloading ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Installing...
                          </span>
                        ) : ffmpegSuccess ? (
                          <span className="text-emerald-500">Installed!</span>
                        ) : ffmpegError ? (
                          <span className="text-destructive">{ffmpegError}</span>
                        ) : !ffmpegStatus?.installed ? (
                          <span className="text-amber-500">Required for 2K/4K/8K videos</span>
                        ) : (
                          'Audio/video processing'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!ffmpegStatus?.installed && !ffmpegLoading && (
                      <Button size="sm" onClick={downloadFfmpeg} disabled={ffmpegDownloading}>
                        {ffmpegDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Install'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={checkFfmpeg}
                      disabled={ffmpegLoading || ffmpegDownloading}
                    >
                      <RefreshCw className={cn("w-4 h-4", ffmpegLoading && "animate-spin")} />
                    </Button>
                  </div>
                </div>
                <a 
                  href="https://ffmpeg.org" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
                >
                  ffmpeg.org
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* Storage Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shadow-cyan-500/20">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Storage</h2>
                <p className="text-xs text-muted-foreground">Manage download history</p>
              </div>
            </div>

            <div className="space-y-3 pl-12">
              {/* Max History Entries */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">Max history entries</p>
                  <p className="text-xs text-muted-foreground">
                    Currently storing {totalCount} downloads
                  </p>
                </div>
                <Select
                  value={String(maxEntries)}
                  onValueChange={(v) => setMaxEntries(parseInt(v, 10))}
                >
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="250">250</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                    <SelectItem value="1000">1,000</SelectItem>
                    <SelectItem value="2000">2,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* About Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/20">
                <Info className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold">About</h2>
                <p className="text-xs text-muted-foreground">Application information</p>
              </div>
            </div>

            <div className="pl-12">
              <div className="p-5 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 border border-primary/10">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl ring-2 ring-primary/20 flex-shrink-0">
                    <img src="/logo-128.png" alt="Youwee" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold gradient-text">Youwee</h3>
                    <p className="text-sm text-muted-foreground">Version 0.3.0</p>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      A beautiful, fast, and modern YouTube video downloader. 
                      Download videos up to 8K with VP9 codec support.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
                  <span className="px-2.5 py-1 rounded-lg bg-muted/50 text-xs font-medium">Tauri 2.0</span>
                  <span className="px-2.5 py-1 rounded-lg bg-muted/50 text-xs font-medium">React 19</span>
                  <span className="px-2.5 py-1 rounded-lg bg-muted/50 text-xs font-medium">TypeScript</span>
                  <span className="px-2.5 py-1 rounded-lg bg-muted/50 text-xs font-medium">yt-dlp</span>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Open source under MIT License
                  </p>
                  <a 
                    href="https://github.com/vanloctech/youwee" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Bottom spacing */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
