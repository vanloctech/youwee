import { Film, Gauge, Radio, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import {
  SPONSORBLOCK_CATEGORIES,
  type SponsorBlockAction,
  type SponsorBlockCategory,
  type SponsorBlockMode,
} from '@/lib/types';
import { cn } from '@/lib/utils';
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
    updateSponsorBlock,
    updateSponsorBlockMode,
    updateSponsorBlockCategory,
  } = useDownload();

  return (
    <div className="space-y-8">
      {/* Post-processing */}
      <SettingsSection
        title={t('download.postProcessing')}
        description={t('download.postProcessingDesc')}
        icon={<Film className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
      >
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
        <SettingsRow
          id="live-from-start"
          label={t('download.liveFromStart')}
          description={t('download.liveFromStartDesc')}
          highlight={highlightId === 'live-from-start'}
        >
          <Switch checked={settings.liveFromStart} onCheckedChange={updateLiveFromStart} />
        </SettingsRow>
      </SettingsSection>

      <SettingsDivider />

      {/* Speed Limit */}
      <SettingsSection
        title={t('download.speedLimit')}
        description={t('download.speedLimitDesc')}
        icon={<Gauge className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20"
      >
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
                  className="h-9 w-full text-center sm:w-20"
                />
                <Select
                  value={settings.speedLimitUnit}
                  onValueChange={(v: 'K' | 'M' | 'G') =>
                    updateSpeedLimit(true, settings.speedLimitValue, v)
                  }
                >
                  <SelectTrigger className="h-9 w-full sm:w-[85px]">
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
      </SettingsSection>
    </div>
  );
}
