import { 
  FolderOpen,
  ListVideo,
  FileVideo,
  Music,
  Settings2,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { Quality, Format, DownloadSettings, VideoCodec, AudioBitrate } from '@/lib/types';
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

const qualityOptions: { value: Quality; label: string; shortLabel: string }[] = [
  { value: 'best', label: 'Best Available', shortLabel: 'Best' },
  { value: '8k', label: '8K Ultra HD — 7680 × 4320', shortLabel: '8K' },
  { value: '4k', label: '4K Ultra HD — 3840 × 2160', shortLabel: '4K' },
  { value: '2k', label: '2K Quad HD — 2560 × 1440', shortLabel: '2K' },
  { value: '1080', label: 'Full HD — 1920 × 1080', shortLabel: '1080p' },
  { value: '720', label: 'HD — 1280 × 720', shortLabel: '720p' },
  { value: '480', label: 'SD — 854 × 480', shortLabel: '480p' },
  { value: '360', label: 'Low — 640 × 360', shortLabel: '360p' },
  { value: 'audio', label: 'Audio Only', shortLabel: 'Audio' },
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

interface SettingsPanelProps {
  settings: DownloadSettings;
  disabled?: boolean;
  totalFileSize?: number;
  onQualityChange: (quality: Quality) => void;
  onFormatChange: (format: Format) => void;
  onVideoCodecChange: (codec: VideoCodec) => void;
  onAudioBitrateChange: (bitrate: AudioBitrate) => void;
  onConcurrentChange: (concurrent: number) => void;
  onPlaylistLimitChange: (limit: number) => void;
  onPlaylistToggle: () => void;
  onSelectFolder: () => void;
}

export function SettingsPanel({
  settings,
  disabled,
  totalFileSize,
  onQualityChange,
  onFormatChange,
  onVideoCodecChange,
  onAudioBitrateChange,
  onConcurrentChange,
  onPlaylistLimitChange,
  onPlaylistToggle,
  onSelectFolder,
}: SettingsPanelProps) {
  const isAudioOnly = settings.quality === 'audio' || ['mp3', 'm4a', 'opus'].includes(settings.format);
  const formatOptions = isAudioOnly ? audioFormatOptions : videoFormatOptions;

  const fileSizeDisplay = totalFileSize && totalFileSize > 0 
    ? formatFileSize(totalFileSize) 
    : '';

  const handleQualityChange = (quality: Quality) => {
    onQualityChange(quality);
    if (quality === 'audio' && !['mp3', 'm4a', 'opus'].includes(settings.format)) {
      onFormatChange('mp3');
    }
    if (quality !== 'audio' && ['mp3', 'm4a', 'opus'].includes(settings.format)) {
      onFormatChange('mp4');
    }
  };

  const outputFolderName = settings.outputPath 
    ? settings.outputPath.split('/').pop() || settings.outputPath
    : 'Downloads';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Quality Select */}
      <Select
        value={settings.quality}
        onValueChange={handleQualityChange}
        disabled={disabled}
      >
        <SelectTrigger 
          className="w-[90px] sm:w-[100px] h-9 text-xs bg-card/50 border-border/50"
          title="Video quality"
        >
          <div className="flex items-center gap-1.5">
            {isAudioOnly ? <Music className="w-3.5 h-3.5" /> : <FileVideo className="w-3.5 h-3.5" />}
            <span>{qualityOptions.find(q => q.value === settings.quality)?.shortLabel}</span>
          </div>
        </SelectTrigger>
        <SelectContent className="min-w-[220px]">
          {qualityOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Format Select */}
      <Select
        value={settings.format}
        onValueChange={onFormatChange}
        disabled={disabled}
      >
        <SelectTrigger 
          className="w-[75px] sm:w-[80px] h-9 text-xs bg-card/50 border-border/50"
          title="Output format"
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

      {/* Playlist Toggle */}
      <button
        onClick={onPlaylistToggle}
        disabled={disabled}
        title={settings.downloadPlaylist ? "Playlist mode ON" : "Playlist mode OFF"}
        className={cn(
          "h-9 px-2.5 rounded-md border text-xs flex items-center gap-1.5 transition-colors",
          settings.downloadPlaylist 
            ? "bg-primary/10 border-primary/30 text-primary" 
            : "bg-card/50 border-border/50 text-muted-foreground hover:text-foreground"
        )}
      >
        <ListVideo className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">Playlist</span>
      </button>

      {/* Advanced Settings Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-9 px-2.5 gap-1.5" 
            disabled={disabled}
            title="Advanced settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">More</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-80 p-0" 
          align="end"
          side="bottom"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h4 className="text-sm font-medium">Advanced Settings</h4>
            {fileSizeDisplay && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <HardDrive className="w-3 h-3" />
                {fileSizeDisplay}
              </Badge>
            )}
          </div>
          
          {/* Content - Grid Layout */}
          <div className="p-4 space-y-4">
            {/* Row 1: Codec & Bitrate */}
            <div className="grid grid-cols-2 gap-3">
              {/* Video Codec */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {isAudioOnly ? 'Audio Codec' : 'Video Codec'}
                </Label>
                <Select
                  value={settings.videoCodec}
                  onValueChange={onVideoCodecChange}
                  disabled={disabled || isAudioOnly}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="h264" className="text-xs">H.264</SelectItem>
                    <SelectItem value="vp9" className="text-xs">VP9</SelectItem>
                    <SelectItem value="av1" className="text-xs">AV1</SelectItem>
                    <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Audio Bitrate */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Audio Bitrate</Label>
                <Select
                  value={settings.audioBitrate}
                  onValueChange={onAudioBitrateChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                    <SelectItem value="320" className="text-xs">320k</SelectItem>
                    <SelectItem value="256" className="text-xs">256k</SelectItem>
                    <SelectItem value="192" className="text-xs">192k</SelectItem>
                    <SelectItem value="128" className="text-xs">128k</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Concurrent & Playlist Limit */}
            <div className="grid grid-cols-2 gap-3">
              {/* Concurrent Downloads */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Parallel Downloads</Label>
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
                        {n} at a time
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Playlist Limit */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Playlist Limit</Label>
                <Select
                  value={String(settings.playlistLimit || 0)}
                  onValueChange={(v) => onPlaylistLimitChange(Number(v))}
                  disabled={disabled || !settings.downloadPlaylist}
                >
                  <SelectTrigger className={cn(
                    "h-8 text-xs",
                    !settings.downloadPlaylist && "opacity-50"
                  )}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0" className="text-xs">Unlimited</SelectItem>
                    <SelectItem value="5" className="text-xs">5 videos</SelectItem>
                    <SelectItem value="10" className="text-xs">10 videos</SelectItem>
                    <SelectItem value="20" className="text-xs">20 videos</SelectItem>
                    <SelectItem value="50" className="text-xs">50 videos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Playlist Toggle */}
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2.5">
                <ListVideo className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium">Download full playlist</span>
              </div>
              <Switch
                checked={settings.downloadPlaylist}
                onCheckedChange={onPlaylistToggle}
                disabled={disabled}
              />
            </div>

            {/* Output Folder */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Save to</Label>
              <button
                onClick={onSelectFolder}
                disabled={disabled}
                className="w-full h-8 px-3 rounded-md border bg-background text-xs flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1 text-muted-foreground">
                  {settings.outputPath || 'Select folder...'}
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
        onClick={onSelectFolder}
        disabled={disabled}
        className="h-9 px-2.5 rounded-md border bg-card/50 border-border/50 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors max-w-[140px]"
        title={`Output folder: ${settings.outputPath || 'Not selected'}`}
      >
        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate hidden xs:inline">{outputFolderName}</span>
      </button>

      {/* File Size Badge */}
      {fileSizeDisplay && (
        <Badge 
          variant="outline" 
          className="h-9 px-2.5 text-xs gap-1.5 hidden sm:flex"
          title="Total file size"
        >
          <HardDrive className="w-3.5 h-3.5" />
          {fileSizeDisplay}
        </Badge>
      )}
    </div>
  );
}
