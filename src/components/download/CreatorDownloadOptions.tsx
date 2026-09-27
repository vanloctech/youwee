import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  loadCreatorProcessingSettings,
  pickCreatorFolder,
  saveCreatorProcessingSettings,
} from '@/lib/creator-processing';
import type { CreatorProcessingSettings } from '@/lib/types';

export function CreatorDownloadOptions({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation('channels');
  const [settings, setSettings] = useState(loadCreatorProcessingSettings);

  const update = (patch: Partial<CreatorProcessingSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveCreatorProcessingSettings(next);
      return next;
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 p-2">
      <span className="px-1 text-xs font-medium">{t('creator.title')}</span>
      <select
        aria-label={t('creator.title')}
        value={settings.mode}
        disabled={disabled}
        onChange={(event) =>
          update({ mode: event.target.value as CreatorProcessingSettings['mode'] })
        }
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="none">{t('creator.none')}</option>
        <option value="duet">{t('creator.duet')}</option>
        <option value="portrait">{t('creator.portrait')}</option>
        <option value="parts">{t('creator.parts')}</option>
      </select>
      {settings.mode === 'duet' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={async () => {
            const folder = await pickCreatorFolder(settings.rightFolder || undefined);
            if (folder) update({ rightFolder: folder });
          }}
          title={settings.rightFolder}
        >
          {settings.rightFolder ? t('creator.changeRight') : t('creator.selectRight')}
        </Button>
      )}
      {settings.mode === 'parts' && (
        <>
          <select
            aria-label={t('creator.splitByDuration')}
            value={settings.splitBy}
            disabled={disabled}
            onChange={(event) =>
              update({ splitBy: event.target.value === 'count' ? 'count' : 'duration' })
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="duration">{t('creator.splitByDuration')}</option>
            <option value="count">{t('creator.splitByCount')}</option>
          </select>
          <label
            htmlFor="creator-part-size"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            {settings.splitBy === 'count' ? t('creator.partCount') : t('creator.partSeconds')}
            <Input
              id="creator-part-size"
              type="number"
              min={1}
              value={settings.splitBy === 'count' ? settings.partCount : settings.partSeconds}
              disabled={disabled}
              onChange={(event) =>
                settings.splitBy === 'count'
                  ? update({ partCount: Math.max(1, Number(event.target.value)) })
                  : update({ partSeconds: Math.max(1, Number(event.target.value)) })
              }
              className="h-8 w-20"
            />
          </label>
        </>
      )}
      {settings.mode !== 'none' && (
        <select
          aria-label="Video encoder"
          value={settings.encoder}
          disabled={disabled}
          onChange={(event) =>
            update({ encoder: event.target.value as CreatorProcessingSettings['encoder'] })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="libx264">CPU x264</option>
          <option value="h264_nvenc">NVIDIA NVENC</option>
          <option value="h264_qsv">Intel Quick Sync</option>
          <option value="h264_amf">AMD AMF</option>
        </select>
      )}
    </div>
  );
}
