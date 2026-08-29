import { Check, Palette, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { fixGaps, fixLineBreaking, fixLongDuration, fixShortDuration } from '@/lib/subtitle-fixes';
import {
  getSubtitleStyleProfile,
  SUBTITLE_STYLE_PROFILES,
  type SubtitleStyleProfileId,
} from '@/lib/subtitle-style-profiles';
import { cn } from '@/lib/utils';

interface SubtitleStyleProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SubtitleStyleProfileDialog({ open, onClose }: SubtitleStyleProfileDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [selectedProfileId, setSelectedProfileId] = useState<SubtitleStyleProfileId>(
    subtitle.styleProfileId,
  );
  const [fontName, setFontName] = useState(subtitle.assStyle.fontName);
  const [fontSize, setFontSize] = useState(subtitle.assStyle.fontSize);
  const [appliedCount, setAppliedCount] = useState(0);
  const commonFonts = [
    'Arial',
    'Helvetica',
    'Verdana',
    'Tahoma',
    'Times New Roman',
    'Georgia',
    'Noto Sans',
    'Roboto',
    'Inter',
  ];
  const customFontValue = '__custom_font__';

  useEffect(() => {
    if (!open) return;
    setSelectedProfileId(subtitle.styleProfileId);
    setFontName(subtitle.assStyle.fontName);
    setFontSize(subtitle.assStyle.fontSize);
    setAppliedCount(0);
  }, [open, subtitle.styleProfileId, subtitle.assStyle.fontName, subtitle.assStyle.fontSize]);

  const selectedProfile = useMemo(
    () => getSubtitleStyleProfile(selectedProfileId),
    [selectedProfileId],
  );

  const applyProfileOnly = () => {
    subtitle.setStyleProfile(selectedProfileId);
    setAppliedCount(0);
  };

  const applyProfileRules = () => {
    subtitle.setStyleProfile(selectedProfileId);
    const thresholds = selectedProfile.thresholds;
    let result = [...subtitle.entries];
    result = fixLineBreaking(result, thresholds.maxCpl);
    result = fixShortDuration(result, thresholds.minDurationMs);
    result = fixLongDuration(result, thresholds.maxDurationMs);
    result = fixGaps(result, thresholds.minGapMs, thresholds.minDurationMs);

    let changed = 0;
    for (let i = 0; i < subtitle.entries.length; i++) {
      const before = subtitle.entries[i];
      const after = result[i];
      if (!after) continue;
      if (
        before.text !== after.text ||
        before.startTime !== after.startTime ||
        before.endTime !== after.endTime
      ) {
        changed += 1;
      }
    }

    if (changed > 0) {
      subtitle.replaceAllEntries(result, `Apply style profile: ${selectedProfileId}`);
    }
    setAppliedCount(changed);
  };

  const applyFontSettings = () => {
    subtitle.setAssStyle({
      fontName,
      fontSize,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[760px] max-w-[92vw] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('styleProfiles.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{t('styleProfiles.description')}</p>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
            <div>
              <p className="text-sm font-medium">{t('styleProfiles.fontTitle')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('styleProfiles.fontDescription')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-end">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">{t('styleProfiles.fontPreset')}</p>
                <Select
                  value={
                    commonFonts.find(
                      (font) => font.toLowerCase() === fontName.trim().toLowerCase(),
                    ) || customFontValue
                  }
                  onValueChange={(value) => {
                    if (value === customFontValue) return;
                    setFontName(value);
                  }}
                >
                  <SelectTrigger className="h-9 rounded-lg border border-border/70 bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commonFonts.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                    <SelectItem value={customFontValue}>{t('styleProfiles.customFont')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="subtitle-ass-font-name"
                  className="text-[11px] text-muted-foreground"
                >
                  {t('styleProfiles.fontName')}
                </label>
                <input
                  id="subtitle-ass-font-name"
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border/70 bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="subtitle-ass-font-size"
                  className="text-[11px] text-muted-foreground"
                >
                  {t('styleProfiles.fontSize')}
                </label>
                <input
                  id="subtitle-ass-font-size"
                  type="number"
                  min={8}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full h-9 rounded-lg border border-border/70 bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={applyFontSettings}
                className="px-3.5 py-2 text-sm rounded-lg border border-border/60 hover:bg-accent transition-colors"
              >
                {t('styleProfiles.applyFont')}
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {SUBTITLE_STYLE_PROFILES.map((profile) => {
              const isActive = selectedProfileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={cn(
                    'text-start rounded-xl border px-3 py-2.5 transition-colors',
                    isActive
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/60 hover:bg-accent/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t(profile.labelKey)}</span>
                    {isActive && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(profile.descriptionKey)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                    CPS {profile.thresholds.maxCps} · WPM {profile.thresholds.maxWpm} · CPL{' '}
                    {profile.thresholds.maxCpl} · GAP {profile.thresholds.minGapMs}ms
                  </p>
                </button>
              );
            })}
          </div>

          {appliedCount > 0 && (
            <div className="text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {t('styleProfiles.appliedResult', { count: appliedCount })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('styleProfiles.affects')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyProfileOnly}
              className="px-3.5 py-2 text-sm rounded-lg border border-border/60 hover:bg-accent transition-colors"
            >
              {t('styleProfiles.useForQcOnly')}
            </button>
            <button
              type="button"
              onClick={applyProfileRules}
              className="px-3.5 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('styleProfiles.applyNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
