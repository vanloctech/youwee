import { FileVideo, FolderOpen, Info, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  Format,
  PreferredFps,
  Quality,
  VideoCodec,
  YoutubeChannelContentType,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const videoQualityOptions: { value: Quality; label: string; short: string }[] = [
  { value: 'best', label: 'Best Quality', short: 'Best' },
  { value: '8k', label: '8K (4320p)', short: '8K' },
  { value: '4k', label: '4K (2160p)', short: '4K' },
  { value: '2k', label: '2K (1440p)', short: '2K' },
  { value: '1080', label: '1080p (Full HD)', short: '1080p' },
  { value: '720', label: '720p (HD)', short: '720p' },
  { value: '480', label: '480p (SD)', short: '480p' },
  { value: '360', label: '360p', short: '360p' },
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

const videoCodecOptions: { value: VideoCodec; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'h264', label: 'H.264' },
  { value: 'vp9', label: 'VP9' },
  { value: 'av1', label: 'AV1' },
];

const preferredFpsOptions: { value: PreferredFps; labelKey: string }[] = [
  { value: 'original', labelKey: 'frameRateOriginal' },
  { value: '30', labelKey: 'frameRate30' },
];

const youtubeContentTypeOptions: YoutubeChannelContentType[] = [
  'videos',
  'shorts',
  'streams',
  'videos_shorts',
];

type ChannelSettingsBarProps = {
  quality: Quality;
  format: Format;
  videoCodec: VideoCodec;
  preferredFps: PreferredFps;
  isAudioMode: boolean;
  onQualityChange: (q: Quality) => void;
  onFormatChange: (f: Format) => void;
  onVideoCodecChange: (c: VideoCodec) => void;
  onPreferredFpsChange: (fps: PreferredFps) => void;
  onAudioModeToggle: () => void;
  outputPath: string;
  onSelectFolder: () => void;
  youtubeContentType?: YoutubeChannelContentType;
  onYoutubeContentTypeChange?: (value: YoutubeChannelContentType) => void;
  showYoutubeContentType?: boolean;
  disabled?: boolean;
};

export function ChannelSettingsBar({
  quality,
  format,
  videoCodec,
  preferredFps,
  isAudioMode,
  onQualityChange,
  onFormatChange,
  onVideoCodecChange,
  onPreferredFpsChange,
  onAudioModeToggle,
  outputPath,
  onSelectFolder,
  youtubeContentType,
  onYoutubeContentTypeChange,
  showYoutubeContentType,
  disabled,
}: ChannelSettingsBarProps) {
  const { t } = useTranslation('channels');
  const formatOptions = isAudioMode ? audioFormatOptions : videoFormatOptions;
  const currentVideoQuality = isAudioMode ? '1080' : quality;
  const outputFolderName = outputPath ? outputPath.split('/').pop() || outputPath : '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center p-0.5 rounded-lg bg-muted/50 border border-border/50">
        <button
          type="button"
          onClick={() => isAudioMode && onAudioModeToggle()}
          disabled={disabled}
          className={cn(
            'h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
            !isAudioMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FileVideo className="w-3.5 h-3.5" />
          Video
        </button>
        <button
          type="button"
          onClick={() => !isAudioMode && onAudioModeToggle()}
          disabled={disabled}
          className={cn(
            'h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
            isAudioMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Music className="w-3.5 h-3.5" />
          Audio
        </button>
      </div>

      {!isAudioMode && (
        <Select
          value={currentVideoQuality}
          onValueChange={(value) => onQualityChange(value as Quality)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[85px] h-9 text-xs bg-card/50 border-border/50">
            <SelectValue>
              {videoQualityOptions.find((option) => option.value === currentVideoQuality)?.short ||
                'Best'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[180px]">
            {videoQualityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={format}
        onValueChange={(value) => onFormatChange(value as Format)}
        disabled={disabled}
      >
        <SelectTrigger className="w-[75px] h-9 text-xs bg-card/50 border-border/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {formatOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isAudioMode && (
        <Select
          value={videoCodec}
          onValueChange={(value) => onVideoCodecChange(value as VideoCodec)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[80px] h-9 text-xs bg-card/50 border-border/50">
            <SelectValue>
              {videoCodecOptions.find((option) => option.value === videoCodec)?.label || 'Auto'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {videoCodecOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!isAudioMode && (
        <div className="flex items-center gap-1.5">
          <Select
            value={preferredFps}
            onValueChange={(value) => onPreferredFpsChange(value as PreferredFps)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[118px] h-9 text-xs bg-card/50 border-border/50">
              <SelectValue>
                {t(
                  preferredFpsOptions.find((option) => option.value === preferredFps)?.labelKey ||
                    'frameRateOriginal',
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {preferredFpsOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('frameRateHint')}
                  className="inline-flex text-muted-foreground hover:text-foreground"
                  disabled={disabled}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56">
                {t('frameRateHint')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {showYoutubeContentType && youtubeContentType && onYoutubeContentTypeChange && (
        <YoutubeContentTypeSelect
          value={youtubeContentType}
          onChange={onYoutubeContentTypeChange}
          disabled={disabled}
        />
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onSelectFolder}
        disabled={disabled}
        className="h-9 px-2.5 rounded-md border bg-card/50 border-border/50 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors max-w-[180px]"
        title={outputPath || 'Select download folder'}
      >
        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{outputFolderName || 'Select Folder'}</span>
      </button>
    </div>
  );
}

type YoutubeContentTypeSelectProps = {
  value: YoutubeChannelContentType;
  onChange: (value: YoutubeChannelContentType) => void;
  disabled?: boolean;
};

export function YoutubeContentTypeSelect({
  value,
  onChange,
  disabled,
}: YoutubeContentTypeSelectProps) {
  const { t } = useTranslation('channels');

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as YoutubeChannelContentType)}
      disabled={disabled}
    >
      <SelectTrigger className="w-[135px] h-9 text-xs bg-card/50 border-border/50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {youtubeContentTypeOptions.map((option) => (
          <SelectItem key={option} value={option} className="text-xs">
            {t(`youtubeContentTypes.${option}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
