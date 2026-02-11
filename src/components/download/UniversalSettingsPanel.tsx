import { FileVideo, FolderOpen, HardDrive, Music, Radio, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { UniversalSettings } from '@/contexts/UniversalContext';
import type { AudioBitrate, Format, Quality } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

const videoQualityKeys: { value: Quality; labelKey: string; shortLabelKey: string }[] = [
  { value: 'best', labelKey: 'quality.best', shortLabelKey: 'quality.bestShort' },
  { value: '8k', labelKey: 'quality.8k', shortLabelKey: 'quality.8kShort' },
  { value: '4k', labelKey: 'quality.4k', shortLabelKey: 'quality.4kShort' },
  { value: '2k', labelKey: 'quality.2k', shortLabelKey: 'quality.2kShort' },
  { value: '1080', labelKey: 'quality.1080', shortLabelKey: 'quality.1080Short' },
  { value: '720', labelKey: 'quality.720', shortLabelKey: 'quality.720Short' },
  { value: '480', labelKey: 'quality.480', shortLabelKey: 'quality.480Short' },
  { value: '360', labelKey: 'quality.360', shortLabelKey: 'quality.360Short' },
];

const videoFormatOptions: { value: Format; label: string }[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'webm', label: 'WebM' },
];

const audioFormatOptions: { value: Format; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'opus', label: 'Opus' },
];

interface UniversalSettingsPanelProps {
  settings: UniversalSettings;
  disabled?: boolean;
  totalFileSize?: number;
  onQualityChange: (quality: Quality) => void;
  onFormatChange: (format: Format) => void;
  onAudioBitrateChange: (bitrate: AudioBitrate) => void;
  onConcurrentChange: (concurrent: number) => void;
  onSelectFolder: () => void;
  onLiveFromStartChange: (enabled: boolean) => void;
}

export function UniversalSettingsPanel({
  settings,
  disabled,
  totalFileSize,
  onQualityChange,
  onFormatChange,
  onAudioBitrateChange,
  onConcurrentChange,
  onSelectFolder,
  onLiveFromStartChange,
}: UniversalSettingsPanelProps) {
  const { t } = useTranslation('universal');
  const isAudioOnly =
    settings.quality === 'audio' || ['mp3', 'm4a', 'opus'].includes(settings.format);
  const formatOptions = isAudioOnly ? audioFormatOptions : videoFormatOptions;
  const currentVideoQuality = isAudioOnly ? '1080' : settings.quality;

  const fileSizeDisplay = totalFileSize && totalFileSize > 0 ? formatFileSize(totalFileSize) : '';

  const handleModeChange = (mode: 'video' | 'audio') => {
    if (mode === 'audio') {
      onQualityChange('audio');
      if (!['mp3', 'm4a', 'opus'].includes(settings.format)) {
        onFormatChange('mp3');
      }
    } else {
      // Switch to video mode with last quality or default to 1080p
      if (settings.quality === 'audio') {
        onQualityChange('1080');
      }
      if (['mp3', 'm4a', 'opus'].includes(settings.format)) {
        onFormatChange('mp4');
      }
    }
  };

  const handleVideoQualityChange = (quality: Quality) => {
    onQualityChange(quality);
  };

  const outputFolderName = settings.outputPath
    ? settings.outputPath.split('/').pop() || settings.outputPath
    : 'Downloads';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Download Mode Toggle - Video/Audio */}
      <div className="flex items-center p-0.5 rounded-lg bg-muted/50 border border-border/50">
        <button
          type="button"
          onClick={() => handleModeChange('video')}
          disabled={disabled}
          className={cn(
            'h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
            !isAudioOnly
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FileVideo className="w-3.5 h-3.5" />
          {t('settings.video')}
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('audio')}
          disabled={disabled}
          className={cn(
            'h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
            isAudioOnly
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Music className="w-3.5 h-3.5" />
          {t('settings.audio')}
        </button>
      </div>

      {/* Quality Select - Only for Video mode */}
      {!isAudioOnly && (
        <Select
          value={currentVideoQuality}
          onValueChange={handleVideoQualityChange}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-[85px] h-9 text-xs bg-card/50 border-border/50"
            title={t('settings.videoQuality')}
          >
            <SelectValue>
              {t(
                videoQualityKeys.find((q) => q.value === currentVideoQuality)?.shortLabelKey ??
                  'quality.bestShort',
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[180px]">
            {videoQualityKeys.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Format Select */}
      <Select value={settings.format} onValueChange={onFormatChange} disabled={disabled}>
        <SelectTrigger
          className="w-[75px] h-9 text-xs bg-card/50 border-border/50"
          title={t('settings.outputFormat')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {formatOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Advanced Settings Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2.5 gap-1.5"
            disabled={disabled}
            title={t('settings.advanced')}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">{t('settings.more')}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end" side="bottom" sideOffset={8}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h4 className="text-sm font-medium">{t('settings.advanced')}</h4>
            {fileSizeDisplay && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <HardDrive className="w-3 h-3" />
                {fileSizeDisplay}
              </Badge>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Row 1: Audio Bitrate & Concurrent */}
            <div className="grid grid-cols-2 gap-3">
              {/* Audio Bitrate */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.audioQuality')}
                </Label>
                <Select
                  value={settings.audioBitrate}
                  onValueChange={onAudioBitrateChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">
                      {t('settings.bestAudio')}
                    </SelectItem>
                    <SelectItem value="128" className="text-xs">
                      {t('settings.standardAudio')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Concurrent Downloads */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.parallelDownloads')}
                </Label>
                <Select
                  value={String(settings.concurrentDownloads || 1)}
                  onValueChange={(v) => onConcurrentChange(Number(v))}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {t('settings.atATime', { count: n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggles Section */}
            <div className="space-y-2">
              {/* Live Stream Toggle */}
              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-muted/50">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[11px] font-medium">{t('settings.liveFromStart')}</span>
                </div>
                <Switch
                  checked={settings.liveFromStart}
                  onCheckedChange={onLiveFromStartChange}
                  disabled={disabled}
                  className="scale-90"
                />
              </div>
            </div>

            {/* Output Folder */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">{t('settings.saveTo')}</Label>
              <button
                type="button"
                onClick={onSelectFolder}
                disabled={disabled}
                className="w-full h-8 px-3 rounded-md border bg-background text-xs flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1 text-muted-foreground">
                  {settings.outputPath || t('settings.selectFolder')}
                </span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Output Folder Button - Quick Access */}
      <button
        type="button"
        onClick={onSelectFolder}
        disabled={disabled}
        className="h-9 px-2.5 rounded-md border bg-card/50 border-border/50 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors max-w-[140px]"
        title={
          settings.outputPath
            ? t('settings.outputFolder', { path: settings.outputPath })
            : t('settings.outputFolder', { path: t('settings.notSelected') })
        }
      >
        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate hidden xs:inline">{outputFolderName}</span>
      </button>

      {/* File Size Badge */}
      {fileSizeDisplay && (
        <Badge
          variant="outline"
          className="h-9 px-2.5 text-xs gap-1.5 hidden sm:flex"
          title={t('settings.totalFileSize')}
        >
          <HardDrive className="w-3.5 h-3.5" />
          {fileSizeDisplay}
        </Badge>
      )}
    </div>
  );
}
