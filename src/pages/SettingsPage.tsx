import { getVersion } from '@tauri-apps/api/app';
import {
  AlertCircle,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileText,
  Github,
  GripVertical,
  Heart,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DependenciesSection,
  DownloadSection,
  GeneralSection,
  NetworkSection,
  SettingsCard,
  SettingsDivider,
  SettingsRow,
  SettingsSearch,
  SettingsSection,
  type SettingsSectionId,
  SettingsSidebar,
} from '@/components/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAI } from '@/contexts/AIContext';
import { useDownload } from '@/contexts/DownloadContext';
import { useUpdater } from '@/contexts/UpdaterContext';
import type { AIProvider, SummaryStyle } from '@/lib/types';
import { DEFAULT_TRANSCRIPT_LANGUAGES, LANGUAGE_OPTIONS } from '@/lib/types';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const updater = useUpdater();

  // Load app version
  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  // Handle search navigation
  const handleSearchNavigate = useCallback((section: SettingsSectionId, settingId: string) => {
    setActiveSection(section);
    setHighlightId(settingId);

    // Scroll to element after section change
    setTimeout(() => {
      const element = document.getElementById(settingId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after animation
      setTimeout(() => setHighlightId(null), 2000);
    }, 100);
  }, []);

  // Updater state helpers
  const isAppChecking = updater.status === 'checking';
  const isAppUpdateAvailable = updater.status === 'available';
  const isAppUpToDate = updater.status === 'up-to-date';
  const isAppError = updater.status === 'error';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{t('title')}</h1>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <SettingsSearch onNavigate={handleSearchNavigate} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div ref={contentRef} className="mx-auto w-full max-w-6xl py-6">
              {/* Animated section transitions */}
              <div
                className={cn(
                  'transition-all duration-300 ease-out',
                  'animate-in fade-in-0 slide-in-from-right-4',
                )}
                key={activeSection}
              >
                {activeSection === 'general' && <GeneralSection highlightId={highlightId} />}

                {activeSection === 'dependencies' && (
                  <DependenciesSection highlightId={highlightId} />
                )}

                {activeSection === 'download' && <DownloadSection highlightId={highlightId} />}

                {activeSection === 'ai' && (
                  <AISettingsContent
                    highlightId={highlightId}
                    showApiKey={showApiKey}
                    setShowApiKey={setShowApiKey}
                  />
                )}

                {activeSection === 'network' && <NetworkSection highlightId={highlightId} />}

                {activeSection === 'about' && (
                  <AboutSettingsContent
                    appVersion={appVersion}
                    updater={updater}
                    isAppChecking={isAppChecking}
                    isAppUpdateAvailable={isAppUpdateAvailable}
                    isAppUpToDate={isAppUpToDate}
                    isAppError={isAppError}
                    highlightId={highlightId}
                  />
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// AI Settings Content (inline component for now)
function AISettingsContent({
  highlightId,
  showApiKey,
  setShowApiKey,
}: {
  highlightId: string | null;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const ai = useAI();

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('ai.title')}
        description={t('ai.description')}
        icon={<Sparkles className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/20"
      >
        {/* Enable AI */}
        <SettingsRow
          id="ai-enabled"
          label={t('ai.enabled')}
          description={t('ai.enabledDesc')}
          highlight={highlightId === 'ai-enabled'}
        >
          <Switch
            checked={ai.config.enabled}
            onCheckedChange={(enabled) => ai.updateConfig({ enabled })}
          />
        </SettingsRow>

        {ai.config.enabled && (
          <>
            {/* Provider */}
            <SettingsRow
              id="ai-provider"
              label={t('ai.provider')}
              description={t('ai.providerDesc')}
              highlight={highlightId === 'ai-provider'}
            >
              <Select
                value={ai.config.provider}
                onValueChange={(v) => {
                  const defaultModels: Record<string, string> = {
                    gemini: 'gemini-2.0-flash',
                    openai: 'gpt-4o-mini',
                    deepseek: 'deepseek-chat',
                    qwen: 'qwen-turbo',
                    ollama: 'llama3.2',
                    proxy: 'gpt-4o-mini',
                  };
                  ai.updateConfig({
                    provider: v as AIProvider,
                    model: defaultModels[v] || 'gpt-4o-mini',
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="qwen">Qwen</SelectItem>
                  <SelectItem value="proxy">{t('ai.proxyCustom')}</SelectItem>
                  <SelectItem value="ollama">{t('ai.ollamaLocal')}</SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>

            {/* API Key */}
            {ai.config.provider !== 'ollama' && (
              <div
                id="ai-api-key"
                className={cn(
                  'space-y-2 py-2 rounded-lg px-2 -mx-2 transition-all duration-500',
                  highlightId === 'ai-api-key' && 'bg-primary/10 ring-1 ring-primary/30',
                )}
              >
                <p className="text-sm font-medium">{t('ai.apiKey')}</p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={ai.config.api_key || ''}
                      onChange={(e) => ai.updateConfig({ api_key: e.target.value })}
                      placeholder={
                        ai.config.provider === 'gemini'
                          ? t('ai.enterGeminiApiKey')
                          : ai.config.provider === 'openai'
                            ? t('ai.enterOpenAIApiKey')
                            : ai.config.provider === 'deepseek'
                              ? t('ai.enterDeepSeekApiKey')
                              : ai.config.provider === 'qwen'
                                ? t('ai.enterQwenApiKey')
                                : t('ai.enterProxyApiKey')
                      }
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
                    className="w-full sm:w-auto"
                  >
                    {ai.isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('ai.test')}
                  </Button>
                </div>
                {ai.config.provider !== 'proxy' && (
                  <p className="text-xs text-muted-foreground">
                    {t('ai.getApiKeyFrom')}{' '}
                    <a
                      href={
                        ai.config.provider === 'gemini'
                          ? 'https://aistudio.google.com/apikey'
                          : ai.config.provider === 'openai'
                            ? 'https://platform.openai.com/api-keys'
                            : ai.config.provider === 'deepseek'
                              ? 'https://platform.deepseek.com/api_keys'
                              : ai.config.provider === 'qwen'
                                ? 'https://dashscope.console.aliyun.com/apiKey'
                                : '#'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {ai.config.provider === 'gemini'
                        ? 'Google AI Studio'
                        : ai.config.provider === 'openai'
                          ? 'OpenAI Platform'
                          : ai.config.provider === 'deepseek'
                            ? 'DeepSeek Platform'
                            : ai.config.provider === 'qwen'
                              ? 'Alibaba DashScope'
                              : 'Provider'}
                    </a>
                  </p>
                )}
                {ai.testResult && (
                  <div
                    className={cn(
                      'flex items-center gap-2 text-xs p-2 rounded-lg',
                      ai.testResult.success
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {ai.testResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    {ai.testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* Ollama URL */}
            {ai.config.provider === 'ollama' && (
              <div className="space-y-2 py-2">
                <p className="text-sm font-medium">{t('ai.ollamaUrl')}</p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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
                    className="w-full sm:w-auto"
                  >
                    {ai.isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('ai.test')}
                  </Button>
                </div>
              </div>
            )}

            {/* Proxy URL */}
            {ai.config.provider === 'proxy' && (
              <div className="space-y-2 py-2">
                <p className="text-sm font-medium">{t('ai.proxyUrl')}</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={ai.config.proxy_url || 'https://api.openai.com'}
                    onChange={(e) => ai.updateConfig({ proxy_url: e.target.value })}
                    placeholder="https://api.openai.com"
                    className="h-9 flex-1"
                  />
                </div>
              </div>
            )}

            {/* Model */}
            <SettingsRow
              id="ai-model"
              label={t('ai.model')}
              description={t('ai.modelDesc')}
              highlight={highlightId === 'ai-model'}
            >
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Input
                  type="text"
                  value={ai.config.model}
                  onChange={(e) => ai.updateConfig({ model: e.target.value })}
                  placeholder={t('ai.modelPlaceholder')}
                  className="h-9 w-full sm:w-52"
                />
                <Select
                  value={ai.models.some((m) => m.value === ai.config.model) ? ai.config.model : ''}
                  onValueChange={(v) => ai.updateConfig({ model: v })}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[160px]">
                    <SelectValue placeholder={t('ai.quickSelect')} />
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
            </SettingsRow>

            {/* Summary Style */}
            <SettingsRow
              id="summary-style"
              label={t('ai.summaryStyle')}
              description={t('ai.summaryStyleDesc')}
              highlight={highlightId === 'summary-style'}
            >
              <Select
                value={ai.config.summary_style}
                onValueChange={(v) => ai.updateConfig({ summary_style: v as SummaryStyle })}
              >
                <SelectTrigger className="h-9 w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">{t('ai.short')}</SelectItem>
                  <SelectItem value="concise">{t('ai.concise')}</SelectItem>
                  <SelectItem value="detailed">{t('ai.detailed')}</SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>

            {/* Summary Language */}
            <SettingsRow
              id="summary-language"
              label={t('ai.summaryLanguage')}
              description={t('ai.summaryLanguageDesc')}
              highlight={highlightId === 'summary-language'}
            >
              <Select
                value={ai.config.summary_language}
                onValueChange={(v) => ai.updateConfig({ summary_language: v })}
              >
                <SelectTrigger className="h-9 w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('ai.autoSameAsVideo')}</SelectItem>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>

            {/* Timeout */}
            <SettingsRow
              id="ai-timeout"
              label={t('ai.timeout')}
              description={t('ai.timeoutDesc')}
              highlight={highlightId === 'ai-timeout'}
            >
              <Select
                value={String(ai.config.timeout_seconds || 120)}
                onValueChange={(v) => ai.updateConfig({ timeout_seconds: Number.parseInt(v, 10) })}
              >
                <SelectTrigger className="h-9 w-full sm:w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">{t('ai.60seconds')}</SelectItem>
                  <SelectItem value="120">{t('ai.2minutes')}</SelectItem>
                  <SelectItem value="180">{t('ai.3minutes')}</SelectItem>
                  <SelectItem value="300">{t('ai.5minutes')}</SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsDivider />

            {/* Transcript Languages */}
            <div
              id="transcript-languages"
              className={cn(
                'space-y-3 py-2 rounded-lg px-2 -mx-2 transition-all duration-500',
                highlightId === 'transcript-languages' && 'bg-primary/10 ring-1 ring-primary/30',
              )}
            >
              <div>
                <p className="text-sm font-medium">{t('ai.transcriptLanguages')}</p>
                <p className="text-xs text-muted-foreground">{t('ai.transcriptLanguagesDesc')}</p>
              </div>
              <div className="space-y-1.5">
                {(ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES).map(
                  (code, index) => {
                    const lang = LANGUAGE_OPTIONS.find((l) => l.code === code);
                    const currentLangs =
                      ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES;
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
                            type="button"
                            className="p-1 hover:bg-muted rounded disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => {
                              const langs = [...currentLangs];
                              [langs[index - 1], langs[index]] = [langs[index], langs[index - 1]];
                              ai.updateConfig({ transcript_languages: langs });
                            }}
                            title="Move up"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-muted rounded disabled:opacity-30"
                            disabled={index === currentLangs.length - 1}
                            onClick={() => {
                              const langs = [...currentLangs];
                              [langs[index], langs[index + 1]] = [langs[index + 1], langs[index]];
                              ai.updateConfig({ transcript_languages: langs });
                            }}
                            title="Move down"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="p-1 hover:bg-destructive/20 hover:text-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            const langs = currentLangs.filter((l) => l !== code);
                            ai.updateConfig({
                              transcript_languages:
                                langs.length > 0 ? langs : DEFAULT_TRANSCRIPT_LANGUAGES,
                            });
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  },
                )}
              </div>
              {/* Add language dropdown */}
              {(() => {
                const currentLangs = ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES;
                const availableLangs = LANGUAGE_OPTIONS.filter(
                  (l) => !currentLangs.includes(l.code),
                );
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
                        <span>{t('ai.addLanguage')}</span>
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

            <SettingsDivider />

            {/* Whisper */}
            <div
              id="whisper"
              className={cn(
                'space-y-3 py-2 rounded-lg px-2 -mx-2 transition-all duration-500',
                highlightId === 'whisper' && 'bg-primary/10 ring-1 ring-primary/30',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('ai.whisper')}</p>
                  <p className="text-xs text-muted-foreground">{t('ai.whisperDesc')}</p>
                </div>
                <Switch
                  checked={ai.config.whisper_enabled || false}
                  onCheckedChange={(enabled) => ai.updateConfig({ whisper_enabled: enabled })}
                />
              </div>
              {ai.config.whisper_enabled && (
                <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                  {/* Provider toggle: OpenAI / Custom */}
                  <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg w-fit">
                    <button
                      type="button"
                      onClick={() =>
                        ai.updateConfig({
                          whisper_endpoint_url: undefined,
                          whisper_model: undefined,
                        })
                      }
                      className={cn(
                        'px-3 py-1 text-xs font-medium rounded-md transition-all',
                        ai.config.whisper_endpoint_url === undefined
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      OpenAI
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        ai.updateConfig({
                          whisper_endpoint_url: ai.config.whisper_endpoint_url ?? '',
                        })
                      }
                      className={cn(
                        'px-3 py-1 text-xs font-medium rounded-md transition-all',
                        ai.config.whisper_endpoint_url !== undefined
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('ai.whisperCustom')}
                    </button>
                  </div>

                  {ai.config.whisper_endpoint_url !== undefined ? (
                    // Custom backend
                    <div className="space-y-2">
                      <Input
                        type="password"
                        value={ai.config.whisper_api_key || ''}
                        onChange={(e) => ai.updateConfig({ whisper_api_key: e.target.value })}
                        placeholder={t('ai.whisperApiKey')}
                        className="h-9"
                      />
                      <Input
                        type="text"
                        value={ai.config.whisper_endpoint_url || ''}
                        onChange={(e) => ai.updateConfig({ whisper_endpoint_url: e.target.value })}
                        placeholder={t('ai.whisperEndpointPlaceholder')}
                        className="h-9"
                      />
                      <Input
                        type="text"
                        value={ai.config.whisper_model || ''}
                        onChange={(e) =>
                          ai.updateConfig({ whisper_model: e.target.value || undefined })
                        }
                        placeholder={t('ai.whisperModelPlaceholder')}
                        className="h-9"
                      />
                      <p className="text-xs text-muted-foreground/60">
                        {t('ai.whisperCompatible')}
                      </p>
                    </div>
                  ) : (
                    // OpenAI (default)
                    <div className="space-y-2">
                      {ai.config.provider === 'openai' ? (
                        <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('ai.usingOpenAI')}</span>
                        </div>
                      ) : (
                        <Input
                          type="password"
                          value={ai.config.whisper_api_key || ''}
                          onChange={(e) => ai.updateConfig({ whisper_api_key: e.target.value })}
                          placeholder={t('ai.whisperApiKey')}
                          className="h-9"
                        />
                      )}
                      <p className="text-xs text-muted-foreground">{t('ai.whisperCost')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SettingsSection>
    </div>
  );
}

// About Settings Content
function AboutSettingsContent({
  appVersion,
  updater,
  isAppChecking,
  isAppUpdateAvailable,
  isAppUpToDate,
  isAppError,
  highlightId,
}: {
  appVersion: string;
  updater: ReturnType<typeof useUpdater>;
  isAppChecking: boolean;
  isAppUpdateAvailable: boolean;
  isAppUpToDate: boolean;
  isAppError: boolean;
  highlightId: string | null;
}) {
  const { t } = useTranslation('settings');
  const { settings, updateAutoCheckUpdate } = useDownload();

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('about.title')}
        description={t('about.description')}
        icon={<Info className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-pink-500 to-rose-600 shadow-pink-500/20"
      >
        {/* App Info Card */}
        <SettingsCard id="app-version" highlight={highlightId === 'app-version'}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0">
                <img src="/logo-128.png" alt="Youwee" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">Youwee</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    v{appVersion}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{t('about.appDesc')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAppChecking ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t('about.checkingUpdates')}
                    </span>
                  ) : isAppUpdateAvailable && updater.updateInfo ? (
                    <span className="text-primary font-medium">
                      {t('about.versionAvailable', { version: updater.updateInfo.version })}
                    </span>
                  ) : isAppUpToDate ? (
                    <span className="flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('about.upToDate')}
                    </span>
                  ) : isAppError ? (
                    <span className="text-destructive">
                      {updater.error || t('about.checkFailed')}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isAppUpdateAvailable && (
                <Button
                  size="sm"
                  onClick={updater.downloadAndInstall}
                  disabled={updater.status === 'downloading' || updater.status === 'ready'}
                  className="gap-1.5"
                >
                  {updater.status === 'downloading' || updater.status === 'ready' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {updater.status === 'downloading'
                        ? `${updater.progress ? Math.round((updater.progress.downloaded / updater.progress.total) * 100) : 0}%`
                        : t('about.restarting')}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {t('about.update')}
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={updater.checkForUpdate}
                disabled={isAppChecking}
                title={t('about.checkForUpdates')}
                className="h-9 w-9"
              >
                <RefreshCw className={cn('w-4 h-4', isAppChecking && 'animate-spin')} />
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
              {t('about.license')}
            </a>
            <a
              href="https://github.com/vanloctech/youwee/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 hover:bg-background text-xs font-medium transition-colors"
            >
              <Bug className="w-3.5 h-3.5" />
              {t('about.reportIssue')}
            </a>
          </div>

          {/* Made with love */}
          <div className="flex items-center justify-center gap-1.5 mt-4 pt-4 border-t border-border/50">
            <span className="text-xs text-muted-foreground">{t('about.madeWith')}</span>
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
            <span className="text-xs text-muted-foreground">{t('about.by')}</span>
            <a
              href="https://github.com/vanloctech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              vanloctech
            </a>
          </div>
        </SettingsCard>

        {/* Auto Update Toggle */}
        <SettingsRow
          id="auto-update"
          label={t('about.autoUpdate')}
          description={t('about.autoUpdateDesc')}
          highlight={highlightId === 'auto-update'}
        >
          <Switch checked={settings.autoCheckUpdate} onCheckedChange={updateAutoCheckUpdate} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
