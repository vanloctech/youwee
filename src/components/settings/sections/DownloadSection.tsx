import {
  Database,
  Film,
  Gauge,
  Plus,
  Radio,
  Rocket,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
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
import { useDownload } from '@/contexts/DownloadContext';
import { clampAutoRetryDelaySeconds, clampAutoRetryMaxAttempts } from '@/lib/download-retry';
import {
  SPONSORBLOCK_CATEGORIES,
  type SponsorBlockAction,
  type SponsorBlockCategory,
  type SponsorBlockMode,
  type YtdlpAdvancedOption,
  type YtdlpAdvancedOptionId,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  getYtdlpAdvancedOptionDefinition,
  YTDLP_ADVANCED_OPTION_DEFINITIONS,
  type YtdlpAdvancedOptionDefinition,
} from '@/lib/ytdlp-advanced-options';
import { SettingsCard, SettingsDivider, SettingsRow, SettingsSection } from '../SettingsSection';

interface DownloadSectionProps {
  highlightId?: string | null;
}

export function DownloadSection({ highlightId }: DownloadSectionProps) {
  const { t } = useTranslation('settings');
  const {
    settings,
    updateEmbedMetadata,
    updateEmbedThumbnail,
    updateLiveFromStart,
    updateSpeedLimit,
    updateUseAria2,
    updateAria2Args,
    updateAutoRetry,
    updateSettings,
    updateSponsorBlock,
    updateSponsorBlockMode,
    updateSponsorBlockCategory,
  } = useDownload();

  const updateYtdlpAdvancedOptions = (options: YtdlpAdvancedOption[]) => {
    updateSettings({ ytdlpAdvancedOptions: options });
  };

  const addYtdlpAdvancedOption = (id: YtdlpAdvancedOptionId) => {
    const definition = getYtdlpAdvancedOptionDefinition(id);
    if (!definition) return;
    const nextOption: YtdlpAdvancedOption = { id };
    if (definition.valueType === 'select') {
      nextOption.value = definition.options?.[0] || '';
    }
    updateYtdlpAdvancedOptions([...settings.ytdlpAdvancedOptions, nextOption]);
  };

  const updateYtdlpAdvancedOption = (index: number, updates: Partial<YtdlpAdvancedOption>) => {
    updateYtdlpAdvancedOptions(
      settings.ytdlpAdvancedOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...updates } : option,
      ),
    );
  };

  const removeYtdlpAdvancedOption = (index: number) => {
    updateYtdlpAdvancedOptions(
      settings.ytdlpAdvancedOptions.filter((_, optionIndex) => optionIndex !== index),
    );
  };

  const selectedYtdlpOptionIds = new Set(settings.ytdlpAdvancedOptions.map((option) => option.id));
  const availableYtdlpOptionDefinitions = YTDLP_ADVANCED_OPTION_DEFINITIONS.filter(
    (definition) => definition.repeatable || !selectedYtdlpOptionIds.has(definition.id),
  );

  const formatYtdlpOptionName = (definition: YtdlpAdvancedOptionDefinition) => {
    if (definition.id === 'youtubePlayerClient') {
      return '--extractor-args youtube:player-client';
    }
    return definition.ytDlpFlag;
  };

  const renderYtdlpOptionValue = (
    option: YtdlpAdvancedOption,
    definition: YtdlpAdvancedOptionDefinition,
    index: number,
  ) => {
    if (definition.valueType === 'boolean') {
      return null;
    }

    if (definition.valueType === 'select') {
      return (
        <Select
          value={option.value || definition.options?.[0] || ''}
          onValueChange={(value) => updateYtdlpAdvancedOption(index, { value })}
        >
          <SelectTrigger className="h-8 w-full bg-background md:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {definition.options?.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (definition.valueType === 'header') {
      return (
        <div className="grid w-full gap-2 md:grid-cols-[150px_minmax(180px,1fr)]">
          <Input
            value={option.value || ''}
            onChange={(event) =>
              updateYtdlpAdvancedOption(index, { value: event.currentTarget.value })
            }
            placeholder={t('download.ytdlpAdvanced.placeholder.headerName')}
            className="h-8 bg-background"
          />
          <Input
            value={option.secondaryValue || ''}
            onChange={(event) =>
              updateYtdlpAdvancedOption(index, { secondaryValue: event.currentTarget.value })
            }
            placeholder={t('download.ytdlpAdvanced.placeholder.headerValue')}
            className="h-8 bg-background"
          />
        </div>
      );
    }

    return (
      <Input
        value={option.value || ''}
        type={definition.valueType === 'number' ? 'number' : 'text'}
        onChange={(event) => updateYtdlpAdvancedOption(index, { value: event.currentTarget.value })}
        placeholder={definition.placeholderKey ? t(definition.placeholderKey) : undefined}
        className="h-8 w-full bg-background md:w-[260px]"
      />
    );
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('download.queuePersistence')}
        description={t('download.queuePersistenceDesc')}
        icon={<Database className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="persist-download-queue"
            label={t('download.persistDownloadQueue')}
            description={t('download.persistDownloadQueueDesc')}
            highlight={highlightId === 'persist-download-queue'}
          >
            <Switch
              checked={settings.persistDownloadQueue}
              onCheckedChange={(persistDownloadQueue) => updateSettings({ persistDownloadQueue })}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Post-processing */}
      <SettingsSection
        title={t('download.postProcessing')}
        description={t('download.postProcessingDesc')}
        icon={<Film className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="embed-metadata"
            label={t('download.embedMetadata')}
            description={t('download.embedMetadataDesc')}
            highlight={highlightId === 'embed-metadata'}
          >
            <Switch checked={settings.embedMetadata} onCheckedChange={updateEmbedMetadata} />
          </SettingsRow>

          <SettingsRow
            id="embed-thumbnail"
            label={t('download.embedThumbnail')}
            description={t('download.embedThumbnailDesc')}
            highlight={highlightId === 'embed-thumbnail'}
          >
            <Switch checked={settings.embedThumbnail} onCheckedChange={updateEmbedThumbnail} />
          </SettingsRow>

          <SettingsRow
            id="number-playlist-items"
            label={t('download.numberPlaylistItems')}
            description={t('download.numberPlaylistItemsDesc')}
            highlight={highlightId === 'number-playlist-items'}
          >
            <Switch
              checked={settings.numberPlaylistItems}
              onCheckedChange={(numberPlaylistItems) => updateSettings({ numberPlaylistItems })}
            />
          </SettingsRow>

          <SettingsRow
            id="split-embedded-chapters"
            label={t('download.splitEmbeddedChapters')}
            description={t('download.splitEmbeddedChaptersDesc')}
            highlight={highlightId === 'split-embedded-chapters'}
          >
            <Switch
              checked={settings.splitEmbeddedChapters}
              onCheckedChange={(splitEmbeddedChapters) => updateSettings({ splitEmbeddedChapters })}
            />
          </SettingsRow>

          {settings.splitEmbeddedChapters && (
            <SettingsRow
              id="number-chapter-files"
              label={t('download.numberChapterFiles')}
              description={t('download.numberChapterFilesDesc')}
              highlight={highlightId === 'number-chapter-files'}
            >
              <Switch
                checked={settings.numberChapterFiles}
                onCheckedChange={(numberChapterFiles) => updateSettings({ numberChapterFiles })}
              />
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* SponsorBlock */}
      <SettingsSection
        title="SponsorBlock"
        description={t('download.sponsorBlockDesc')}
        icon={<ShieldCheck className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/20"
      >
        <SettingsCard id="sponsorblock" highlight={highlightId === 'sponsorblock'}>
          {/* Toggle */}
          <SettingsRow
            id="sponsorblock-toggle"
            label={t('download.sponsorBlockToggle')}
            description={t('download.sponsorBlockToggleDesc')}
            highlight={highlightId === 'sponsorblock-toggle'}
          >
            <Switch checked={settings.sponsorBlock} onCheckedChange={updateSponsorBlock} />
          </SettingsRow>

          {/* Mode + Categories (shown when enabled) */}
          {settings.sponsorBlock && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              {/* Mode selector */}
              <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg w-full">
                {(['remove', 'mark', 'custom'] as SponsorBlockMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSponsorBlockMode(mode)}
                    className={cn(
                      'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                      settings.sponsorBlockMode === mode
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`download.sponsorBlockMode_${mode}`)}
                  </button>
                ))}
              </div>

              {/* Custom categories */}
              {settings.sponsorBlockMode === 'custom' && (
                <div className="space-y-1">
                  {SPONSORBLOCK_CATEGORIES.map((cat) => (
                    <div key={cat} className="flex items-center justify-between py-1.5 px-1">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {t(`download.sb_${cat}`)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 leading-tight">
                          {t(`download.sb_${cat}_desc`)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md shrink-0 ml-3">
                        {(['remove', 'mark', 'off'] as SponsorBlockAction[]).map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() =>
                              updateSponsorBlockCategory(cat as SponsorBlockCategory, action)
                            }
                            className={cn(
                              'px-2 py-0.5 text-[10px] font-medium rounded transition-all',
                              settings.sponsorBlockCategories[cat as SponsorBlockCategory] ===
                                action
                                ? action === 'remove'
                                  ? 'bg-red-500/15 text-red-500 shadow-sm'
                                  : action === 'mark'
                                    ? 'bg-blue-500/15 text-blue-500 shadow-sm'
                                    : 'bg-background text-muted-foreground shadow-sm'
                                : 'text-muted-foreground/50 hover:text-muted-foreground',
                            )}
                          >
                            {t(`download.sponsorBlockAction_${action}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Hint */}
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                {t('download.sponsorBlockHint')}
              </p>
            </div>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Live Stream */}
      <SettingsSection
        title={t('download.liveStream')}
        description={t('download.liveStreamDesc')}
        icon={<Radio className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="live-from-start"
            label={t('download.liveFromStart')}
            description={t('download.liveFromStartDesc')}
            highlight={highlightId === 'live-from-start'}
          >
            <Switch checked={settings.liveFromStart} onCheckedChange={updateLiveFromStart} />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Speed Limit */}
      <SettingsSection
        title={t('download.speedLimit')}
        description={t('download.speedLimitDesc')}
        icon={<Gauge className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="speed-limit"
            label={t('download.downloadSpeed')}
            description={t('download.downloadSpeedDesc')}
            highlight={highlightId === 'speed-limit'}
          >
            <div className="flex w-full flex-wrap items-center gap-3">
              {/* Radio: Unlimited / Limited */}
              <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() =>
                    updateSpeedLimit(false, settings.speedLimitValue, settings.speedLimitUnit)
                  }
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    !settings.speedLimitEnabled
                      ? 'bg-background text-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('download.unlimited')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSpeedLimit(true, settings.speedLimitValue, settings.speedLimitUnit)
                  }
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    settings.speedLimitEnabled
                      ? 'bg-background text-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('download.limited')}
                </button>
              </div>

              {/* Input + Unit dropdown (only when limited) */}
              {settings.speedLimitEnabled && (
                <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                  <Input
                    type="number"
                    min={1}
                    max={9999}
                    value={settings.speedLimitValue}
                    onChange={(e) => {
                      const value = Math.max(1, Math.min(9999, Number(e.target.value) || 1));
                      updateSpeedLimit(true, value, settings.speedLimitUnit);
                    }}
                    className="h-9 w-full bg-background text-center sm:w-20"
                  />
                  <Select
                    value={settings.speedLimitUnit}
                    onValueChange={(v: 'K' | 'M' | 'G') =>
                      updateSpeedLimit(true, settings.speedLimitValue, v)
                    }
                  >
                    <SelectTrigger className="h-9 w-full bg-background sm:w-[85px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="K">KB/s</SelectItem>
                      <SelectItem value="M">MB/s</SelectItem>
                      <SelectItem value="G">GB/s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title={t('download.autoRetry')}
        description={t('download.autoRetryDesc')}
        icon={<RotateCcw className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-cyan-500 to-sky-600 shadow-cyan-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="auto-retry-toggle"
            label={t('download.autoRetryEnable')}
            description={t('download.autoRetryEnableDesc')}
            highlight={highlightId === 'auto-retry-toggle'}
          >
            <Switch
              checked={settings.autoRetryEnabled}
              onCheckedChange={(enabled) =>
                updateAutoRetry(
                  enabled,
                  settings.autoRetryMaxAttempts,
                  settings.autoRetryDelaySeconds,
                )
              }
            />
          </SettingsRow>

          <SettingsRow
            id="auto-retry-values"
            label={t('download.autoRetryConfig')}
            description={t('download.autoRetryConfigDesc')}
            highlight={highlightId === 'auto-retry-values'}
          >
            <div className="flex w-full flex-wrap items-center gap-2 md:justify-end">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('download.retryAttempts')}</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  disabled={!settings.autoRetryEnabled}
                  value={settings.autoRetryMaxAttempts}
                  onChange={(e) =>
                    updateAutoRetry(
                      settings.autoRetryEnabled,
                      clampAutoRetryMaxAttempts(Number(e.target.value) || 1),
                      settings.autoRetryDelaySeconds,
                    )
                  }
                  className="h-9 w-20 bg-background text-center disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('download.retryDelay')}</span>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  disabled={!settings.autoRetryEnabled}
                  value={settings.autoRetryDelaySeconds}
                  onChange={(e) =>
                    updateAutoRetry(
                      settings.autoRetryEnabled,
                      settings.autoRetryMaxAttempts,
                      clampAutoRetryDelaySeconds(Number(e.target.value) || 1),
                    )
                  }
                  className="h-9 w-20 bg-background text-center disabled:opacity-50"
                />
                <span className="text-xs text-muted-foreground">{t('download.secondsShort')}</span>
              </div>
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title={t('download.ytdlpAdvanced.title')}
        description={t('download.ytdlpAdvanced.description')}
        icon={<SlidersHorizontal className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="ytdlp-advanced-options"
            label={t('download.ytdlpAdvanced.toggle')}
            description={t('download.ytdlpAdvanced.toggleDesc')}
            highlight={highlightId === 'ytdlp-advanced-options'}
          >
            <Switch
              checked={settings.ytdlpAdvancedOptionsEnabled}
              onCheckedChange={(ytdlpAdvancedOptionsEnabled) =>
                updateSettings({ ytdlpAdvancedOptionsEnabled })
              }
            />
          </SettingsRow>

          {settings.ytdlpAdvancedOptionsEnabled && (
            <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-muted-foreground">
                  {t('download.ytdlpAdvanced.helper')}
                </p>
                <Select
                  key={settings.ytdlpAdvancedOptions.length}
                  onValueChange={(value) => addYtdlpAdvancedOption(value as YtdlpAdvancedOptionId)}
                >
                  <SelectTrigger className="h-8 w-full bg-background md:w-[260px]">
                    <div className="flex items-center gap-2">
                      <Plus className="h-3.5 w-3.5" />
                      <SelectValue placeholder={t('download.ytdlpAdvanced.addOption')} />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableYtdlpOptionDefinitions.map((definition) => (
                      <SelectItem key={definition.id} value={definition.id}>
                        {formatYtdlpOptionName(definition)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {settings.ytdlpAdvancedOptions.length > 0 && (
                <div className="space-y-2">
                  {settings.ytdlpAdvancedOptions.map((option, index) => {
                    const definition = getYtdlpAdvancedOptionDefinition(option.id);
                    if (!definition) return null;

                    return (
                      <div
                        key={`${option.id}-${index}`}
                        className="rounded-md border border-dashed border-border/70 bg-muted/20 p-3"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold text-foreground">
                                {formatYtdlpOptionName(definition)}
                              </p>
                              {definition.securityLevel === 'advanced' && (
                                <Badge className="rounded bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-600 shadow-none hover:bg-amber-500/10 dark:text-amber-400">
                                  {t('download.ytdlpAdvanced.advancedBadge')}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] leading-tight text-muted-foreground/75">
                              {t(definition.descriptionKey)}
                            </p>
                          </div>
                          <div className="flex w-full items-center gap-2 md:w-auto">
                            {renderYtdlpOptionValue(option, definition, index)}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeYtdlpAdvancedOption(index)}
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Aria2 Integration */}
      <SettingsSection
        title={t('download.aria2')}
        description={t('download.aria2Desc')}
        icon={<Rocket className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-teal-500 to-cyan-600 shadow-teal-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="aria2-toggle"
            label={t('download.aria2Toggle')}
            description={t('download.aria2ToggleDesc')}
            highlight={highlightId === 'aria2-toggle'}
          >
            <Switch checked={settings.useAria2} onCheckedChange={updateUseAria2} />
          </SettingsRow>

          {settings.useAria2 && (
            <SettingsRow
              id="aria2-args"
              label={t('download.aria2Args')}
              description={t('download.aria2ArgsDesc')}
              highlight={highlightId === 'aria2-args'}
            >
              <Input
                value={settings.aria2Args}
                onChange={(e) => updateAria2Args(e.target.value)}
                placeholder={t('download.aria2ArgsPlaceholder')}
                className="h-9 w-full bg-background md:w-[340px]"
              />
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
