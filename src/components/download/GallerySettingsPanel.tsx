import { FolderOpen, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export interface GallerySettingsPanelSettings {
  outputPath: string;
  concurrentDownloads: number;
  range: string;
  filenameTemplate: string;
  flatOutput: boolean;
  cbzOutput: boolean;
  rateLimit: string;
  minFileSize: string;
  maxFileSize: string;
  sleep: string;
  retries: number;
  timeout: number;
}

interface GallerySettingsPanelProps {
  settings: GallerySettingsPanelSettings;
  disabled?: boolean;
  onSelectFolder: () => Promise<void>;
  onConcurrentChange: (concurrent: number) => void;
  onSettingsChange: (patch: Partial<GallerySettingsPanelSettings>) => void;
}

export function GallerySettingsPanel({
  settings,
  disabled,
  onSelectFolder,
  onConcurrentChange,
  onSettingsChange,
}: GallerySettingsPanelProps) {
  const { t } = useTranslation('gallery');
  const outputFolderName = settings.outputPath
    ? settings.outputPath.split('/').pop() || settings.outputPath
    : t('settings.notSelected');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void onSelectFolder()}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 h-9 text-xs text-foreground transition-colors hover:bg-card"
        title={settings.outputPath || t('settings.selectFolder')}
      >
        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="max-w-[180px] truncate">{outputFolderName}</span>
      </button>
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
          <div className="px-4 py-3 border-b bg-muted/30">
            <h4 className="text-sm font-medium">{t('settings.advanced')}</h4>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                {t('settings.parallelDownloads')}
              </Label>
              <Select
                value={String(settings.concurrentDownloads || 1)}
                onValueChange={(value) => onConcurrentChange(Number(value))}
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

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">{t('settings.range')}</Label>
              <Input
                value={settings.range}
                onChange={(e) => onSettingsChange({ range: e.target.value })}
                placeholder={t('settings.rangeHint')}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                {t('settings.filenameTemplate')}
              </Label>
              <Input
                value={settings.filenameTemplate}
                onChange={(e) => onSettingsChange({ filenameTemplate: e.target.value })}
                placeholder={t('settings.filenameHint')}
                disabled={disabled}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.flatOutput')}
                </Label>
                <Switch
                  checked={settings.flatOutput}
                  onCheckedChange={(checked) => onSettingsChange({ flatOutput: checked })}
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.cbzOutput')}
                </Label>
                <Switch
                  checked={settings.cbzOutput}
                  onCheckedChange={(checked) => onSettingsChange({ cbzOutput: checked })}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.minFileSize')}
                </Label>
                <Input
                  value={settings.minFileSize}
                  onChange={(e) => onSettingsChange({ minFileSize: e.target.value })}
                  placeholder="10k"
                  disabled={disabled}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.maxFileSize')}
                </Label>
                <Input
                  value={settings.maxFileSize}
                  onChange={(e) => onSettingsChange({ maxFileSize: e.target.value })}
                  placeholder="50M"
                  disabled={disabled}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {t('settings.rateLimit')}
                </Label>
                <Input
                  value={settings.rateLimit}
                  onChange={(e) => onSettingsChange({ rateLimit: e.target.value })}
                  placeholder="1M"
                  disabled={disabled}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t('settings.sleep')}</Label>
                <Input
                  value={settings.sleep}
                  onChange={(e) => onSettingsChange({ sleep: e.target.value })}
                  placeholder="0.5"
                  disabled={disabled}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t('settings.retries')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={String(settings.retries)}
                  onChange={(e) => onSettingsChange({ retries: Number(e.target.value) || 0 })}
                  disabled={disabled}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t('settings.timeout')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={String(settings.timeout)}
                  onChange={(e) => onSettingsChange({ timeout: Number(e.target.value) || 0 })}
                  disabled={disabled}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
