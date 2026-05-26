import {
  AlertCircle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Info,
  Link,
  Loader2,
  Lock,
  Mic,
  Plus,
  Server,
  Settings2,
  Sliders,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAI } from '@/contexts/AIContext';
import type { AIProvider, SummaryStyle } from '@/lib/types';
import { DEFAULT_TRANSCRIPT_LANGUAGES, LANGUAGE_OPTIONS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsDivider, SettingsSection } from '../SettingsSection';

interface AISectionProps {
  highlightId?: string | null;
}

export function AISection({ highlightId }: AISectionProps) {
  const { t } = useTranslation('settings');
  const ai = useAI();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWhisperApiKey, setShowWhisperApiKey] = useState(false);

  const providers: {
    id: AIProvider;
    name: string;
    type: 'cloud' | 'local' | 'custom';
    logo: ReactNode;
  }[] = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'cloud',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <title>Google Gemini</title>
            <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
          </svg>
        </div>
      ),
    },
    {
      id: 'openai',
      name: 'OpenAI GPT',
      type: 'cloud',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-emerald-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>OpenAI GPT</title>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
        </div>
      ),
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      type: 'cloud',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-cyan-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>DeepSeek</title>
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      ),
    },
    {
      id: 'qwen',
      name: 'Alibaba Qwen',
      type: 'cloud',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>Alibaba Qwen</title>
            <path d="M4.5 16.5c-1.5-1.5-2.5-3.5-2.5-5.5C2 6.5 6.5 2 12 2c5.5 0 10 4.5 10 9 0 2-1 4-2.5 5.5" />
            <path d="M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0 -6 0" />
            <path d="M12 15v5M9 21h6" />
          </svg>
        </div>
      ),
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      type: 'local',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-amber-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>Ollama (Local)</title>
            <path d="M12 2a8 8 0 0 0-8 8v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a8 8 0 0 0-8-8z" />
            <circle cx="9" cy="11" r="1" fill="currentColor" />
            <circle cx="15" cy="11" r="1" fill="currentColor" />
            <path d="M12 14c-1.5 0-2 .5-2 1h4c0-.5-.5-1-2-1z" />
          </svg>
        </div>
      ),
    },
    {
      id: 'lmstudio',
      name: 'LM Studio',
      type: 'local',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-blue-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>LM Studio</title>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
      ),
    },
    {
      id: 'proxy',
      name: 'Proxy Custom',
      type: 'custom',
      logo: (
        <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>Proxy Custom</title>
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
      ),
    },
  ];

  const handleProviderSelect = (providerId: AIProvider) => {
    const defaultModels: Record<string, string> = {
      gemini: 'gemini-3.5-flash',
      openai: 'gpt-5.5',
      deepseek: 'deepseek-v4-flash',
      qwen: 'qwen3.5-plus',
      ollama: 'gpt-oss:20b',
      lmstudio: 'openai/gpt-oss-20b',
      proxy: 'gpt-5.5',
    };
    ai.updateConfig({
      provider: providerId,
      model: defaultModels[providerId] || 'gpt-5.5',
    });
  };

  const getProviderModelChips = (provider: AIProvider): string[] => {
    switch (provider) {
      case 'gemini':
        return ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro'];
      case 'openai':
        return ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];
      case 'deepseek':
        return ['deepseek-v4-flash', 'deepseek-v4-pro'];
      case 'qwen':
        return ['qwen3-max', 'qwen3.5-plus', 'qwen3.5-flash'];
      case 'ollama':
        return ['gpt-oss:20b', 'qwen3:8b', 'gemma3:12b'];
      case 'lmstudio':
        return ['openai/gpt-oss-20b', 'qwen/qwen3-8b', 'google/gemma-3-12b'];
      default:
        return ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];
    }
  };

  const getProviderTypeMeta = (type: 'cloud' | 'local' | 'custom') => {
    switch (type) {
      case 'cloud':
        return {
          icon: <Cloud className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />,
          label: t('ai.cloudApi'),
        };
      case 'local':
        return {
          icon: <Server className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
          label: t('ai.localRuntime'),
        };
      case 'custom':
        return {
          icon: <Link className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />,
          label: t('ai.customEndpoint'),
        };
    }
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('ai.title')}
        description={t('ai.description')}
        icon={<Sparkles className="w-5 h-5 text-primary-foreground" />}
        iconClassName="bg-primary text-primary-foreground shadow-primary/20"
      >
        <SettingsCard className="relative overflow-hidden">
          <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {t('ai.aiBannerDesc')}
            </p>
            <div className="flex shrink-0 items-center gap-2 rounded-md bg-background/70 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">{t('ai.enableAI')}</span>
              <Switch
                checked={ai.config.enabled}
                onCheckedChange={(enabled) => ai.updateConfig({ enabled })}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {ai.config.enabled ? (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          {/* Section: Select Provider Grid - COMPACT version */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">{t('ai.chooseProvider')}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {providers.map((prov) => {
                const isActive = ai.config.provider === prov.id;
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => handleProviderSelect(prov.id)}
                    className={cn(
                      'relative flex items-center gap-3 text-left p-3.5 rounded-xl transition-all duration-200 group w-full',
                      isActive ? 'bg-primary/10' : 'bg-muted/30 hover:bg-muted/50',
                    )}
                  >
                    {isActive && (
                      <span className="absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}

                    {prov.logo}
                    <div className="min-w-0 pr-4">
                      <h4 className="text-xs font-semibold truncate group-hover:text-primary dark:group-hover:text-primary transition-colors">
                        {prov.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/80">
                        {getProviderTypeMeta(prov.type).icon}
                        <span>{getProviderTypeMeta(prov.type).label}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Form Card based on selected Provider */}
          <SettingsCard className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('ai.configConnectionFor', {
                  name: providers.find((p) => p.id === ai.config.provider)?.name,
                })}
              </h3>
            </div>

            {/* Cloud Provider Forms (API KEY) */}
            {ai.config.provider !== 'ollama' && ai.config.provider !== 'lmstudio' && (
              <div
                id="ai-api-key"
                className={cn(
                  'space-y-3 p-3 rounded-xl bg-muted/20 transition-all duration-300',
                  highlightId === 'ai-api-key' &&
                    'ring-2 ring-primary/30 bg-primary/5 border-primary/20',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{t('ai.apiKey')}</span>
                  </div>

                  {/* API Key Source Link helper */}
                  {ai.config.provider !== 'proxy' && (
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
                      className="text-[11px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 hover:underline"
                    >
                      <span>{t('ai.getApiKeyHere')}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
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
                      className="h-10 bg-background/50 border-border/80 pr-10 focus-visible:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={ai.testConnection}
                    disabled={ai.isTesting || !ai.config.api_key}
                    className="w-full sm:w-auto h-10 bg-primary hover:bg-primary/90 text-primary-foreground px-5 shadow-md shadow-primary/10 active:scale-95 transition-transform"
                  >
                    {ai.isTesting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('ai.testingConnection')}</span>
                      </span>
                    ) : (
                      t('ai.test')
                    )}
                  </Button>
                </div>

                {/* Connection Status result floating block */}
                {ai.testResult && (
                  <div
                    className={cn(
                      'flex items-center gap-2.5 text-xs p-3 rounded-lg border transition-all animate-in slide-in-from-top-2 duration-300',
                      ai.testResult.success
                        ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-destructive/5 dark:bg-destructive/10 border-destructive/20 text-destructive',
                    )}
                  >
                    {ai.testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="font-medium">{ai.testResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* Ollama Local URL form */}
            {ai.config.provider === 'ollama' && (
              <div className="space-y-3 p-3 rounded-xl bg-muted/20">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="text-sm font-medium">{t('ai.ollamaUrl')}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t('ai.exampleUrl', { url: 'http://localhost:11434' })}
                  </span>
                </div>
                <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={ai.config.ollama_url || 'http://localhost:11434'}
                    onChange={(e) => ai.updateConfig({ ollama_url: e.target.value })}
                    placeholder="http://localhost:11434"
                    className="h-10 bg-background/50 border-border/80 flex-1 focus-visible:ring-primary"
                  />
                  <Button
                    onClick={ai.testConnection}
                    disabled={ai.isTesting}
                    className="w-full sm:w-auto h-10 bg-primary hover:bg-primary/90 text-primary-foreground px-5"
                  >
                    {ai.isTesting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('ai.testingConnection')}</span>
                      </span>
                    ) : (
                      t('ai.test')
                    )}
                  </Button>
                </div>

                <div className="text-[11px] text-muted-foreground/80 leading-normal flex items-start gap-1.5 mt-2 bg-amber-500/10 rounded-lg p-2.5">
                  <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>{t('ai.ollamaHelp')}</div>
                </div>

                {ai.testResult && (
                  <div
                    className={cn(
                      'flex items-center gap-2.5 text-xs p-3 rounded-lg border transition-all animate-in slide-in-from-top-2 duration-300',
                      ai.testResult.success
                        ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-destructive/5 dark:bg-destructive/10 border-destructive/20 text-destructive',
                    )}
                  >
                    {ai.testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="font-medium">{ai.testResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* LM Studio URL form */}
            {ai.config.provider === 'lmstudio' && (
              <div className="space-y-3 p-3 rounded-xl bg-muted/20">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="text-sm font-medium">{t('ai.lmstudioUrl')}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t('ai.exampleUrl', { url: 'http://localhost:1234' })}
                  </span>
                </div>
                <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={ai.config.lmstudio_url || 'http://localhost:1234'}
                    onChange={(e) => ai.updateConfig({ lmstudio_url: e.target.value })}
                    placeholder="http://localhost:1234"
                    className="h-10 bg-background/50 border-border/80 flex-1 focus-visible:ring-primary"
                  />
                  <Button
                    onClick={ai.testConnection}
                    disabled={ai.isTesting}
                    className="w-full sm:w-auto h-10 bg-primary hover:bg-primary/90 text-primary-foreground px-5"
                  >
                    {ai.isTesting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('ai.testingConnection')}</span>
                      </span>
                    ) : (
                      t('ai.test')
                    )}
                  </Button>
                </div>

                <div className="text-[11px] text-muted-foreground/80 leading-normal flex items-start gap-1.5 mt-2 bg-amber-500/10 rounded-lg p-2.5">
                  <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>{t('ai.lmStudioHelp')}</div>
                </div>

                {ai.testResult && (
                  <div
                    className={cn(
                      'flex items-center gap-2.5 text-xs p-3 rounded-lg border transition-all animate-in slide-in-from-top-2 duration-300',
                      ai.testResult.success
                        ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-destructive/5 dark:bg-destructive/10 border-destructive/20 text-destructive',
                    )}
                  >
                    {ai.testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="font-medium">{ai.testResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* Custom Proxy URL form */}
            {ai.config.provider === 'proxy' && (
              <div className="space-y-4 p-3 rounded-xl bg-muted/20">
                <div className="space-y-2">
                  <span className="text-sm font-medium">{t('ai.proxyUrl')}</span>
                  <Input
                    type="text"
                    value={ai.config.proxy_url || 'https://api.openai.com'}
                    onChange={(e) => ai.updateConfig({ proxy_url: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="h-10 bg-background/50 border-border/80 focus-visible:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">{t('ai.whisperCompatible')}</p>
                </div>
              </div>
            )}

            <SettingsDivider className="my-2" />

            {/* Model Name and Quick select badges */}
            <div className="space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="text-sm font-semibold">{t('ai.model')}</h4>
                  <p className="text-xs text-muted-foreground">{t('ai.modelDesc')}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row w-full md:w-auto">
                  <Input
                    type="text"
                    value={ai.config.model}
                    onChange={(e) => ai.updateConfig({ model: e.target.value })}
                    placeholder={t('ai.modelPlaceholder')}
                    className="h-9 w-full bg-background/50 border-border/80 sm:w-52 focus-visible:ring-primary text-xs font-mono"
                  />
                  <Select
                    value={
                      ai.models.some((m) => m.value === ai.config.model) ? ai.config.model : ''
                    }
                    onValueChange={(v) => ai.updateConfig({ model: v })}
                  >
                    <SelectTrigger className="h-9 w-full bg-background sm:w-[170px] text-xs">
                      <SelectValue placeholder={t('ai.quickSelect')} />
                    </SelectTrigger>
                    <SelectContent>
                      {ai.models.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-xs">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Recommended chips for ease of use */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-medium text-muted-foreground mr-1">
                  {t('ai.recommended')}
                </span>
                {getProviderModelChips(ai.config.provider).map((mName) => (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => ai.updateConfig({ model: mName })}
                    className={cn(
                      'text-[10px] font-mono px-2 py-0.5 rounded-full border transition-all',
                      ai.config.model === mName
                        ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                        : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground',
                    )}
                  >
                    {mName}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Advanced Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">{t('ai.timeout')}</span>
                </div>
                <Select
                  value={String(ai.config.timeout_seconds || 120)}
                  onValueChange={(v) =>
                    ai.updateConfig({ timeout_seconds: Number.parseInt(v, 10) })
                  }
                >
                  <SelectTrigger className="h-9 bg-background/50 border-border/80 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60" className="text-xs">
                      {t('ai.60seconds')}
                    </SelectItem>
                    <SelectItem value="120" className="text-xs">
                      {t('ai.2minutes')}
                    </SelectItem>
                    <SelectItem value="180" className="text-xs">
                      {t('ai.3minutes')}
                    </SelectItem>
                    <SelectItem value="300" className="text-xs">
                      {t('ai.5minutes')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  {t('ai.timeoutDesc')}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">{t('ai.summaryLanguage')}</span>
                </div>
                <Select
                  value={ai.config.summary_language}
                  onValueChange={(v) => ai.updateConfig({ summary_language: v })}
                >
                  <SelectTrigger className="h-9 bg-background/50 border-border/80 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">
                      {t('ai.autoSameAsVideo')}
                    </SelectItem>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.code} value={l.code} className="text-xs">
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  {t('ai.summaryLanguageDesc')}
                </p>
              </div>
            </div>
          </SettingsCard>

          {/* Section: Summary preferences */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Preferences block */}
            <SettingsCard className="p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2">
                <Sliders className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{t('ai.summaryCustomization')}</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold">{t('ai.summaryStyle')}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('ai.summaryStyleDesc')}
                    </span>
                  </div>

                  {/* Segmented Button control */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/40 border border-border/50 rounded-lg">
                    {[
                      { value: 'short', label: t('ai.short') },
                      { value: 'concise', label: t('ai.concise') },
                      { value: 'detailed', label: t('ai.detailed') },
                    ].map((style) => {
                      const isStyleActive = ai.config.summary_style === style.value;
                      return (
                        <button
                          key={style.value}
                          type="button"
                          onClick={() =>
                            ai.updateConfig({ summary_style: style.value as SummaryStyle })
                          }
                          className={cn(
                            'py-1.5 px-2 rounded-md text-xs font-medium transition-all',
                            isStyleActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/80',
                          )}
                        >
                          {style.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-muted/20 rounded-lg text-xs leading-relaxed text-muted-foreground/90">
                  <span className="font-semibold text-foreground">{t('ai.tip')}</span>{' '}
                  {t('ai.conciseStyleTip')}
                </div>
              </div>
            </SettingsCard>

            {/* Transcript languages reordering list card */}
            <SettingsCard
              id="transcript-languages"
              className={cn(
                'p-5 space-y-4 transition-all duration-300',
                highlightId === 'transcript-languages' &&
                  'ring-2 ring-primary bg-primary/5 border-primary/20',
              )}
            >
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">{t('ai.transcriptLanguages')}</h3>
                </div>
                <span className="text-[10px] font-medium text-muted-foreground/80 bg-muted px-2 py-0.5 rounded-full">
                  {t('ai.priorityTopToBottom')}
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground leading-normal">
                  {t('ai.transcriptLanguagesDesc')}
                </p>

                {/* Draggable-vibed order list */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES).map(
                    (code, index) => {
                      const lang = LANGUAGE_OPTIONS.find((l) => l.code === code);
                      const currentLangs =
                        ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES;
                      return (
                        <div
                          key={code}
                          className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors">
                            <GripVertical className="w-3.5 h-3.5 cursor-grab active:cursor-grabbing" />
                            <span className="text-[10px] font-mono w-3.5 text-center bg-muted/60 rounded px-1">
                              {index + 1}
                            </span>
                          </div>

                          <span className="flex-1 text-xs font-medium">{lang?.name || code}</span>

                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono px-1.5 bg-background border-border/60"
                          >
                            {code}
                          </Badge>

                          {/* Move control micro-buttons */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                              disabled={index === 0}
                              onClick={() => {
                                const langs = [...currentLangs];
                                [langs[index - 1], langs[index]] = [langs[index], langs[index - 1]];
                                ai.updateConfig({ transcript_languages: langs });
                              }}
                              title={t('ai.moveLanguageUp')}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                              disabled={index === currentLangs.length - 1}
                              onClick={() => {
                                const langs = [...currentLangs];
                                [langs[index], langs[index + 1]] = [langs[index + 1], langs[index]];
                                ai.updateConfig({ transcript_languages: langs });
                              }}
                              title={t('ai.moveLanguageDown')}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              className="p-1 hover:bg-destructive/15 hover:text-destructive rounded text-muted-foreground transition-colors ml-1"
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
                        </div>
                      );
                    },
                  )}
                </div>

                {/* Add preferred language dropdown */}
                {(() => {
                  const currentLangs =
                    ai.config.transcript_languages || DEFAULT_TRANSCRIPT_LANGUAGES;
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
                      <SelectTrigger className="w-full h-9 bg-background/50 border-border/80 text-xs text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all">
                        <div className="flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('ai.addLanguage')}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {availableLangs.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code} className="text-xs">
                            {lang.name} ({lang.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
            </SettingsCard>
          </div>

          {/* Section: Whisper transcription engine fallback */}
          <SettingsCard
            id="whisper"
            className={cn(
              'p-5 space-y-4 transition-all duration-300',
              highlightId === 'whisper' && 'ring-2 ring-primary bg-primary/5 border-primary/20',
            )}
          >
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary " />
                <div>
                  <h3 className="text-sm font-semibold">{t('ai.whisper')}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t('ai.whisperDesc')}</p>
                </div>
              </div>
              <Switch
                checked={ai.config.whisper_enabled || false}
                onCheckedChange={(enabled) => ai.updateConfig({ whisper_enabled: enabled })}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {ai.config.whisper_enabled && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20 pt-1 animate-in slide-in-from-left-3 duration-300">
                {/* Whisper backend provider toggle: OpenAI cloud vs Custom endpoint */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-2 rounded-xl border border-border/50">
                  <span className="text-xs font-semibold text-muted-foreground/80 pl-1">
                    {t('ai.whisperProvider')}
                  </span>

                  <div className="flex items-center gap-1 p-0.5 bg-background border border-border/60 rounded-lg w-fit self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() =>
                        ai.updateConfig({
                          whisper_endpoint_url: undefined,
                          whisper_model: undefined,
                        })
                      }
                      className={cn(
                        'px-3 py-1 text-[11px] font-medium rounded-md transition-all',
                        ai.config.whisper_endpoint_url === undefined
                          ? 'bg-primary shadow-sm text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('ai.openAiCloud')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        ai.updateConfig({
                          whisper_endpoint_url: ai.config.whisper_endpoint_url ?? '',
                        })
                      }
                      className={cn(
                        'px-3 py-1 text-[11px] font-medium rounded-md transition-all',
                        ai.config.whisper_endpoint_url !== undefined
                          ? 'bg-primary shadow-sm text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('ai.whisperCustom')}
                    </button>
                  </div>
                </div>

                {/* Subform based on whisper provider selection */}
                {ai.config.whisper_endpoint_url !== undefined ? (
                  // Custom Whisper backend subform
                  <div className="space-y-3 bg-muted/20 p-3 rounded-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium">{t('ai.whisperApiKey')}</span>
                        <div className="relative">
                          <Input
                            type={showWhisperApiKey ? 'text' : 'password'}
                            value={ai.config.whisper_api_key || ''}
                            onChange={(e) => ai.updateConfig({ whisper_api_key: e.target.value })}
                            placeholder={t('ai.whisperApiKey')}
                            className="h-9 bg-background/50 text-xs focus-visible:ring-primary pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowWhisperApiKey(!showWhisperApiKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          >
                            {showWhisperApiKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium">{t('ai.whisperModel')}</span>
                        <Input
                          type="text"
                          value={ai.config.whisper_model || ''}
                          onChange={(e) =>
                            ai.updateConfig({ whisper_model: e.target.value || undefined })
                          }
                          placeholder={t('ai.whisperModelPlaceholder')}
                          className="h-9 bg-background/50 text-xs focus-visible:ring-primary font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-medium">{t('ai.endpointUrl')}</span>
                      <Input
                        type="text"
                        value={ai.config.whisper_endpoint_url || ''}
                        onChange={(e) => ai.updateConfig({ whisper_endpoint_url: e.target.value })}
                        placeholder={t('ai.whisperEndpointPlaceholder')}
                        className="h-9 bg-background/50 text-xs focus-visible:ring-primary font-mono"
                      />
                    </div>

                    <div className="flex items-start gap-1.5 rounded-md bg-background/40 px-2 py-1.5 text-[10px] leading-normal text-muted-foreground">
                      <Info className="mt-px h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">{t('ai.whisperCompatible')}</div>
                    </div>
                  </div>
                ) : (
                  // Default OpenAI Whisper
                  <div className="space-y-3 bg-muted/20 p-3 rounded-lg">
                    {ai.config.provider === 'openai' ? (
                      <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                        <Check className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">{t('ai.usingOpenAI')}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium">{t('ai.whisperApiKey')}</span>
                        <div className="relative">
                          <Input
                            type={showWhisperApiKey ? 'text' : 'password'}
                            value={ai.config.whisper_api_key || ''}
                            onChange={(e) => ai.updateConfig({ whisper_api_key: e.target.value })}
                            placeholder={t('ai.whisperApiKey')}
                            className="h-9 bg-background/50 text-xs focus-visible:ring-primary pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowWhisperApiKey(!showWhisperApiKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          >
                            {showWhisperApiKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 p-2 bg-primary/5 border border-primary/20 rounded-lg text-[10px] text-primary">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span className="font-medium">{t('ai.whisperCost')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SettingsCard>
        </div>
      ) : (
        /* Large decorative offline card when AI is completely disabled */
        <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 border border-dashed border-border/80 rounded-2xl space-y-4 max-w-2xl mx-auto py-12 relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 left-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />

          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/20 shadow-md shadow-primary/5">
            <Sparkles className="w-8 h-8 text-primary " />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-foreground">{t('ai.aiOffline')}</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              {t('ai.aiOfflineDesc')}
            </p>
          </div>

          <Button
            onClick={() => ai.updateConfig({ enabled: true })}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 py-5 rounded-xl active:scale-95 transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t('ai.enableAiNow')}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
