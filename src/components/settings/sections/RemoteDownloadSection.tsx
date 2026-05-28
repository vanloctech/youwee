import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Key,
  Settings2,
  Shield,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/ui/tag-input';
import { useDownload } from '@/contexts/DownloadContext';
import type { TelegramStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsDivider, SettingsSection } from '../SettingsSection';

interface RemoteDownloadSectionProps {
  highlightId?: string | null;
}

const CONFIG_HIGHLIGHT_IDS = new Set([
  'telegram-config',
  'telegram-bot-token',
  'telegram-allowed-chat-ids',
]);

const TELEGRAM_COMMANDS = [
  { key: 'add', commandName: '/add' },
  { key: 'download', commandName: '/download' },
  { key: 'status', commandName: '/status' },
  { key: 'queue', commandName: '/queue' },
  { key: 'stop', commandName: '/stop' },
  { key: 'help', commandName: '/help' },
] as const;

export function RemoteDownloadSection({ highlightId }: RemoteDownloadSectionProps) {
  const { t } = useTranslation('settings');
  const { settings, updateTelegramSettings, refreshTelegramStatus } = useDownload();
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const hasTelegramToken = settings.telegramBotToken.trim().length > 0;
  const hasTelegramChatIds = settings.telegramAllowedChatIds.trim().length > 0;
  const allowedChatIds = useMemo(
    () =>
      settings.telegramAllowedChatIds
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter((id, index, ids) => id.length > 0 && ids.indexOf(id) === index),
    [settings.telegramAllowedChatIds],
  );

  const updateAllowedChatIds = useCallback(
    (chatIds: string[]) => {
      updateTelegramSettings({ telegramAllowedChatIds: chatIds.join('\n') });
    },
    [updateTelegramSettings],
  );

  useEffect(() => {
    if (!settings.telegramEnabled) {
      setTelegramStatus({ state: 'disabled', message: null });
      return;
    }

    if (!hasTelegramToken || !hasTelegramChatIds) {
      setTelegramStatus({
        state: 'error',
        message: hasTelegramToken
          ? t('remoteDownload.telegramErrorChatRequired')
          : t('remoteDownload.telegramErrorTokenRequired'),
      });
      return;
    }

    let cancelled = false;

    const doRefresh = async () => {
      try {
        const status = await refreshTelegramStatus();
        if (!cancelled) {
          setTelegramStatus(status);
        }
      } catch {
        if (!cancelled) {
          setTelegramStatus({
            state: 'error',
            message: t('remoteDownload.telegramStatusUnavailable'),
          });
        }
      }
    };

    const timer = window.setTimeout(() => {
      void doRefresh();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasTelegramChatIds, hasTelegramToken, refreshTelegramStatus, settings.telegramEnabled, t]);

  // Auto-expand config when first enabling or when search/highlight targets a config field.
  useEffect(() => {
    if (
      settings.telegramEnabled &&
      (!hasTelegramToken ||
        !hasTelegramChatIds ||
        (typeof highlightId === 'string' && CONFIG_HIGHLIGHT_IDS.has(highlightId)))
    ) {
      setShowConfig(true);
    }
  }, [settings.telegramEnabled, hasTelegramToken, hasTelegramChatIds, highlightId]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyCommand = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }

    setCopiedCommand(text);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopiedCommand(null);
      copyResetTimerRef.current = null;
    }, 1500);
  }, []);

  const displayTelegramStatus: TelegramStatus =
    telegramStatus ??
    (settings.telegramEnabled
      ? {
          state: hasTelegramToken && hasTelegramChatIds ? 'running' : 'error',
          message: null,
        }
      : { state: 'disabled', message: null });

  const statusDot =
    displayTelegramStatus.state === 'running'
      ? 'bg-emerald-500'
      : displayTelegramStatus.state === 'error'
        ? 'bg-red-500'
        : 'bg-muted-foreground/40';

  const statusLabel =
    displayTelegramStatus.state === 'running'
      ? t('remoteDownload.telegramStatusRunning')
      : displayTelegramStatus.state === 'error'
        ? t('remoteDownload.telegramStatusError')
        : t('remoteDownload.telegramStatusDisabled');

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('remoteDownload.telegramRemote')}
        description={t('remoteDownload.telegramRemoteDesc')}
        icon={<i className="fa fa-telegram text-[20px] text-white" aria-hidden="true" />}
        iconClassName="bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-500/20"
      >
        {/* Enable toggle + status */}
        <SettingsCard id="telegram-remote" highlight={highlightId === 'telegram-remote'}>
          <div
            className={cn(
              'flex items-center justify-between py-1 rounded-lg px-2 -mx-2 transition-all duration-500',
              highlightId === 'telegram-toggle' && 'bg-primary/10 ring-1 ring-primary/30',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <p className="text-sm font-medium">{t('remoteDownload.telegramEnable')}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={cn(
                      'inline-block w-1.5 h-1.5 rounded-full transition-colors',
                      statusDot,
                      displayTelegramStatus.state === 'running' && 'animate-pulse',
                    )}
                  />
                  <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
                </div>
              </div>
            </div>
            <Switch
              checked={settings.telegramEnabled}
              onCheckedChange={(telegramEnabled) => updateTelegramSettings({ telegramEnabled })}
            />
          </div>

          {/* Error message */}
          {settings.telegramEnabled &&
            displayTelegramStatus.state === 'error' &&
            displayTelegramStatus.message && (
              <>
                <SettingsDivider className="my-3" />
                <div className="flex items-start gap-2 px-2 -mx-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {displayTelegramStatus.message}
                  </p>
                </div>
              </>
            )}

          {/* Config toggle */}
          {settings.telegramEnabled && (
            <>
              <SettingsDivider className="my-3" />
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className={cn(
                  'w-full flex items-center justify-between px-2 -mx-2 py-1.5 rounded-lg',
                  'text-xs font-medium transition-colors',
                  showConfig ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  {t('remoteDownload.telegramConfigure')}
                </span>
                {showConfig ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
        </SettingsCard>

        {/* Configuration panel */}
        {settings.telegramEnabled && showConfig && (
          <SettingsCard id="telegram-config" highlight={highlightId === 'telegram-config'}>
            <div className="space-y-4">
              {/* Bot Token */}
              <div
                id="telegram-bot-token"
                className={cn(
                  'space-y-2 rounded-lg transition-all duration-500',
                  highlightId === 'telegram-bot-token' &&
                    'bg-primary/10 ring-1 ring-primary/30 p-3 -m-1',
                )}
              >
                <div className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  <label className="text-sm font-medium" htmlFor="telegram-bot-token-input">
                    {t('remoteDownload.telegramBotToken')}
                  </label>
                </div>
                <Input
                  id="telegram-bot-token-input"
                  type="password"
                  value={settings.telegramBotToken}
                  onChange={(e) => updateTelegramSettings({ telegramBotToken: e.target.value })}
                  placeholder={t('remoteDownload.telegramBotTokenPlaceholder')}
                  className="h-9 bg-background font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground/70">
                  {t('remoteDownload.telegramBotTokenDesc')}
                </p>
              </div>

              <SettingsDivider />

              {/* Allowed Chat IDs */}
              <div
                id="telegram-allowed-chat-ids"
                className={cn(
                  'space-y-2 rounded-lg transition-all duration-500',
                  highlightId === 'telegram-allowed-chat-ids' &&
                    'bg-primary/10 ring-1 ring-primary/30 p-3 -m-1',
                )}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  <label className="text-sm font-medium" htmlFor="telegram-allowed-chat-ids-input">
                    {t('remoteDownload.telegramAllowedChatIds')}
                  </label>
                </div>
                <TagInput
                  id="telegram-allowed-chat-ids-input"
                  value={allowedChatIds}
                  onChange={updateAllowedChatIds}
                  placeholder={t('remoteDownload.telegramAllowedChatIdsPlaceholder')}
                  validateTag={(tag) => /^-?\d+$/.test(tag)}
                  removeLabel={(tag) => t('remoteDownload.telegramRemoveChatId', { id: tag })}
                  className="min-h-[72px] content-start items-start"
                  inputClassName="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground/70">
                  {t('remoteDownload.telegramAllowedChatIdsDesc')}
                </p>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* Command Guide */}
        {settings.telegramEnabled && (
          <div
            id="telegram-guide"
            className={cn(
              'flex items-center justify-between p-3 rounded-xl bg-muted/30 transition-all duration-500',
              highlightId === 'telegram-guide' &&
                'ring-2 ring-primary ring-offset-2 ring-offset-background',
            )}
          >
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('remoteDownload.telegramGuide')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('remoteDownload.telegramGuideDesc')}
                </p>
              </div>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" type="button" className="h-8 gap-1.5 text-xs">
                  <BookOpen className="h-3.5 w-3.5" />
                  {t('remoteDownload.telegramGuideButton')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <i className="fa fa-telegram text-[18px] text-blue-500" aria-hidden="true" />
                    {t('remoteDownload.telegramGuideTitle')}
                  </DialogTitle>
                  <DialogDescription>{t('remoteDownload.telegramGuideIntro')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {TELEGRAM_COMMANDS.map(({ key, commandName }) => {
                    return (
                      <div
                        key={key}
                        className="group flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-[13px] font-semibold text-foreground">
                              {t(`remoteDownload.telegramCommand_${key}`)}
                            </code>
                            <button
                              type="button"
                              onClick={() => void handleCopyCommand(commandName)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-background"
                              title={t('remoteDownload.telegramCopyCommand')}
                              aria-label={t('remoteDownload.telegramCopyCommand')}
                            >
                              {copiedCommand === commandName ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {t(`remoteDownload.telegramCommand_${key}_desc`)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Quality note */}
                  <div className="rounded-lg bg-primary/5 px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">
                      {t('remoteDownload.telegramCommand_quality')}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t('remoteDownload.telegramCommand_quality_desc')}
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
