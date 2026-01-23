import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useTheme } from '@/contexts/ThemeContext';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useDownload } from '@/contexts/DownloadContext';
import { useUpdater } from '@/contexts/UpdaterContext';
import { useHistory } from '@/contexts/HistoryContext';
import { useAI } from '@/contexts/AIContext';
import { themes } from '@/lib/themes';
import type { ThemeName } from '@/lib/themes';
import type { AIProvider, SummaryStyle } from '@/lib/types';
import { LANGUAGE_OPTIONS, DEFAULT_TRANSCRIPT_LANGUAGES } from '@/lib/types';
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
  Package,
  Info,
  Database,
  Sparkles,
  Eye,
  EyeOff,
  AlertCircle,
  GripVertical,
  Plus,
  X,
  Heart,
  FileText,
  Bug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
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
  const { settings, updateAutoCheckUpdate, updateUseBunRuntime, updateUseActualPlayerJs } = useDownload();
  const { maxEntries, setMaxEntries, totalCount } = useHistory();
  const updater = useUpdater();
  const ai = useAI();
  const [appVersion, setAppVersion] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Get app version from Tauri
  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);
  
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
    bunStatus,
    bunLoading,
    bunDownloading,
    bunError,
    bunSuccess,
    checkBun,
    downloadBun,
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

              {/* Bun Runtime */}
              <div className="p-4 rounded-xl bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                      <Terminal className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Bun Runtime</span>
                        {bunLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : bunStatus?.installed ? (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {bunStatus.version || 'Installed'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Optional</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {bunDownloading ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Installing...
                          </span>
                        ) : bunSuccess ? (
                          <span className="text-emerald-500">Installed!</span>
                        ) : bunError ? (
                          <span className="text-destructive">{bunError}</span>
                        ) : !bunStatus?.installed ? (
                          <span className="text-amber-500">Enable in download settings if only 360p available</span>
                        ) : (
                          'JavaScript runtime for YouTube'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!bunStatus?.installed && !bunLoading && (
                      <Button size="sm" onClick={downloadBun} disabled={bunDownloading}>
                        {bunDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Install'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={checkBun}
                      disabled={bunLoading || bunDownloading}
                    >
                      <RefreshCw className={cn("w-4 h-4", bunLoading && "animate-spin")} />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">Use Bun for YouTube</p>
                      <p className="text-xs text-muted-foreground">Fixes 360p-only issue on some systems</p>
                    </div>
                    <Switch
                      checked={settings.useBunRuntime}
                      onCheckedChange={updateUseBunRuntime}
                      disabled={!bunStatus?.installed}
                    />
                  </div>
                </div>
                <a 
                  href="https://bun.sh" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
                >
                  bun.sh
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* YouTube Troubleshooting */}
            <div className="p-4 rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="font-medium">YouTube Troubleshooting</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Options to fix download issues
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Use Actual Player.js</p>
                    <p className="text-xs text-muted-foreground">Fixes "unable to download" errors on some videos</p>
                  </div>
                  <Switch
                    checked={settings.useActualPlayerJs}
                    onCheckedChange={updateUseActualPlayerJs}
                  />
                </div>
              </div>
              <a 
                href="https://github.com/yt-dlp/yt-dlp/issues/14680" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
              >
                Learn more about this issue
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* AI Features Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold">AI Features</h2>
                <p className="text-xs text-muted-foreground">Smart video summarization</p>
              </div>
              <Switch
                checked={ai.config.enabled}
                onCheckedChange={(enabled) => ai.updateConfig({ enabled })}
              />
            </div>

            {ai.config.enabled && (
              <div className="space-y-4 pl-12">
                {/* Provider Selection */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">AI Provider</p>
                    <p className="text-xs text-muted-foreground">Choose your AI service</p>
                  </div>
                  <Select
                    value={ai.config.provider}
                    onValueChange={(v) => ai.updateConfig({ 
                      provider: v as AIProvider,
                      model: v === 'gemini' ? 'gemini-2.0-flash' : v === 'openai' ? 'gpt-4o-mini' : v === 'proxy' ? 'gpt-4o-mini' : 'llama3.2'
                    })}
                  >
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="proxy">Proxy (Custom)</SelectItem>
                      <SelectItem value="ollama">Ollama (Local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* API Key (for Gemini/OpenAI/Proxy) */}
                {ai.config.provider !== 'ollama' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">API Key</p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={ai.config.api_key || ''}
                          onChange={(e) => ai.updateConfig({ api_key: e.target.value })}
                          placeholder={`Enter ${ai.config.provider === 'gemini' ? 'Gemini' : ai.config.provider === 'proxy' ? 'Proxy' : 'OpenAI'} API key`}
                          className="h-9 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={ai.testConnection}
                        disabled={ai.isTesting || !ai.config.api_key}
                      >
                        {ai.isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                      </Button>
                    </div>
                    {ai.config.provider !== 'proxy' && (
                      <p className="text-xs text-muted-foreground">
                        Get your API key from{' '}
                        <a 
                          href={ai.config.provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://platform.openai.com/api-keys'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {ai.config.provider === 'gemini' ? 'Google AI Studio' : 'OpenAI Platform'}
                        </a>
                      </p>
                    )}
                    {ai.testResult && (
                      <div className={cn(
                        "flex items-center gap-2 text-xs p-2 rounded-lg",
                        ai.testResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                      )}>
                        {ai.testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {ai.testResult.message}
                      </div>
                    )}
                  </div>
                )}

                {/* Proxy URL (for Proxy provider) */}
                {ai.config.provider === 'proxy' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Proxy URL</p>
                    <Input
                      type="text"
                      value={ai.config.proxy_url || 'https://api.openai.com'}
                      onChange={(e) => ai.updateConfig({ proxy_url: e.target.value })}
                      placeholder="https://api.openai.com"
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      OpenAI-compatible API endpoint (e.g., Azure OpenAI, LiteLLM, OpenRouter)
                    </p>
                  </div>
                )}

                {/* Ollama URL */}
                {ai.config.provider === 'ollama' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Ollama URL</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={ai.config.ollama_url || 'http://localhost:11434'}
                        onChange={(e) => ai.updateConfig({ ollama_url: e.target.value })}
                        placeholder="http://localhost:11434"
                        className="h-9 flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={ai.testConnection}
                        disabled={ai.isTesting}
                      >
                        {ai.isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Run Ollama locally for free AI summarization.{' '}
                      <a 
                        href="https://ollama.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Download Ollama
                      </a>
                    </p>
                    {ai.testResult && (
                      <div className={cn(
                        "flex items-center gap-2 text-xs p-2 rounded-lg",
                        ai.testResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                      )}>
                        {ai.testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {ai.testResult.message}
                      </div>
                    )}
                  </div>
                )}

                {/* Model Selection */}
                <div className="space-y-2 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Model</p>
                      <p className="text-xs text-muted-foreground">Select or type custom model name</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={ai.config.model}
                      onChange={(e) => ai.updateConfig({ model: e.target.value })}
                      placeholder="Enter model name..."
                      className="h-9 flex-1"
                    />
                    <Select
                      value={ai.models.some(m => m.value === ai.config.model) ? ai.config.model : ''}
                      onValueChange={(v) => ai.updateConfig({ model: v })}
                    >
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Quick select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ai.models.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Summary Style */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Summary Style</p>
                    <p className="text-xs text-muted-foreground">How detailed the summary should be</p>
                  </div>
                  <Select
                    value={ai.config.summary_style}
                    onValueChange={(v) => ai.updateConfig({ summary_style: v as SummaryStyle })}
                  >
                    <SelectTrigger className="w-[200px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (2-3 sentences)</SelectItem>
                      <SelectItem value="concise">Concise (key points)</SelectItem>
                      <SelectItem value="detailed">Detailed (comprehensive)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Summary Language */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Summary Language</p>
                    <p className="text-xs text-muted-foreground">Language for generated summaries</p>
                  </div>
                  <Select
                    value={ai.config.summary_language}
                    onValueChange={(v) => ai.updateConfig({ summary_language: v })}
                  >
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Same as video)</SelectItem>
                      {LANGUAGE_OPTIONS.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Generation Timeout */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Generation Timeout</p>
                    <p className="text-xs text-muted-foreground">Max time for AI response (local models may need more)</p>
                  </div>
                  <Select
                    value={String(ai.config.timeout_seconds || 120)}
                    onValueChange={(v) => ai.updateConfig({ timeout_seconds: parseInt(v) })}
                  >
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">60 seconds</SelectItem>
                      <SelectItem value="120">2 minutes</SelectItem>
                      <SelectItem value="180">3 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="600">10 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transcript Languages */}
                <div className="space-y-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Transcript Languages</p>
                    <p className="text-xs text-muted-foreground">Languages to try when fetching subtitles (first match wins)</p>
                  </div>
                  
                  {/* Selected languages */}
                  <div className="space-y-1.5">
                    {(() => {
                      const currentLangs = ai.config.transcript_languages && ai.config.transcript_languages.length > 0 
                        ? ai.config.transcript_languages 
                        : DEFAULT_TRANSCRIPT_LANGUAGES;
                      
                      return currentLangs.map((code, index) => {
                        const lang = LANGUAGE_OPTIONS.find(l => l.code === code);
                        return (
                          <div 
                            key={code}
                            className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 group"
                          >
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <GripVertical className="w-4 h-4" />
                              <span className="text-xs font-mono w-4">{index + 1}</span>
                            </div>
                            <span className="flex-1 text-sm">{lang?.name || code}</span>
                            <code className="text-xs text-muted-foreground font-mono">{code}</code>
                            {/* Move up/down buttons */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1 hover:bg-muted rounded disabled:opacity-30"
                                disabled={index === 0}
                                onClick={() => {
                                  const langs = [...currentLangs];
                                  [langs[index - 1], langs[index]] = [langs[index], langs[index - 1]];
                                  ai.updateConfig({ transcript_languages: langs });
                                }}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button
                                className="p-1 hover:bg-muted rounded disabled:opacity-30"
                                disabled={index === currentLangs.length - 1}
                                onClick={() => {
                                  const langs = [...currentLangs];
                                  [langs[index], langs[index + 1]] = [langs[index + 1], langs[index]];
                                  ai.updateConfig({ transcript_languages: langs });
                                }}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>
                            <button
                              className="p-1 hover:bg-destructive/20 hover:text-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                const langs = currentLangs.filter(l => l !== code);
                                ai.updateConfig({ transcript_languages: langs.length > 0 ? langs : DEFAULT_TRANSCRIPT_LANGUAGES });
                              }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  
                  {/* Add language dropdown */}
                  {(() => {
                    const currentLangs = ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES;
                    const availableLangs = LANGUAGE_OPTIONS.filter(l => !currentLangs.includes(l.code));
                    
                    if (availableLangs.length === 0) return null;
                    
                    return (
                      <Select
                        value=""
                        onValueChange={(code) => {
                          if (code) {
                            ai.updateConfig({ transcript_languages: [...currentLangs, code] });
                          }
                        }}
                      >
                        <SelectTrigger className="w-full h-9 text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            <span>Add language...</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {availableLangs.map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              {lang.name} ({lang.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
              </div>
            )}
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

            <div className="space-y-4 pl-12">
              {/* App Info Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl ring-2 ring-primary/20 flex-shrink-0">
                      <img src="/logo-64.png" alt="Youwee" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">Youwee</span>
                        <Badge variant="secondary" className="font-mono text-xs">v{appVersion}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Modern video downloader with AI summaries
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isAppChecking ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Checking for updates...
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
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAppUpdateAvailable && (
                      <Button size="sm" onClick={updater.downloadAndInstall} className="gap-1.5">
                        <Download className="w-4 h-4" />
                        Update
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={updater.checkForUpdate}
                      disabled={isAppChecking}
                      title="Check for updates"
                      className="h-9 w-9"
                    >
                      <RefreshCw className={cn("w-4 h-4", isAppChecking && "animate-spin")} />
                    </Button>
                  </div>
                </div>

                {/* Quick Links */}
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/50">
                  <a 
                    href="https://github.com/vanloctech/youwee" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 hover:bg-background text-xs font-medium transition-colors"
                  >
                    <Github className="w-3.5 h-3.5" />
                    GitHub
                  </a>
                  <a 
                    href="https://github.com/vanloctech/youwee/blob/main/LICENSE" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 hover:bg-background text-xs font-medium transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    License
                  </a>
                  <a 
                    href="https://github.com/vanloctech/youwee/issues" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 hover:bg-background text-xs font-medium transition-colors"
                  >
                    <Bug className="w-3.5 h-3.5" />
                    Report Issue
                  </a>
                </div>

                {/* Made with love */}
                <div className="flex items-center justify-center gap-1.5 mt-4 pt-4 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">Made with</span>
                  <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                  <span className="text-xs text-muted-foreground">by</span>
                  <span className="text-xs font-medium bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 bg-clip-text text-transparent">
                    Vietnam
                  </span>
                </div>
              </div>

              {/* Auto Update Toggle */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">Auto-check for updates</p>
                  <p className="text-xs text-muted-foreground">Check for updates when app opens</p>
                </div>
                <Switch
                  checked={settings.autoCheckUpdate}
                  onCheckedChange={updateAutoCheckUpdate}
                />
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
